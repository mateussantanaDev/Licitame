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
import { formatCurrency } from "@/lib/utils"
import { type Contract } from "@/lib/contracts-provider"
import { type Order } from "@/lib/orders-provider"
import { useReports } from "@/lib/reports-provider"
import { AlertTriangle, Download, FileText, CheckCircle2, Calendar, Package, DollarSign, Layers } from "lucide-react"

interface ContractExceededReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract
  contractOrders: Order[]
}

export function ContractExceededReportDialog({
  open,
  onOpenChange,
  contract,
  contractOrders,
}: ContractExceededReportDialogProps) {
  const { generateContractExtrapolationReport } = useReports()
  const [filterType, setFilterType] = useState<"exceeded_only" | "all">("exceeded_only")

  if (!contract) return null

  // Ordenar pedidos do mais antigo para o mais recente para acompanhamento cronológico da cota
  const sortedOrders = [...(contractOrders || [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Mapear cada item do contrato com o seu histórico de pedidos e cálculos de extrapolação
  const itemsReport = (contract.items || []).map((item) => {
    const quantity = item.quantity || 0
    const unitPrice = item.unitPrice || 0
    const originalTotalPrice = item.totalPrice || quantity * unitPrice
    const usedQuantity = item.usedQuantity || 0
    const totalUsedValue = usedQuantity * unitPrice

    const isExceeded = usedQuantity > quantity
    const exceededQuantity = Math.max(0, usedQuantity - quantity)
    const exceededValue = exceededQuantity * unitPrice

    // Mapear histórico dos pedidos para este item específico
    let cumulativeQty = 0
    const orderBreakdown: {
      orderId: string
      orderNumber: string
      orderDate: string
      requestedBy: string
      requestedFor: string
      quantityRequested: number
      valueRequested: number
      qtyBefore: number
      qtyAfter: number
      exceededInThisOrder: number
      exceededValueInThisOrder: number
      isExceedingOrder: boolean
    }[] = []

    sortedOrders.forEach((order) => {
      if (order.status === "cancelado") return

      const matchingItem = order.items?.find(
        (oi) => oi.contractItemId === item.id || oi.name === item.name
      )

      if (matchingItem && matchingItem.quantity > 0) {
        const qtyRequested = matchingItem.quantity
        const valRequested = matchingItem.totalPrice || qtyRequested * unitPrice
        const qtyBefore = cumulativeQty
        cumulativeQty += qtyRequested
        const qtyAfter = cumulativeQty

        let exceededInThisOrder = 0
        if (qtyAfter > quantity) {
          if (qtyBefore >= quantity) {
            exceededInThisOrder = qtyRequested
          } else {
            exceededInThisOrder = qtyAfter - quantity
          }
        }

        orderBreakdown.push({
          orderId: order.id,
          orderNumber: order.number,
          orderDate: order.date,
          requestedBy: order.requestedBy || "Não informado",
          requestedFor: order.requestedFor || "Geral",
          quantityRequested: qtyRequested,
          valueRequested: valRequested,
          qtyBefore,
          qtyAfter,
          exceededInThisOrder,
          exceededValueInThisOrder: exceededInThisOrder * unitPrice,
          isExceedingOrder: exceededInThisOrder > 0,
        })
      }
    })

    return {
      item,
      quantity,
      unitPrice,
      originalTotalPrice,
      usedQuantity,
      totalUsedValue,
      isExceeded,
      exceededQuantity,
      exceededValue,
      orderBreakdown,
    }
  })

  // Itens filtrados para exibição
  const displayedItems = filterType === "exceeded_only" 
    ? itemsReport.filter((i) => i.isExceeded) 
    : itemsReport

  // Totais globais dos itens excedidos
  const totalExceededItemsCount = itemsReport.filter((i) => i.isExceeded).length
  const totalExceededUnits = itemsReport.reduce((acc, i) => acc + i.exceededQuantity, 0)
  const totalExceededValueReais = itemsReport.reduce((acc, i) => acc + i.exceededValue, 0)
  const globalContractExceededValue = Math.max(0, contract.usedValue - contract.value)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  Relatório de Itens Excedidos
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Contrato Nº <span className="font-semibold text-foreground">{contract.number}</span> • {contract.company}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Resumo em Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 my-2">
          <Card className="bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Itens Extrapolados</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{totalExceededItemsCount}</p>
                <p className="text-[10px] text-muted-foreground">de {contract.items?.length || 0} itens no contrato</p>
              </div>
              <Package className="h-8 w-8 text-red-500/40" />
            </CardContent>
          </Card>

          <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Excesso em Unidades</p>
                <p className="text-xl font-bold text-amber-800 dark:text-amber-300">+{totalExceededUnits} un</p>
                <p className="text-[10px] text-muted-foreground">acima da cota contratada</p>
              </div>
              <Layers className="h-8 w-8 text-amber-500/40" />
            </CardContent>
          </Card>

          <Card className="bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Excesso em Reais (R$)</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{formatCurrency(totalExceededValueReais)}</p>
                <p className="text-[10px] text-muted-foreground">somatório do excesso dos itens</p>
              </div>
              <DollarSign className="h-8 w-8 text-red-500/40" />
            </CardContent>
          </Card>

          <Card className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Saldo Global Contratual</p>
                <p className={`text-xl font-bold ${globalContractExceededValue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {formatCurrency(contract.value - contract.usedValue)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {globalContractExceededValue > 0 ? "Teto financeiro excedido" : "Dentro do teto global"}
                </p>
              </div>
              <FileText className="h-8 w-8 text-slate-400/40" />
            </CardContent>
          </Card>
        </div>

        {/* Filtros de Visualização */}
        <div className="flex items-center justify-between border-b pb-2">
          <Tabs value={filterType} onValueChange={(val) => setFilterType(val as any)} className="w-full">
            <div className="flex items-center justify-between w-full">
              <TabsList className="h-9">
                <TabsTrigger value="exceeded_only" className="text-xs">
                  Apenas Itens Excedidos ({totalExceededItemsCount})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">
                  Todos os Itens ({contract.items?.length || 0})
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateContractExtrapolationReport(contract, contractOrders, "pdf")}
                  className="h-8 text-xs flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5 text-red-600" />
                  Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateContractExtrapolationReport(contract, contractOrders, "csv")}
                  className="h-8 text-xs flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  Baixar CSV
                </Button>
              </div>
            </div>
          </Tabs>
        </div>

        {/* Lista de Itens do Relatório */}
        <div className="space-y-4 py-2">
          {displayedItems.length === 0 ? (
            <div className="text-center py-10 border rounded-lg bg-gray-50 dark:bg-gray-900/50">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="font-semibold text-lg">Nenhum item extrapolado!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Todos os itens deste contrato estão sendo consumidos dentro da quantidade e orçamento autorizados.
              </p>
            </div>
          ) : (
            displayedItems.map(({ item, quantity, unitPrice, originalTotalPrice, usedQuantity, totalUsedValue, isExceeded, exceededQuantity, exceededValue, orderBreakdown }) => (
              <Card key={item.id} className={`overflow-hidden border ${isExceeded ? "border-red-300 dark:border-red-900 bg-red-50/20 dark:bg-red-950/10" : "border-slate-200"}`}>
                <div className={`p-4 border-b ${isExceeded ? "bg-red-100/50 dark:bg-red-900/20 border-red-200" : "bg-gray-50 dark:bg-gray-800/40"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base">{item.name}</h4>
                        {isExceeded ? (
                          <Badge variant="destructive" className="bg-red-600 font-bold">
                            EXTRAPOLADO (+{exceededQuantity} un)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
                            Dentro do Limite
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                    </div>

                    <div className="text-right flex sm:flex-col items-center sm:items-end justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Valor Unitário Original:</span>
                      <span className="font-mono font-bold text-sm">{formatCurrency(unitPrice)}</span>
                    </div>
                  </div>
                </div>

                <CardContent className="p-4 space-y-4">
                  {/* Tabela comparativa de Original vs Consumido vs Excesso */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-background p-3 rounded-lg border">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">1. Valor Original do Contrato</span>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Quantidade Original:</span>
                        <span className="font-semibold">{quantity} un</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Valor Total Original:</span>
                        <span className="font-semibold">{formatCurrency(originalTotalPrice)}</span>
                      </div>
                    </div>

                    <div className="space-y-1 border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">2. Total Pedido / Consumido</span>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Quantidade Pedida:</span>
                        <span className={`font-semibold ${isExceeded ? "text-red-600 font-bold" : ""}`}>{usedQuantity} un</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Valor Total Consumido:</span>
                        <span className={`font-semibold ${isExceeded ? "text-red-600 font-bold" : ""}`}>{formatCurrency(totalUsedValue)}</span>
                      </div>
                    </div>

                    <div className="space-y-1 border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-3 bg-red-50/50 dark:bg-red-950/30 p-2 rounded">
                      <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">3. Quanto Excedeu</span>
                      <div className="flex justify-between text-xs">
                        <span className="text-red-700 dark:text-red-300 font-medium">Excesso em Unidades:</span>
                        <span className="font-bold text-red-700 dark:text-red-300">
                          {exceededQuantity > 0 ? `+${exceededQuantity} un` : "0 un"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-red-700 dark:text-red-300 font-medium">Excesso em Reais (R$):</span>
                        <span className="font-bold text-red-700 dark:text-red-300">
                          {formatCurrency(exceededValue)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Histórico: Quando foi pedido */}
                  <div>
                    <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Quando foi pedido (Histórico de Pedidos deste Item)
                    </h5>

                    {orderBreakdown.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2 border rounded text-center">
                        Nenhum pedido foi registrado com este item.
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80 dark:bg-gray-800/50 text-[11px]">
                              <TableHead>Data do Pedido</TableHead>
                              <TableHead>Pedido Nº</TableHead>
                              <TableHead>Solicitante / Destino</TableHead>
                              <TableHead className="text-right">Qtd Pedida</TableHead>
                              <TableHead className="text-right">Valor do Pedido (R$)</TableHead>
                              <TableHead className="text-right">Situação da Cota</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orderBreakdown.map((orderItem) => (
                              <TableRow 
                                key={orderItem.orderId}
                                className={orderItem.isExceedingOrder ? "bg-red-50/80 dark:bg-red-950/30" : ""}
                              >
                                <TableCell className="font-medium text-xs">
                                  {new Date(orderItem.orderDate).toLocaleDateString("pt-BR")}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{orderItem.orderNumber}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="font-medium">{orderItem.requestedBy}</div>
                                  <div className="text-[10px] text-muted-foreground">{orderItem.requestedFor}</div>
                                </TableCell>
                                <TableCell className="text-right font-medium text-xs">
                                  {orderItem.quantityRequested} un
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {formatCurrency(orderItem.valueRequested)}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {orderItem.isExceedingOrder ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                      Excesso: +{orderItem.exceededInThisOrder} un ({formatCurrency(orderItem.exceededValueInThisOrder)})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                      Dentro da cota
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between border-t pt-3 gap-2">
          <div className="text-xs text-muted-foreground">
            Extrapolações calculadas com base nas quantidades originais do contrato e histórico de pedidos.
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
