"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { formatCurrency } from "@/lib/utils"
import { type Contract } from "@/lib/contracts-provider"
import { type Order } from "@/lib/orders-provider"
import { useReports } from "@/lib/reports-provider"
import {
  FileText,
  Download,
  Search,
  Package,
  CheckCircle2,
  AlertTriangle,
  Layers,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Clock,
} from "lucide-react"

interface ContractItemsReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract
  contractOrders: Order[]
}

export function ContractItemsReportDialog({
  open,
  onOpenChange,
  contract,
  contractOrders,
}: ContractItemsReportDialogProps) {
  const { generateContractItemsReport } = useReports()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "exhausted" | "exceeded">("all")
  const [activeTab, setActiveTab] = useState<"items" | "orders">("items")
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  if (!contract) return null

  // Ordenar pedidos por data (cronológico)
  const sortedOrders = [...(contractOrders || [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Mapear cada item com histórico de pedidos e cálculos de saldo
  const itemsReport = (contract.items || []).map((item) => {
    const totalQty = item.quantity || 0
    const unitPrice = item.unitPrice || 0
    const totalContractValue = item.totalPrice || totalQty * unitPrice
    const usedQty = item.usedQuantity || 0
    const totalUsedValue = usedQty * unitPrice

    const availableQty = totalQty - usedQty
    const isExceeded = usedQty > totalQty
    const isExhausted = totalQty > 0 && usedQty === totalQty
    const isAvailable = availableQty > 0
    const balanceValue = availableQty * unitPrice
    const usedPercentage = totalQty > 0 ? Math.round((usedQty / totalQty) * 100) : 0

    // Rastrear histórico de pedidos específicos para este item
    let cumulativeQty = 0
    const orderBreakdown: {
      orderId: string
      orderNumber: string
      orderDate: string
      requestedBy: string
      requestedFor: string
      quantityRequested: number
      valueRequested: number
      cumulativeQtyAfter: number
      balanceAfter: number
    }[] = []

    sortedOrders.forEach((order) => {
      if (order.status === "cancelado") return

      const matchingItem = order.items?.find(
        (oi) => oi.contractItemId === item.id || oi.name === item.name
      )

      if (matchingItem && matchingItem.quantity > 0) {
        const qtyRequested = matchingItem.quantity
        const valRequested = matchingItem.totalPrice || qtyRequested * unitPrice
        cumulativeQty += qtyRequested

        orderBreakdown.push({
          orderId: order.id,
          orderNumber: order.number,
          orderDate: order.date,
          requestedBy: order.requestedBy || "Não informado",
          requestedFor: order.requestedFor || "Geral",
          quantityRequested: qtyRequested,
          valueRequested: valRequested,
          cumulativeQtyAfter: cumulativeQty,
          balanceAfter: totalQty - cumulativeQty,
        })
      }
    })

    return {
      item,
      totalQty,
      unitPrice,
      totalContractValue,
      usedQty,
      totalUsedValue,
      availableQty,
      balanceValue,
      isExceeded,
      isExhausted,
      isAvailable,
      usedPercentage,
      orderBreakdown,
    }
  })

  // Totais consolidados
  const totalItemsCount = itemsReport.length
  const totalUnitsContract = itemsReport.reduce((acc, i) => acc + i.totalQty, 0)
  const totalUnitsUsed = itemsReport.reduce((acc, i) => acc + i.usedQty, 0)
  const totalUnitsAvailable = itemsReport.reduce((acc, i) => acc + Math.max(0, i.availableQty), 0)
  const totalContractVal = itemsReport.reduce((acc, i) => acc + i.totalContractValue, 0) || contract.value
  const totalUsedVal = itemsReport.reduce((acc, i) => acc + i.totalUsedValue, 0) || contract.usedValue
  const totalBalanceVal = contract.value - contract.usedValue

  const availableCount = itemsReport.filter((i) => i.isAvailable).length
  const exhaustedCount = itemsReport.filter((i) => i.isExhausted).length
  const exceededCount = itemsReport.filter((i) => i.isExceeded).length
  const activeOrders = sortedOrders.filter((o) => o.status !== "cancelado")

  // Filtragem dos itens por termo de busca e status
  const filteredItems = itemsReport.filter((itemData) => {
    const matchesSearch =
      itemData.item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (itemData.item.description || "").toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (statusFilter === "available") return itemData.isAvailable
    if (statusFilter === "exhausted") return itemData.isExhausted
    if (statusFilter === "exceeded") return itemData.isExceeded
    return true
  })

  const toggleExpand = (itemId: string) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  Relatório Geral de Itens do Contrato
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Contrato Nº <span className="font-semibold text-foreground">{contract.number}</span> • {contract.company}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateContractItemsReport(contract, contractOrders, "pdf")}
                className="h-8 text-xs flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateContractItemsReport(contract, contractOrders, "csv")}
                className="h-8 text-xs flex items-center gap-1.5 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar CSV
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 my-2">
          <Card className="bg-muted/30 border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Total de Itens</p>
                <Package className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <p className="text-lg font-bold mt-1">{totalItemsCount}</p>
              <p className="text-[10px] text-muted-foreground">itens cadastrados</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Quantidades (un)</p>
                <Layers className="h-4 w-4 text-blue-500/70" />
              </div>
              <p className="text-lg font-bold mt-1">{totalUnitsContract} un</p>
              <p className="text-[10px] text-muted-foreground">
                {totalUnitsUsed} usadas • <span className="font-semibold text-emerald-600">{totalUnitsAvailable} disp.</span>
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Valor Contratado</p>
                <DollarSign className="h-4 w-4 text-primary/70" />
              </div>
              <p className="text-lg font-bold mt-1 font-mono">{formatCurrency(totalContractVal)}</p>
              <p className="text-[10px] text-muted-foreground">teto financeiro do contrato</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Valor Utilizado</p>
                <ShoppingCart className="h-4 w-4 text-amber-500/70" />
              </div>
              <p className="text-lg font-bold mt-1 font-mono">{formatCurrency(totalUsedVal)}</p>
              <p className="text-[10px] text-muted-foreground">
                {contract.value > 0 ? Math.round((contract.usedValue / contract.value) * 100) : 0}% consumido
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30 border col-span-2 lg:col-span-1">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Saldo Restante</p>
                <Clock className="h-4 w-4 text-emerald-500/70" />
              </div>
              <p className={`text-lg font-bold mt-1 font-mono ${totalBalanceVal < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatCurrency(totalBalanceVal)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {totalBalanceVal < 0 ? "Teto extrapolado" : `${activeOrders.length} pedido(s) realizados`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Abas e Barra de Filtros */}
        <div className="space-y-3 border-t pt-3">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <TabsList className="h-9">
                <TabsTrigger value="items" className="text-xs flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Demonstrativo de Itens ({itemsReport.length})
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Histórico de Pedidos ({activeOrders.length})
                </TabsTrigger>
              </TabsList>

              {activeTab === "items" && (
                <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar item..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8 pl-8 text-xs bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sub-filtros por Status quando na aba de Itens */}
            {activeTab === "items" && (
              <div className="flex items-center gap-1.5 pt-2 overflow-x-auto">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  className="h-7 text-xs rounded-full px-3"
                >
                  Todos ({itemsReport.length})
                </Button>
                <Button
                  variant={statusFilter === "available" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("available")}
                  className={`h-7 text-xs rounded-full px-3 ${statusFilter !== "available" ? "text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400" : ""}`}
                >
                  Disponíveis ({availableCount})
                </Button>
                <Button
                  variant={statusFilter === "exhausted" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("exhausted")}
                  className={`h-7 text-xs rounded-full px-3 ${statusFilter !== "exhausted" ? "text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400" : ""}`}
                >
                  Esgotados ({exhaustedCount})
                </Button>
                {exceededCount > 0 && (
                  <Button
                    variant={statusFilter === "exceeded" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("exceeded")}
                    className={`h-7 text-xs rounded-full px-3 ${statusFilter !== "exceeded" ? "text-red-700 border-red-200 hover:bg-red-50 dark:text-red-400" : ""}`}
                  >
                    Excedidos ({exceededCount})
                  </Button>
                )}
              </div>
            )}

            {/* Conteúdo Aba 1: Demonstrativo de Itens */}
            <TabsContent value="items" className="mt-3 space-y-2">
              <div className="rounded-lg border overflow-x-auto bg-background">
                <Table className="text-xs min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 h-9">
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="min-w-[180px]">Item</TableHead>
                      <TableHead className="text-right w-24">Unitário</TableHead>
                      <TableHead className="text-center w-24">Qtd Total</TableHead>
                      <TableHead className="text-center w-24">Qtd Usada</TableHead>
                      <TableHead className="text-center w-28 font-bold">Qtd Disp.</TableHead>
                      <TableHead className="text-right w-28">Valor Total</TableHead>
                      <TableHead className="text-right w-28">Valor Usado</TableHead>
                      <TableHead className="text-right w-32 font-bold">Saldo (R$)</TableHead>
                      <TableHead className="w-24 text-center">Consumo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Nenhum item encontrado com os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((itemData) => {
                        const isExpanded = expandedItemId === itemData.item.id
                        const hasOrders = itemData.orderBreakdown.length > 0

                        return (
                          <>
                            <TableRow
                              key={itemData.item.id}
                              className={`h-10 transition-colors cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`}
                              onClick={() => toggleExpand(itemData.item.id)}
                            >
                              <TableCell className="p-2 text-center">
                                {hasOrders ? (
                                  isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )
                                ) : (
                                  <span className="text-muted-foreground/30">•</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="font-semibold text-foreground">{itemData.item.name}</div>
                                {itemData.item.description && (
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                    {itemData.item.description}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {formatCurrency(itemData.unitPrice)}
                              </TableCell>
                              <TableCell className="text-center font-mono font-medium">
                                {itemData.totalQty} un
                              </TableCell>
                              <TableCell className="text-center font-mono">
                                {itemData.usedQty} un
                              </TableCell>
                              <TableCell className="text-center font-mono">
                                {itemData.isExceeded ? (
                                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                    +{itemData.usedQty - itemData.totalQty} un
                                  </Badge>
                                ) : itemData.isExhausted ? (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-amber-700 bg-amber-50 border-amber-300">
                                    0 un
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-emerald-700 bg-emerald-50 border-emerald-300">
                                    {itemData.availableQty} un
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(itemData.totalContractValue)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {formatCurrency(itemData.totalUsedValue)}
                              </TableCell>
                              <TableCell className={`text-right font-mono font-bold ${itemData.balanceValue < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                {itemData.balanceValue < 0
                                  ? `- ${formatCurrency(Math.abs(itemData.balanceValue))}`
                                  : formatCurrency(itemData.balanceValue)}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-1.5">
                                  <Progress
                                    value={Math.min(100, itemData.usedPercentage)}
                                    className={`h-2 w-14 ${itemData.isExceeded ? "[&>div]:bg-red-600" : ""}`}
                                  />
                                  <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">
                                    {itemData.usedPercentage}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* Detalhamento expandido com os pedidos deste item */}
                            {isExpanded && (
                              <TableRow className="bg-muted/15">
                                <TableCell colSpan={10} className="p-3">
                                  <div className="bg-background rounded-md border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h5 className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                                        <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                                        Pedidos que consumiram o item "{itemData.item.name}" ({itemData.orderBreakdown.length})
                                      </h5>
                                      <span className="text-[11px] text-muted-foreground">
                                        Total pedido: <strong>{itemData.usedQty} un</strong> ({formatCurrency(itemData.totalUsedValue)})
                                      </span>
                                    </div>

                                    {itemData.orderBreakdown.length === 0 ? (
                                      <p className="text-xs text-muted-foreground italic py-2">
                                        Nenhum pedido foi realizado para este item até o momento.
                                      </p>
                                    ) : (
                                      <div className="rounded border overflow-x-auto">
                                        <Table className="text-[11px]">
                                          <TableHeader>
                                            <TableRow className="bg-muted/40 h-7">
                                              <TableHead className="py-1">Data</TableHead>
                                              <TableHead className="py-1">Nº do Pedido</TableHead>
                                              <TableHead className="py-1">Solicitante / Destino</TableHead>
                                              <TableHead className="py-1 text-right">Qtd Pedida</TableHead>
                                              <TableHead className="py-1 text-right">Valor do Pedido (R$)</TableHead>
                                              <TableHead className="py-1 text-right">Consumo Acumulado</TableHead>
                                              <TableHead className="py-1 text-right">Saldo Pós-Pedido</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {itemData.orderBreakdown.map((ob) => (
                                              <TableRow key={ob.orderId} className="h-7">
                                                <TableCell className="py-1 font-mono">
                                                  {new Date(ob.orderDate).toLocaleDateString("pt-BR")}
                                                </TableCell>
                                                <TableCell className="py-1 font-mono font-medium">
                                                  {ob.orderNumber}
                                                </TableCell>
                                                <TableCell className="py-1">
                                                  <span className="font-medium">{ob.requestedBy}</span>
                                                  <span className="text-muted-foreground text-[10px] ml-1">({ob.requestedFor})</span>
                                                </TableCell>
                                                <TableCell className="py-1 text-right font-mono font-bold">
                                                  {ob.quantityRequested} un
                                                </TableCell>
                                                <TableCell className="py-1 text-right font-mono text-muted-foreground">
                                                  {formatCurrency(ob.valueRequested)}
                                                </TableCell>
                                                <TableCell className="py-1 text-right font-mono">
                                                  {ob.cumulativeQtyAfter} un
                                                </TableCell>
                                                <TableCell className={`py-1 text-right font-mono font-semibold ${ob.balanceAfter < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                  {ob.balanceAfter < 0 ? `+${Math.abs(ob.balanceAfter)} un exced.` : `${ob.balanceAfter} un`}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Conteúdo Aba 2: Histórico Consolidado de Pedidos */}
            <TabsContent value="orders" className="mt-3 space-y-2">
              <div className="rounded-lg border overflow-x-auto bg-background">
                <Table className="text-xs min-w-[750px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 h-9">
                      <TableHead className="py-1">Data</TableHead>
                      <TableHead className="py-1">Nº Pedido</TableHead>
                      <TableHead className="py-1">Solicitante</TableHead>
                      <TableHead className="py-1">Destino</TableHead>
                      <TableHead className="py-1 text-center">Itens</TableHead>
                      <TableHead className="py-1 text-right">Valor Total (R$)</TableHead>
                      <TableHead className="py-1 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhum pedido registrado para este contrato.
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeOrders.map((order) => {
                        const totalUnitsInOrder = order.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0
                        return (
                          <TableRow key={order.id} className="h-9">
                            <TableCell className="font-mono text-muted-foreground">
                              {new Date(order.date).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="font-mono font-bold text-foreground">
                              {order.number}
                            </TableCell>
                            <TableCell className="font-medium">
                              {order.requestedBy || "Não informado"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {order.requestedFor || "Geral"}
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {totalUnitsInOrder} un ({order.items?.length || 0} prod.)
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-foreground">
                              {formatCurrency(order.totalValue || 0)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={
                                  order.status === "concluido"
                                    ? "default"
                                    : order.status === "pendente"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-[10px] capitalize"
                              >
                                {order.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between border-t pt-3 gap-2">
          <div className="text-xs text-muted-foreground">
            Clique sobre qualquer item da tabela para visualizar o histórico de pedidos correspondente.
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
