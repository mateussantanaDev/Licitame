"use client"

import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from "react"
import { useContracts } from "@/lib/contracts-provider"
import { ValidationLogger } from "./validation/validation-logger"
import {
  isFirebaseConfigured,
  getAllDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  COLLECTIONS,
} from "@/lib/firebase"

export type OrderItem = {
  id: string
  contractItemId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type Order = {
  id: string
  number: string
  contractId: string
  contractNumber: string
  date: string
  requestedBy: string
  requestedByDepartment: string
  requestedFor: string
  items: OrderItem[]
  totalValue: number
  status: "rascunho" | "pendente" | "em separação" | "realizado" | "entregue" | "concluído" | "cancelado"
  deliveryDate?: string
  priority?: "low" | "medium" | "high"
  notes?: string
  deliveryNote?: {
    number: string
    date: string
    items: {
      id: string
      orderItemId: string
      quantity: number
      unitPrice: number
      totalPrice: number
    }[]
    totalValue: number
    verified: boolean
    matchesOrder: boolean
  }
}

type OrdersContextType = {
  orders: Order[]
  isLoading: boolean
  addOrder: (order: Omit<Order, "id" | "number">) => Promise<void>
  updateOrder: (id: string, order: Partial<Order>) => void
  deleteOrder: (id: string) => void
  getOrderById: (id: string) => Order | undefined
  addDeliveryNote: (orderId: string, deliveryNote: Order["deliveryNote"]) => void
  verifyDeliveryNote: (orderId: string, matches: boolean) => void
  approveOrder: (orderId: string) => void
  rejectOrder: (orderId: string, reason: string) => void
  exportData: () => void
  importData: (data: Order[]) => Promise<boolean>
  notifyNewOrder: (order: Order) => void
  notifyStatusChange: (order: Order, oldStatus: string) => void
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined)

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { updateContractUsage, updateContractItemUsage, recalculateContractBalances } = useContracts()

  useEffect(() => {
    loadFromFirestore()
  }, [])

  useEffect(() => {
    if (orders.length > 0 && recalculateContractBalances) {
      recalculateContractBalances(orders)
    }
  }, [orders, recalculateContractBalances])

  const loadFromFirestore = async () => {
    try {
      if (isFirebaseConfigured()) {
        const data = await getAllDocuments<Order>(COLLECTIONS.ORDERS)
        setOrders(data)
        ValidationLogger.log({
          level: "success",
          dataType: "orders",
          action: "load",
          message: `${data.length} pedidos carregados do Firebase`,
          metadata: { count: data.length },
        })
      }
    } catch (error) {
      ValidationLogger.log({
        level: "error",
        dataType: "orders",
        action: "load",
        message: "Erro ao carregar pedidos",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      })
    } finally {
      setIsLoading(false)
    }
  }

  const notifyNewOrder = useCallback((order: Order) => {}, [])
  const notifyStatusChange = useCallback((order: Order, oldStatus: string) => {}, [])

  const addOrder = async (order: Omit<Order, "id" | "number">) => {
    try {
      const orderNumber = `PED-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, "0")}`

      const newOrder: Order = {
        ...order,
        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        number: orderNumber,
      }

      if (isFirebaseConfigured()) {
        const { id, ...orderData } = newOrder
        const firebaseId = await addDocument(COLLECTIONS.ORDERS, orderData)
        if (firebaseId) {
          newOrder.id = firebaseId
        }
      }

      setOrders((prev) => [...prev, newOrder])
      updateContractUsage(order.contractId, order.totalValue)
      order.items.forEach((item) => {
        updateContractItemUsage(order.contractId, item.contractItemId, item.quantity)
      })
      notifyNewOrder(newOrder)

      ValidationLogger.log({
        level: "success",
        dataType: "orders",
        action: "create",
        message: `Pedido "${orderNumber}" criado com sucesso`,
        metadata: { id: newOrder.id, number: orderNumber },
      })
    } catch (error) {
      ValidationLogger.log({
        level: "error",
        dataType: "orders",
        action: "create",
        message: "Erro ao criar pedido",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      })
      throw error
    }
  }

  const updateOrder = (id: string, orderUpdate: Partial<Order>) => {
    const orderToUpdate = orders.find(o => o.id === id)
    
    if (!orderToUpdate) return

    // Verificar mudanças de status ou de itens que afetam o saldo do contrato
    const wasActive = orderToUpdate.status !== "cancelado"
    const isNowActive = (orderUpdate.status ?? orderToUpdate.status) !== "cancelado"

    const itemsChanged = orderUpdate.items !== undefined
    const totalValueChanged = orderUpdate.totalValue !== undefined
    const statusChanged = orderUpdate.status !== undefined && orderToUpdate.status !== orderUpdate.status

    if (statusChanged || itemsChanged || totalValueChanged) {
      // 1. Reverter o saldo antigo se o pedido estava ativo
      if (wasActive) {
        updateContractUsage(orderToUpdate.contractId, -orderToUpdate.totalValue)
        orderToUpdate.items.forEach((item) => {
          updateContractItemUsage(orderToUpdate.contractId, item.contractItemId, -(item.quantity ?? 0))
        })
      }

      // 2. Aplicar o novo saldo se o pedido está ativo agora
      if (isNowActive) {
        const finalItems = orderUpdate.items ?? orderToUpdate.items
        const finalTotalValue = orderUpdate.totalValue ?? orderToUpdate.totalValue
        updateContractUsage(orderToUpdate.contractId, finalTotalValue)
        finalItems.forEach((item) => {
          updateContractItemUsage(orderToUpdate.contractId, item.contractItemId, item.quantity ?? 0)
        })
      }
    }

    if (orderUpdate.status && orderToUpdate.status !== orderUpdate.status) {
      notifyStatusChange({ ...orderToUpdate, ...orderUpdate }, orderToUpdate.status)
    }

    if (isFirebaseConfigured()) {
      updateDocument(COLLECTIONS.ORDERS, id, orderUpdate)
    }

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id === id) {
          return { ...order, ...orderUpdate }
        }
        return order
      }),
    )
  }

  const deleteOrder = (id: string) => {
    const orderToDelete = orders.find(o => o.id === id)
    
    // Reverter o valor do contrato se o pedido estava ativo (não cancelado)
    if (orderToDelete && orderToDelete.status !== "cancelado") {
      updateContractUsage(orderToDelete.contractId, -orderToDelete.totalValue)
      orderToDelete.items.forEach((item) => {
        updateContractItemUsage(orderToDelete.contractId, item.contractItemId, -(item.quantity ?? 0))
      })
    }

    if (isFirebaseConfigured()) {
      deleteDocument(COLLECTIONS.ORDERS, id)
    }
    setOrders((prev) => prev.filter((order) => order.id !== id))
  }

  const getOrderById = (id: string) => orders.find((order) => order.id === id)

  const addDeliveryNote = (orderId: string, deliveryNote: Order["deliveryNote"]) => {
    const update = { deliveryNote, status: "em separação" as const }
    if (isFirebaseConfigured()) {
      updateDocument(COLLECTIONS.ORDERS, orderId, update)
    }
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, ...update } : order)),
    )
  }

  const verifyDeliveryNote = (orderId: string, matches: boolean) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id === orderId && order.deliveryNote) {
          const updatedOrder = {
            ...order,
            deliveryNote: { ...order.deliveryNote, verified: true, matchesOrder: matches },
            status: (matches ? "concluido" : "pendente") as Order["status"],
          }
          if (isFirebaseConfigured()) {
            updateDocument(COLLECTIONS.ORDERS, orderId, {
              deliveryNote: updatedOrder.deliveryNote,
              status: updatedOrder.status,
            })
          }
          return updatedOrder
        }
        return order
      }),
    )
  }

  const approveOrder = (orderId: string) => updateOrder(orderId, { status: "em separação" })
  const rejectOrder = (orderId: string, reason: string) => updateOrder(orderId, { status: "cancelado", notes: reason })

  const exportData = () => {
    try {
      const dataStr = JSON.stringify(orders, null, 2)
      const dataBlob = new Blob([dataStr], { type: "application/json" })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = `pedidos-${new Date().toISOString().split("T")[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Erro ao exportar pedidos:", error)
    }
  }

  const importData = async (data: Order[]): Promise<boolean> => {
    try {
      setOrders(data)
      return true
    } catch {
      return false
    }
  }

  return (
    <OrdersContext.Provider
      value={{
        orders,
        isLoading,
        addOrder,
        updateOrder,
        deleteOrder,
        getOrderById,
        addDeliveryNote,
        verifyDeliveryNote,
        approveOrder,
        rejectOrder,
        exportData,
        importData,
        notifyNewOrder,
        notifyStatusChange,
      }}
    >
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (context === undefined) {
    throw new Error("useOrders deve ser usado dentro de um OrdersProvider")
  }
  return context
}
