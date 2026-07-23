"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useContracts } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useProducts } from "@/lib/products-provider"
import {
  isFirebaseConfigured,
  getAllDocuments,
  addDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  COLLECTIONS,
} from "@/lib/firebase"

export type NotificationType =
  | "warning"
  | "expiration"
  | "info"
  | "order"
  | "approval"
  | "delivery"
  | "success"
  | "stock"

export type NotificationPriority = "low" | "medium" | "high"

export type Notification = {
  id: string
  title: string
  message: string
  type: NotificationType
  priority?: NotificationPriority
  read: boolean
  date: string
  link?: string
  entityId?: string
}

type NotificationsContextType = {
  notifications: Notification[]
  unreadCount: number
  pendingNotifications: Notification[]
  isPanelOpen: boolean
  setIsPanelOpen: (open: boolean) => void
  addNotification: (notification: Omit<Notification, "read" | "date"> & { id?: string }) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  clearAllNotifications: () => void
  getNotificationsByType: (type: NotificationType) => Notification[]
  getUnreadCountByType: (type: NotificationType) => number
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const { contracts } = useContracts()
  const { orders, notifyNewOrder, notifyStatusChange } = useOrders()
  const { products } = useProducts()

  // Load notifications from Firestore
  useEffect(() => {
    const loadNotifications = async () => {
      if (isFirebaseConfigured()) {
        try {
          const data = await getAllDocuments<Notification>(COLLECTIONS.NOTIFICATIONS)
          if (data.length > 0) {
            setNotifications(data)
          }
        } catch (error) {
          console.error("Erro ao carregar notificacoes:", error)
        }
      }
    }
    loadNotifications()
  }, [])

  useEffect(() => {
    if (contracts.length > 0 || orders.length > 0 || products.length > 0) {
      generateNotifications()
    }

    const intervalId = setInterval(() => {
      if (contracts.length > 0 || orders.length > 0 || products.length > 0) {
        generateNotifications()
      }
    }, 5 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [contracts, orders, products])

  useEffect(() => {
    if (notifyNewOrder && notifyStatusChange) {
      // @ts-ignore
      notifyNewOrder.current = (order: any) => {
        addNotification({
          title: "Novo pedido criado",
          message: `Pedido ${order.number} foi criado e esta aguardando processamento.`,
          type: "order",
          entityId: order.id,
          link: `/dashboard/pedidos/${order.id}`,
          priority: order.priority === "high" ? "high" : "medium",
        })
      }

      // @ts-ignore
      notifyStatusChange.current = (order: any, oldStatus: string) => {
        if (order.status === "em separação" && oldStatus === "pendente") {
          addNotification({
            title: "Pedido aprovado",
            message: `O pedido ${order.number} foi aprovado e esta em separação.`,
            type: "success",
            entityId: order.id,
            link: `/dashboard/pedidos/${order.id}`,
          })
        } else if (order.status === "concluido") {
          addNotification({
            title: "Pedido concluido",
            message: `O pedido ${order.number} foi concluido com sucesso.`,
            type: "success",
            entityId: order.id,
            link: `/dashboard/pedidos/${order.id}`,
          })
        } else if (order.status === "cancelado") {
          addNotification({
            title: "Pedido cancelado",
            message: `O pedido ${order.number} foi cancelado.`,
            type: "warning",
            entityId: order.id,
            link: `/dashboard/pedidos/${order.id}`,
          })
        }
      }
    }
  }, [notifyNewOrder, notifyStatusChange])

  const generateNotifications = () => {
    checkContractsStatus()
    checkOrdersStatus(orders)
    checkProductsStock()
  }

  const checkContractsStatus = () => {
    if (!contracts || contracts.length === 0) return

    const now = new Date()
    const in30Days = new Date()
    in30Days.setDate(now.getDate() + 30)
    const in60Days = new Date()
    in60Days.setDate(now.getDate() + 60)

    contracts.forEach((contract) => {
      const expirationDate = new Date(contract.expirationDate)
      const notificationId = `contract-expiration-${contract.id}`

      if (notifications.some((n) => n.id === notificationId)) return

      if (expirationDate > now && expirationDate < in30Days) {
        const daysToExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        addNotification({
          id: notificationId,
          title: "Contrato expirando em breve",
          message: `O contrato ${contract.number} com ${contract.company} vence em ${daysToExpiration} dias.`,
          type: "expiration",
          priority: "high",
          entityId: contract.id,
          link: `/dashboard/contratos/${contract.id}`,
        })
      } else if (expirationDate > in30Days && expirationDate < in60Days) {
        const daysToExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        addNotification({
          id: notificationId,
          title: "Contrato proximo do vencimento",
          message: `O contrato ${contract.number} com ${contract.company} vence em ${daysToExpiration} dias.`,
          type: "warning",
          priority: "medium",
          entityId: contract.id,
          link: `/dashboard/contratos/${contract.id}`,
        })
      }

      if (contract.usedPercentage >= 80) {
        const usageNotificationId = `contract-usage-${contract.id}`
        if (!notifications.some((n) => n.id === usageNotificationId)) {
          addNotification({
            id: usageNotificationId,
            title: "Uso elevado de contrato",
            message: `O contrato ${contract.number} ja utilizou ${contract.usedPercentage}% do valor total.`,
            type: "warning",
            priority: contract.usedPercentage >= 95 ? "high" : "medium",
            entityId: contract.id,
            link: `/dashboard/contratos/${contract.id}`,
          })
        }
      }
    })
  }

  const checkOrdersStatus = (ordersData: any[]) => {
    if (!ordersData || ordersData.length === 0) return

    const now = new Date()
    const in3Days = new Date()
    in3Days.setDate(now.getDate() + 3)

    ordersData.forEach((order) => {
      const approvalNotificationId = `order-approval-${order.id}`
      
      if (order.status === "pendente") {
        // Adicionar notificação se o pedido está pendente
        if (!notifications.some((n) => n.id === approvalNotificationId)) {
          addNotification({
            id: approvalNotificationId,
            title: "Pedido aguardando aprovacao",
            message: `O pedido ${order.number} esta aguardando aprovacao.`,
            type: "approval",
            priority: "high",
            entityId: order.id,
            link: `/dashboard/pedidos/${order.id}`,
          })
        }
      } else {
        // Remover notificação se o pedido NÃO está mais pendente
        if (notifications.some((n) => n.id === approvalNotificationId)) {
          if (isFirebaseConfigured()) {
            try {
              deleteDocument(COLLECTIONS.NOTIFICATIONS, approvalNotificationId)
            } catch (err) {
              console.error("Erro ao deletar notificação:", err)
            }
          }
          setNotifications((prev) => prev.filter((n) => n.id !== approvalNotificationId))
        }
      }

      if (order.deliveryDate) {
        const deliveryDate = new Date(order.deliveryDate)
        const deliveryNotificationId = `order-delivery-${order.id}`

        if (
          deliveryDate > now &&
          deliveryDate < in3Days &&
          order.status !== "concluido" &&
          !notifications.some((n) => n.id === deliveryNotificationId)
        ) {
          const daysToDelivery = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          addNotification({
            id: deliveryNotificationId,
            title: "Entrega proxima",
            message: `O pedido ${order.number} tem entrega prevista em ${daysToDelivery} dia(s).`,
            type: "delivery",
            priority: "medium",
            entityId: order.id,
            link: `/dashboard/pedidos/${order.id}`,
          })
        }
      }
    })
  }

  const checkProductsStock = () => {
    if (!products || products.length === 0) return

    products.forEach((product) => {
      if (product.currentStock <= product.minStock) {
        const stockNotificationId = `product-stock-${product.id}`
        if (!notifications.some((n) => n.id === stockNotificationId)) {
          addNotification({
            id: stockNotificationId,
            title: "Estoque baixo",
            message: `O produto ${product.name} esta com estoque baixo (${product.currentStock} ${product.unit}).`,
            type: "stock",
            priority: "high",
            entityId: product.id,
            link: "/dashboard/produtos",
          })
        }
      }
    })
  }

  const addNotification = (notification: Omit<Notification, "read" | "date"> & { id?: string }) => {
    const newNotification: Notification = {
      ...notification,
      id: notification.id || Date.now().toString(),
      read: false,
      date: new Date().toISOString(),
    }

    setNotifications((prev) => {
      const isDuplicate = prev.some((n) => n.id === newNotification.id)
      if (isDuplicate) return prev

      // Save to Firestore
      if (isFirebaseConfigured()) {
        try {
          setDocument(COLLECTIONS.NOTIFICATIONS, newNotification.id, newNotification)
        } catch (err) {
          console.error("Erro ao salvar notificacao no Firebase:", err)
        }
      }

      return [newNotification, ...prev]
    })
  }

  const markAsRead = (id: string) => {
    if (isFirebaseConfigured()) {
      try {
        updateDocument(COLLECTIONS.NOTIFICATIONS, id, { read: true })
      } catch (err) {
        console.error("Erro ao marcar notificacao como lida:", err)
      }
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
  }

  const markAllAsRead = () => {
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (!n.read && isFirebaseConfigured()) {
          try {
            updateDocument(COLLECTIONS.NOTIFICATIONS, n.id, { read: true })
          } catch (err) {
            console.error("Erro ao marcar todas as notificacoes como lidas:", err)
          }
        }
      })
      return prev.map((n) => ({ ...n, read: true }))
    })
  }

  const deleteNotification = (id: string) => {
    if (isFirebaseConfigured()) {
      deleteDocument(COLLECTIONS.NOTIFICATIONS, id)
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const clearAllNotifications = () => {
    if (isFirebaseConfigured()) {
      notifications.forEach((n) => deleteDocument(COLLECTIONS.NOTIFICATIONS, n.id))
    }
    setNotifications([])
  }

  const toggleNotificationsPanel = () => setIsPanelOpen((prev) => !prev)
  const getNotificationsByType = (type: NotificationType) => notifications.filter((n) => n.type === type)
  const getUnreadCount = () => notifications.filter((n) => !n.read).length
  const getUnreadCountByType = (type: NotificationType) => notifications.filter((n) => !n.read && n.type === type).length
  const pendingNotifications = notifications.filter((n) => !n.read)

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        pendingNotifications,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        toggleNotificationsPanel,
        isPanelOpen,
        checkContractsStatus,
        checkOrdersStatus,
        checkProductsStock,
        generateNotifications,
        getNotificationsByType,
        getUnreadCount,
        getUnreadCountByType,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (context === undefined) {
    throw new Error("useNotifications deve ser usado dentro de um NotificationsProvider")
  }
  return context
}
