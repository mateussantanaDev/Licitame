"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrders, type Order, type OrderItem } from "@/lib/orders-provider"
import { useContracts } from "@/lib/contracts-provider"
import { useReports } from "@/lib/reports-provider"
import { useAuth } from "@/lib/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, FileText, FileCheck, AlertTriangle, CheckCircle2, Printer, Edit, Trash2, Plus, Minus, Save, X, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type OrderStatus = "rascunho" | "pendente" | "em separação" | "realizado" | "entregue" | "concluído" | "cancelado"

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: "default" | "secondary" | "destructive" | "outline" }[] = [
  { value: "rascunho", label: "Rascunho", color: "outline" },
  { value: "pendente", label: "Pendente", color: "secondary" },
  { value: "em separação", label: "Em Separação", color: "secondary" },
  { value: "realizado", label: "Realizado", color: "default" },
  { value: "entregue", label: "Entregue", color: "default" },
  { value: "concluído", label: "Concluído", color: "default" },
  { value: "cancelado", label: "Cancelado", color: "destructive" },
]

export default function PedidoDetalhesPage({ params }: { params: { id: string } }) {
  const { getOrderById, approveOrder, rejectOrder, updateOrder, deleteOrder } = useOrders()
  const { getContractById } = useContracts()
  const { generateOrderExtrapolationReport } = useReports()
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [order, setOrder] = useState<Order | null>(null)
  const [contractNumber, setContractNumber] = useState("")
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [showRejectionDialog, setShowRejectionDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectionError, setRejectionError] = useState("")
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // Estados de edição de Rascunho
  const [isEditing, setIsEditing] = useState(false)
  const [editedItems, setEditedItems] = useState<OrderItem[]>([])
  const [editedNotes, setEditedNotes] = useState("")
  const [editedPriority, setEditedPriority] = useState<"low" | "medium" | "high">("medium")
  const [editedRequestedBy, setEditedRequestedBy] = useState("")
  const [editedDepartment, setEditedDepartment] = useState("")
  const [editedDeliveryAddress, setEditedDeliveryAddress] = useState("")
  const [editedDeliveryDate, setEditedDeliveryDate] = useState<Date>(new Date())
  const [productSearchQuery, setProductSearchQuery] = useState("")
  const [showExtrapolationModal, setShowExtrapolationModal] = useState(false)
  const [pendingFinalize, setPendingFinalize] = useState(false)

  const isCompras = user?.role === "compras" || user?.role === "admin"

  const contract = getContractById(order?.contractId || "")

  const filteredContractItems = contract
    ? contract.items
        .filter((item) =>
          item.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(productSearchQuery.toLowerCase())
        )
        .sort((a, b) => {
          const aInOrder = editedItems.some((e) => e.contractItemId === a.id)
          const bInOrder = editedItems.some((e) => e.contractItemId === b.id)
          if (aInOrder && !bInOrder) return -1
          if (!aInOrder && bInOrder) return 1
          return 0
        })
    : []

  const startEditing = () => {
    if (!order) return
    setIsEditing(true)
    setEditedItems([...order.items])
    setEditedNotes(order.notes || "")
    setEditedPriority(order.priority || "medium")
    setEditedRequestedBy(order.requestedBy || "")
    setEditedDepartment(order.requestedByDepartment || "")
    setEditedDeliveryAddress(order.requestedFor || "")
    setEditedDeliveryDate(order.deliveryDate ? new Date(order.deliveryDate) : new Date())
    setProductSearchQuery("")
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const getItemMaxQuantity = (contractItemId: string) => {
    const cItem = contract?.items.find((item) => item.id === contractItemId)
    if (!cItem) return 0
    
    const originalItem = order?.items.find((item) => item.contractItemId === contractItemId)
    const originalQty = originalItem ? originalItem.quantity : 0
    
    return cItem.quantity - cItem.usedQuantity + originalQty
  }

  const handleUpdateItemQuantity = (contractItemId: string, qty: number) => {
    const finalQty = Math.max(0, qty)
    
    const existingItem = editedItems.find((item) => item.contractItemId === contractItemId)
    
    if (existingItem) {
      if (finalQty === 0) {
        // Remove item from order
        setEditedItems(editedItems.filter((item) => item.contractItemId !== contractItemId))
      } else {
        // Update quantity
        setEditedItems(
          editedItems.map((item) => {
            if (item.contractItemId === contractItemId) {
              return {
                ...item,
                quantity: finalQty,
                totalPrice: item.unitPrice * finalQty,
              }
            }
            return item
          })
        )
      }
    } else if (finalQty > 0) {
      // Add new item to order
      const cItem = contract?.items.find((item) => item.id === contractItemId)
      if (!cItem) return
      
      const newItem: OrderItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        contractItemId: cItem.id,
        name: cItem.name,
        quantity: finalQty,
        unitPrice: cItem.unitPrice,
        totalPrice: cItem.unitPrice * finalQty,
      }
      setEditedItems([...editedItems, newItem])
    }
  }

  const editedTotalValue = editedItems.reduce((acc, item) => acc + item.totalPrice, 0)
  const contractAvailableLimit = contract && order ? contract.value - contract.usedValue + order.totalValue : 0
  const isOverLimit = editedTotalValue > contractAvailableLimit

  const hasItemExtrapolation = editedItems.some((item) => {
    const maxAvailable = getItemMaxQuantity(item.contractItemId)
    return item.quantity > maxAvailable
  })
  const hasExtrapolation = isOverLimit || hasItemExtrapolation

  const handleSaveAttempt = (finalize: boolean) => {
    if (hasExtrapolation) {
      setPendingFinalize(finalize)
      setShowExtrapolationModal(true)
    } else {
      handleSave(finalize)
    }
  }

  const handleSave = async (finalize: boolean = false) => {
    if (!order) return
    
    try {
      const newStatus = finalize ? "pendente" : "rascunho"
      updateOrder(order.id, {
        items: editedItems,
        totalValue: editedTotalValue,
        notes: editedNotes,
        priority: editedPriority,
        requestedBy: editedRequestedBy,
        requestedByDepartment: editedDepartment,
        requestedFor: editedDeliveryAddress,
        deliveryDate: editedDeliveryDate.toISOString(),
        status: newStatus,
      })

      setOrder({
        ...order,
        items: editedItems,
        totalValue: editedTotalValue,
        notes: editedNotes,
        priority: editedPriority,
        requestedBy: editedRequestedBy,
        requestedByDepartment: editedDepartment,
        requestedFor: editedDeliveryAddress,
        deliveryDate: editedDeliveryDate.toISOString(),
        status: newStatus,
      } as Order)

      setIsEditing(false)
      
      toast({
        title: finalize ? "Pedido enviado com sucesso!" : "Rascunho salvo",
        description: finalize 
          ? "O pedido foi finalizado e enviado para pendente." 
          : "As alterações do rascunho foram salvas com sucesso.",
      })
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações do pedido.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteDraft = () => {
    if (!order) return
    if (window.confirm("Tem certeza que deseja excluir permanentemente este rascunho?")) {
      deleteOrder(order.id)
      toast({
        title: "Rascunho excluído",
        description: "O rascunho do pedido foi removido.",
      })
      router.push("/dashboard/pedidos")
    }
  }

  useEffect(() => {
    const foundOrder = getOrderById(params.id)
    if (foundOrder) {
      setOrder(foundOrder)

      // Buscar informações do contrato
      const contract = getContractById(foundOrder.contractId)
      if (contract) {
        setContractNumber(contract.number)
      }
    } else {
      router.push("/dashboard/pedidos")
    }
  }, [params.id, getOrderById, getContractById, router])

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  const orderId = order.id

  const handleApproveOrder = () => {
    approveOrder(orderId)
    setShowApprovalDialog(false)
  }

  const handleRejectOrder = () => {
    if (!rejectionReason) {
      setRejectionError("É necessário informar um motivo para a rejeição")
      return
    }

    rejectOrder(orderId, rejectionReason)
    setShowRejectionDialog(false)
    setRejectionReason("")
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order) return

    setIsUpdatingStatus(true)
    try {
      updateOrder(order.id, { status: newStatus })
      
      // Atualizar o estado local
      setOrder({ ...order, status: newStatus })

      toast({
        title: "Status atualizado",
        description: `O pedido foi marcado como ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label || newStatus}.`,
      })
    } catch (error) {
      toast({
        title: "Erro ao atualizar status",
        description: "Não foi possível atualizar o status do pedido.",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handlePrint = () => {
    router.push(`/dashboard/pedidos/${order?.id}/imprimir`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/pedidos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? (order.status === "rascunho" ? "Editar Rascunho do Pedido" : "Editar Pedido") : "Detalhes do Pedido"}
          </h1>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => handleSaveAttempt(false)}>
                <Save className="mr-2 h-4 w-4" />
                Salvar como Rascunho
              </Button>
              <Button onClick={() => handleSaveAttempt(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {order.status === "rascunho" ? "Finalizar Pedido" : "Salvar Alterações"}
              </Button>
            </>
          ) : (
            <>
              {contract && (
                <Button
                  variant="destructive"
                  onClick={() => generateOrderExtrapolationReport(order, contract)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Relatório de Extrapolação (PDF)
                </Button>
              )}
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              {(order.status === "rascunho" || order.status === "pendente") && (
                <Button variant="outline" onClick={startEditing}>
                  <Edit className="mr-2 h-4 w-4" />
                  {order.status === "rascunho" ? "Editar Rascunho" : "Editar Pedido"}
                </Button>
              )}
              {order.status === "rascunho" && (
                <Button variant="destructive" onClick={handleDeleteDraft}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir Rascunho
                </Button>
              )}
              {isCompras && order.status === "pendente" && !order.deliveryNote && (
                <Button onClick={() => router.push(`/dashboard/pedidos/${order.id}/nota-entrega`)}>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Registrar Nota de Entrega
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing && isOverLimit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle>Limite excedido!</AlertTitle>
          <AlertDescription>
            O valor total do pedido editado ({formatCurrency(editedTotalValue)}) excede o limite disponível do contrato ({formatCurrency(contractAvailableLimit)}).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações do Pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Número do Pedido</p>
                <p className="text-lg font-semibold">{order.number}</p>
              </div>
              <div>
                <Label htmlFor="status-select" className="text-sm font-medium text-muted-foreground">
                  Status
                </Label>
                {isEditing ? (
                  <div className="mt-1">
                    <Badge variant="outline" className="text-sm py-1.5 px-3 capitalize">
                      {order.status}
                    </Badge>
                  </div>
                ) : (
                  <Select value={order.status} onValueChange={(value) => handleStatusChange(value as OrderStatus)} disabled={isUpdatingStatus}>
                    <SelectTrigger id="status-select" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data do Pedido</p>
                <p className="text-lg font-semibold">{new Date(order.date).toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Contrato</p>
                <p className="text-lg font-semibold">
                  {isEditing ? (
                    <span className="text-base font-semibold">{order.contractNumber}</span>
                  ) : (
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => router.push(`/dashboard/contratos/${order.contractId}`)}
                    >
                      {order.contractNumber}
                    </Button>
                  )}
                </p>
              </div>
            </div>

            <Separator />

            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="requestedBy" className="text-sm font-medium text-muted-foreground">Solicitado por</Label>
                    <Input
                      id="requestedBy"
                      value={editedRequestedBy}
                      onChange={(e) => setEditedRequestedBy(e.target.value)}
                      placeholder="Nome do solicitante"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="department" className="text-sm font-medium text-muted-foreground">Departamento</Label>
                    <Input
                      id="department"
                      value={editedDepartment}
                      onChange={(e) => setEditedDepartment(e.target.value)}
                      placeholder="Departamento"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="requestedFor" className="text-sm font-medium text-muted-foreground">Destino / Endereço de Entrega</Label>
                  <Input
                    id="requestedFor"
                    value={editedDeliveryAddress}
                    onChange={(e) => setEditedDeliveryAddress(e.target.value)}
                    placeholder="Endereço ou destino"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-muted-foreground">Previsão de Entrega</Label>
                    <DatePicker
                      date={editedDeliveryDate}
                      setDate={(date) => date && setEditedDeliveryDate(date)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="priority" className="text-sm font-medium text-muted-foreground">Prioridade</Label>
                    <Select
                      value={editedPriority}
                      onValueChange={(value) => setEditedPriority(value as "low" | "medium" | "high")}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-sm font-medium text-muted-foreground">Observações</Label>
                  <Textarea
                    id="notes"
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    placeholder="Observações adicionais..."
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Solicitado por</p>
                    <p className="text-base">{order.requestedBy}</p>
                    <p className="text-xs text-muted-foreground">{order.requestedByDepartment}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Destino</p>
                    <p className="text-base">{order.requestedFor}</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Previsão de Entrega</p>
                    <p className="text-base">
                      {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("pt-BR") : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Prioridade</p>
                    <p className="text-base capitalize">
                      {order.priority === "low" ? "Baixa" : order.priority === "medium" ? "Média" : order.priority === "high" ? "Alta" : "-"}
                    </p>
                  </div>
                </div>

                {order.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Observações</p>
                      <p className="text-sm text-gray-700 whitespace-pre-line mt-1">{order.notes}</p>
                    </div>
                  </>
                )}
              </>
            )}

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(isEditing ? editedTotalValue : order.totalValue)}
              </p>
            </div>
          </CardContent>
        </Card>

        {order.deliveryNote && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Nota de Entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Número da Nota</p>
                  <p className="text-lg font-semibold">{order.deliveryNote.number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data da Entrega</p>
                  <p className="text-lg font-semibold">
                    {new Date(order.deliveryNote.date).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Total da Nota</p>
                <p className="text-xl font-bold mt-1">{formatCurrency(order.deliveryNote.totalValue)}</p>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Status da Verificação</p>
                {order.deliveryNote.verified ? (
                  <div
                    className={`flex items-center gap-2 p-3 rounded-md ${
                      order.deliveryNote.matchesOrder ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                    }`}
                  >
                    {order.deliveryNote.matchesOrder ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                        <p className="text-sm">Nota de entrega verificada e aprovada.</p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                        <p className="text-sm">Nota de entrega verificada com divergências.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-md">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">Nota de entrega pendente de verificação.</p>
                  </div>
                )}
              </div>

              {!order.deliveryNote.verified && isCompras && (
                <Button onClick={() => router.push(`/dashboard/pedidos/${order.id}/verificar-nota`)} className="w-full">
                  Verificar Nota de Entrega
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col space-y-2 pb-2">
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Itens do Pedido</CardTitle>
              <CardDescription>
                {isEditing 
                  ? "Selecione as quantidades para os itens do contrato neste pedido"
                  : "Lista de todos os itens incluídos neste pedido"}
              </CardDescription>
            </div>
          </div>
          {isEditing && (
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar produto pelo nome ou descrição..."
                className="pl-8"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  {isEditing && <TableHead>Qtd. Disponível</TableHead>}
                  <TableHead className={isEditing ? "" : "text-right"}>Quantidade</TableHead>
                  <TableHead className="text-right">Valor Unitário</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  {isEditing && <TableHead className="w-[100px] text-center">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isEditing ? (
                  filteredContractItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        Nenhum item correspondente encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContractItems.map((item) => {
                      const eItem = editedItems.find((p) => p.contractItemId === item.id)
                      const quantity = eItem?.quantity || 0
                      const totalPrice = item.unitPrice * quantity
                      const maxQty = getItemMaxQuantity(item.id)
                      const isItemExtrapolated = quantity > maxQty
                      const itemExcessQty = quantity - maxQty

                      return (
                        <TableRow key={item.id} className={quantity > 0 ? (isItemExtrapolated ? "bg-red-50/40 hover:bg-red-50/60" : "bg-blue-50/40 hover:bg-blue-50/60") : ""}>
                          <TableCell className="font-medium">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p>{item.name}</p>
                                {quantity > 0 && !isItemExtrapolated && (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] py-0 px-1.5 h-4 font-normal">
                                    No Pedido
                                  </Badge>
                                )}
                                {isItemExtrapolated && (
                                  <Badge variant="destructive" className="bg-red-600 text-white text-[10px] py-0 px-1.5 h-4 font-normal">
                                    Extrapolado (+{itemExcessQty})
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{item.description}</p>
                              {isItemExtrapolated && (
                                <p className="text-xs text-red-600 font-medium font-mono mt-0.5">
                                  Excesso: {formatCurrency(itemExcessQty * item.unitPrice)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                isItemExtrapolated
                                  ? "destructive"
                                  : maxQty > item.quantity * 0.5
                                    ? "default"
                                    : maxQty > 0
                                      ? "secondary"
                                      : "destructive"
                              }
                            >
                              {maxQty} de {item.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex w-32 items-center">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-r-none bg-transparent"
                                onClick={() => handleUpdateItemQuantity(item.id, quantity - 1)}
                                disabled={quantity === 0}
                                type="button"
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Input
                                type="number"
                                min="0"
                                value={quantity}
                                onChange={(e) => {
                                  const value = Number.parseInt(e.target.value) || 0
                                  handleUpdateItemQuantity(item.id, value)
                                }}
                                className="h-8 rounded-none border-x-0 text-center w-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-l-none bg-transparent"
                                onClick={() => handleUpdateItemQuantity(item.id, quantity + 1)}
                                type="button"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalPrice)}</TableCell>
                          <TableCell className="text-center">
                            {quantity > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive/90"
                                onClick={() => handleUpdateItemQuantity(item.id, 0)}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )
                ) : (
                  order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.totalPrice)}</TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow>
                  <TableCell colSpan={isEditing ? 4 : 3} className="text-right font-bold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold font-mono">
                    {formatCurrency(isEditing ? editedTotalValue : order.totalValue)}
                  </TableCell>
                  {isEditing && <TableCell></TableCell>}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {order.deliveryNote && (
        <Card>
          <CardHeader>
            <CardTitle>Comparação com Nota de Entrega</CardTitle>
            <CardDescription>Comparação entre os itens do pedido e os itens da nota de entrega</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd. Pedido</TableHead>
                    <TableHead className="text-right">Valor Unit. Pedido</TableHead>
                    <TableHead className="text-right">Qtd. Nota</TableHead>
                    <TableHead className="text-right">Valor Unit. Nota</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((orderItem) => {
                    const noteItem = order.deliveryNote?.items.find((item) => item.orderItemId === orderItem.id)
                    const quantityDiff = noteItem ? noteItem.quantity - orderItem.quantity : -orderItem.quantity
                    const priceDiff = noteItem
                      ? noteItem.unitPrice * noteItem.quantity - orderItem.unitPrice * orderItem.quantity
                      : -(orderItem.unitPrice * orderItem.quantity)

                    const hasDiscrepancy =
                      quantityDiff !== 0 || (noteItem && noteItem.unitPrice !== orderItem.unitPrice)

                    return (
                      <TableRow key={orderItem.id}>
                        <TableCell className="font-medium">{orderItem.name}</TableCell>
                        <TableCell className="text-right">{orderItem.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(orderItem.unitPrice)}</TableCell>
                        <TableCell className="text-right">{noteItem ? noteItem.quantity : "-"}</TableCell>
                        <TableCell className="text-right">
                          {noteItem ? formatCurrency(noteItem.unitPrice) : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right ${priceDiff !== 0 ? (priceDiff > 0 ? "text-red-600" : "text-amber-600") : ""}`}
                        >
                          {priceDiff !== 0 ? formatCurrency(priceDiff) : "-"}
                        </TableCell>
                        <TableCell>
                          {!noteItem ? (
                            <Badge variant="destructive">Não entregue</Badge>
                          ) : hasDiscrepancy ? (
                            <Badge variant="secondary">Divergente</Badge>
                          ) : (
                            <Badge variant="outline">Conforme</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-bold">
                      Diferença Total
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${
                        order.deliveryNote.totalValue !== order.totalValue
                          ? order.deliveryNote.totalValue > order.totalValue
                            ? "text-red-600"
                            : "text-amber-600"
                          : ""
                      }`}
                    >
                      {order.deliveryNote.totalValue !== order.totalValue
                        ? formatCurrency(order.deliveryNote.totalValue - order.totalValue)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {order.deliveryNote.totalValue === order.totalValue ? (
                        <Badge variant="outline">Conforme</Badge>
                      ) : (
                        <Badge variant="secondary">Divergente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Popup / Dialog de Alerta de Extrapolação ao Salvar Edição */}
      <AlertDialog open={showExtrapolationModal} onOpenChange={setShowExtrapolationModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              Aviso de Extrapolação dos Limites do Contrato
            </AlertDialogTitle>
            <AlertDialogDescription>
              As alterações efetuadas neste pedido ultrapassam os limites cadastrados no contrato {contractNumber}. É exigido legalmente a emissão do relatório de extrapolação.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {isOverLimit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
                <p className="font-semibold">Estouro no Saldo Financeiro do Contrato:</p>
                <p className="mt-1">
                  Valor Total do Pedido: <strong>{formatCurrency(editedTotalValue)}</strong> (Saldo Disponível: <strong>{formatCurrency(contractAvailableLimit)}</strong>)
                </p>
                <p className="text-xs text-red-700 font-bold mt-1">
                  Excesso Total: {formatCurrency(editedTotalValue - contractAvailableLimit)}
                </p>
              </div>
            )}

            {hasItemExtrapolation && (
              <div>
                <p className="font-semibold text-gray-800 mb-2">Itens Solicitados Além do Saldo de Itens:</p>
                <div className="rounded-md border max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qtd. Disponível</TableHead>
                        <TableHead className="text-right">Qtd. Solicitada</TableHead>
                        <TableHead className="text-right">Qtd. Extrapolada</TableHead>
                        <TableHead className="text-right">Valor Excedente (R$)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editedItems
                        .filter((item) => item.quantity > getItemMaxQuantity(item.contractItemId))
                        .map((item) => {
                          const avail = getItemMaxQuantity(item.contractItemId)
                          const excess = item.quantity - avail
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className="text-right">{avail}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right font-bold text-red-600">+{excess}</TableCell>
                              <TableCell className="text-right font-bold text-red-600 font-mono">
                                {formatCurrency(excess * item.unitPrice)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            {contract && (
              <Button
                variant="destructive"
                type="button"
                onClick={() => {
                  const tempOrder: Order = {
                    ...order,
                    items: editedItems,
                    totalValue: editedTotalValue,
                    notes: editedNotes,
                    priority: editedPriority,
                    requestedBy: editedRequestedBy,
                    requestedByDepartment: editedDepartment,
                    requestedFor: editedDeliveryAddress,
                    deliveryDate: editedDeliveryDate.toISOString(),
                  }
                  generateOrderExtrapolationReport(tempOrder, contract)
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                Baixar Relatório (PDF)
              </Button>
            )}
            <AlertDialogCancel onClick={() => setShowExtrapolationModal(false)}>Revisar Edição</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowExtrapolationModal(false)
                handleSave(pendingFinalize)
              }}
            >
              Confirmar e Salvar Pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
