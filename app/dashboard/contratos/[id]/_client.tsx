"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useContracts, type Contract, type ContractAddendum } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useReports } from "@/lib/reports-provider"
import { useAuth } from "@/lib/auth-provider"
import { formatCurrency, calculateDaysRemaining, calculateDaysExpired } from "@/lib/utils"
import { ArrowLeft, FileText, ShoppingCart, AlertTriangle, Clock, Edit, Trash2, ExternalLink, Plus } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useToast } from "@/hooks/use-toast"

export default function ContratoDetalhesPage({ params }: { params: { id: string } }) {
  const { getContractById, deleteContract, addBalanceAdjustment, addAddendum } = useContracts()
  const { orders } = useOrders()
  const { generateContractExtrapolationReport } = useReports()
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [contract, setContract] = useState<Contract | null>(null)
  const [contractOrders, setContractOrders] = useState<typeof orders>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showAddAdjustmentDialog, setShowAddAdjustmentDialog] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [adjustmentDescription, setAdjustmentDescription] = useState("")
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false)
  const [showAddAddendumDialog, setShowAddAddendumDialog] = useState(false)
  const [addendumType, setAddendumType] = useState<"vencimento" | "valor" | "produto" | "quantidade" | "outros">("vencimento")
  const [addendumNewValue, setAddendumNewValue] = useState("")
  const [addendumDescription, setAddendumDescription] = useState("")
  const [isSubmittingAddendum, setIsSubmittingAddendum] = useState(false)

  const isCompras = user?.role === "compras" || user?.role === "admin"

  useEffect(() => {
    const foundContract = getContractById(params.id)
    if (foundContract) {
      console.log(`[Detalhes] Carregando contrato:`, foundContract)
      console.log(`[Detalhes] Items do contrato:`, foundContract.items)
      setContract(foundContract)
    } else {
      router.push("/dashboard/contratos")
    }
  }, [params.id, getContractById, router])

  useEffect(() => {
    if (contract) {
      const filteredOrders = orders.filter((order) => order.contractId === contract.id)
      filteredOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setContractOrders(filteredOrders)
    }
  }, [contract, orders])

  const handleDelete = () => {
    setShowDeleteDialog(true)
  }

  const handleAddAdjustment = async () => {
    if (!contract || !adjustmentAmount || !adjustmentDescription.trim()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      })
      return
    }

    const amount = parseFloat(adjustmentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erro de validação",
        description: "O valor deve ser um número maior que zero.",
        variant: "destructive",
      })
      return
    }

    if (amount > contract.value - contract.usedValue) {
      toast({
        title: "Erro de validação",
        description: "O valor não pode exceder o saldo disponível do contrato.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingAdjustment(true)
    try {
      const success = await addBalanceAdjustment(contract.id, {
        amount,
        description: adjustmentDescription,
        date: new Date().toISOString(),
      })

      if (success) {
        toast({
          title: "Sucesso",
          description: "Ajuste de saldo adicionado com sucesso.",
        })
        setAdjustmentAmount("")
        setAdjustmentDescription("")
        setShowAddAdjustmentDialog(false)

        // Atualizar contrato
        const updatedContract = getContractById(contract.id)
        if (updatedContract) {
          setContract(updatedContract)
        }
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível adicionar o ajuste. Tente novamente.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao adicionar o ajuste.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingAdjustment(false)
    }
  }

  const handleAddAddendum = async () => {
    if (!contract || !addendumNewValue || !addendumDescription.trim()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingAddendum(true)
    try {
      const newValue = addendumType === "vencimento" ? addendumNewValue : parseFloat(addendumNewValue)
      
      if (addendumType === "valor" && (isNaN(newValue as number) || (newValue as number) <= 0)) {
        toast({
          title: "Erro de validação",
          description: "O valor deve ser um número maior que zero.",
          variant: "destructive",
        })
        setIsSubmittingAddendum(false)
        return
      }

      const success = await addAddendum(contract.id, {
        number: `${contract.number}-ADIT-${(contract.addendums?.length || 0) + 1}`,
        type: addendumType,
        originalValue: addendumType === "vencimento" ? contract.expirationDate : addendumType === "valor" ? contract.value : undefined,
        newValue: addendumType === "vencimento" ? new Date(addendumNewValue).toISOString() : newValue,
        description: addendumDescription,
        date: new Date().toISOString(),
      })

      if (success) {
        toast({
          title: "Sucesso",
          description: `Aditivo de ${addendumType} adicionado com sucesso.`,
        })
        setAddendumNewValue("")
        setAddendumDescription("")
        setShowAddAddendumDialog(false)

        // Atualizar contrato
        const updatedContract = getContractById(contract.id)
        if (updatedContract) {
          setContract(updatedContract)
        }
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível adicionar o aditivo. Tente novamente.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao adicionar o aditivo.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingAddendum(false)
    }
  }

  const confirmDelete = async () => {
    if (contract) {
      const success = await deleteContract(contract.id)
      if (success) {
        toast({
          title: "Contrato excluído",
          description: "O contrato foi excluído com sucesso.",
        })
        router.push("/dashboard/contratos")
      } else {
        toast({
          title: "Erro ao excluir contrato",
          description: "Não foi possível excluir o contrato. Tente novamente.",
          variant: "destructive",
        })
      }
    }
  }

  if (!contract) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  const daysRemaining = calculateDaysRemaining(contract.expirationDate)
  const daysExpired = calculateDaysExpired(contract.expirationDate)
  const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 60
  const isExpired = daysRemaining <= 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/contratos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Detalhes do Contrato</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/dashboard/contratos/editar/${contract.id}`)}>
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </Button>
          {isCompras && contract.status === "ativo" && (
            <Button onClick={() => router.push(`/dashboard/pedidos/novo?contrato=${contract.id}`)}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Fazer Pedido
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações do Contrato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Número</p>
                <p className="text-lg font-semibold">{contract.number}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Base de Custo</p>
                <p className="text-lg font-semibold">{contract.costBase}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Empresa</p>
                <p className="text-lg font-semibold">{contract.company}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge
                  className="mt-1"
                  variant={
                    contract.status === "ativo" ? "default" : contract.status === "vencido" ? "secondary" : contract.status === "expirado" ? "destructive" : "outline"
                  }
                >
                  {contract.status ? contract.status.charAt(0).toUpperCase() + contract.status.slice(1) : "Status Indefinido"}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data de Início</p>
                <p className="text-lg font-semibold">{new Date(contract.startDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data de Vencimento</p>
                <p
                  className={`text-lg font-semibold ${isExpiringSoon ? "text-amber-600" : isExpired ? "text-red-600" : ""}`}
                >
                  {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                  {isExpiringSoon && !isExpired && ` (${daysRemaining} dias)`}
                  {isExpired && ` (Vencido há ${daysExpired} dia${daysExpired !== 1 ? "s" : ""})`}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Descrição</p>
              <p className="text-base mt-1">{contract.description}</p>
            </div>

            {contract.driveLink && (
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm font-medium text-muted-foreground mb-2">Documento Original</p>
                <a
                  href={contract.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir no Google Drive
                </a>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Valor Utilizado</p>
                <p className="text-sm font-medium">
                  {formatCurrency(contract.usedValue)} de {formatCurrency(contract.value)}
                </p>
              </div>
              <Progress value={Math.min(100, contract.usedPercentage)} className={`h-2 ${contract.usedValue > contract.value ? "[&>div]:bg-red-600" : ""}`} />
              <div className="flex justify-between text-xs font-semibold">
                <span className={contract.usedPercentage > 100 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                  {contract.usedPercentage}% utilizado {contract.usedPercentage > 100 ? "(EXTRAPOLADO)" : ""}
                </span>
                <span className={contract.value - contract.usedValue < 0 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                  {contract.value - contract.usedValue < 0 
                    ? `Saldo Negativo: ${formatCurrency(contract.value - contract.usedValue)}`
                    : `${formatCurrency(contract.value - contract.usedValue)} disponível`}
                </span>
              </div>
            </div>

            {(contract.usedValue > contract.value || contract.items?.some(i => i.usedQuantity > i.quantity)) && (
              <div className="flex items-center gap-2 p-3 bg-red-100 border border-red-300 text-red-900 rounded-md">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 animate-pulse" />
                <div className="text-xs">
                  <p className="font-bold text-red-900">Extrapolação de Limites Detectada</p>
                  <p className="text-red-800">
                    O consumo deste contrato ultrapassou o teto ou a quantidade permitida por item. Baixe o relatório no botão acima para prestação de contas.
                  </p>
                </div>
              </div>
            )}

            {isExpiringSoon && !isExpired && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-md">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">Este contrato expira em {daysRemaining} dias.</p>
              </div>
            )}

            {isExpired && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-800 rounded-md">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">Este contrato está vencido há {daysExpired} dia{daysExpired !== 1 ? "s" : ""}.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Resumo de Utilização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
                <p className="text-lg font-semibold">{formatCurrency(contract.value)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Utilizado</p>
                <p className="text-lg font-semibold">{formatCurrency(contract.usedValue)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Disponível</p>
                <p className="text-lg font-semibold">{formatCurrency(contract.value - contract.usedValue)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Pedidos</p>
                <p className="text-lg font-semibold">{contractOrders.length}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Pedidos Recentes</p>
              {contractOrders.length === 0 ? (
                <p className="text-sm text-center py-4 border rounded-md">Nenhum pedido realizado</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contractOrders.slice(0, 5).map((order) => (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => router.push(`/dashboard/pedidos/${order.id}`)}
                        >
                          <TableCell className="font-medium">{order.number}</TableCell>
                          <TableCell>{new Date(order.date).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell>{formatCurrency(order.totalValue)}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                order.status === "concluído"
                                  ? "bg-green-100 text-green-800"
                                  : order.status === "pendente"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {contractOrders.length > 5 && (
                <Button
                  variant="link"
                  className="mt-2 p-0 h-auto"
                  onClick={() => router.push(`/dashboard/pedidos?contrato=${contract.id}`)}
                >
                  Ver todos os pedidos
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens do Contrato</CardTitle>
          <CardDescription>Lista de todos os itens incluídos neste contrato</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Utilizado</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead className="text-right">Valor Unitário</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!Array.isArray(contract.items) || contract.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <p className="text-sm text-gray-600">Nenhum item encontrado neste contrato.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  contract.items.map((item) => {
                    const isItemExceeded = item.usedQuantity > item.quantity
                    const excessQty = item.usedQuantity - item.quantity
                    const availableQty = item.quantity - item.usedQuantity

                    return (
                      <TableRow key={item.id} className={isItemExceeded ? "bg-red-50/60 hover:bg-red-50/80" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{item.name}</span>
                            {isItemExceeded && (
                              <Badge variant="destructive" className="bg-red-600 text-[10px] h-4 py-0 px-1 font-semibold">
                                Extrapolado (+{excessQty})
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className={`text-right font-medium ${isItemExceeded ? "text-red-600 font-bold" : ""}`}>
                          {item.usedQuantity}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${availableQty < 0 ? "text-red-600 font-bold" : ""}`}>
                          {availableQty < 0 ? `${availableQty} (Excesso: +${excessQty})` : availableQty}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.totalPrice)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Histórico de Pedidos</TabsTrigger>
          <TabsTrigger value="adjustments">Ajustes de Saldo</TabsTrigger>
          <TabsTrigger value="addendums">Aditivos</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Todos os Pedidos</CardTitle>
              <CardDescription>Histórico completo de pedidos realizados neste contrato</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Solicitante</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contractOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          Nenhum pedido realizado para este contrato.
                        </TableCell>
                      </TableRow>
                    ) : (
                      contractOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.number}</TableCell>
                          <TableCell>{new Date(order.date).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell>{order.requestedBy}</TableCell>
                          <TableCell>{order.requestedFor}</TableCell>
                          <TableCell>{formatCurrency(order.totalValue)}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                order.status === "concluído"
                                  ? "bg-green-100 text-green-800"
                                  : order.status === "pendente"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/dashboard/pedidos/${order.id}`)}
                            >
                              Detalhes
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Ajustes de Saldo</CardTitle>
                <CardDescription>Gerenciar ajustes manuais de consumo de saldo do contrato</CardDescription>
              </div>
              <Button onClick={() => setShowAddAdjustmentDialog(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Ajuste
              </Button>
            </CardHeader>
            <CardContent>
              {!contract?.balanceAdjustments || contract.balanceAdjustments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-600">Nenhum ajuste de saldo realizado ainda.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor Ajustado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contract.balanceAdjustments
                        .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime())
                        .map((adjustment) => (
                          <TableRow key={adjustment.id}>
                            <TableCell>
                              {new Date(adjustment.createdAt || adjustment.date).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell>{adjustment.description}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(adjustment.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-6 grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Ajustado</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency(
                      (contract?.balanceAdjustments || []).reduce((sum, adj) => sum + adj.amount, 0)
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Saldo Consumido</p>
                  <p className="text-lg font-semibold mt-1">{formatCurrency(contract?.usedValue || 0)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Saldo Disponível</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency((contract?.value || 0) - (contract?.usedValue || 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="addendums" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Aditivos do Contrato</CardTitle>
                <CardDescription>Gerenciar aditivos como prorrogação de vencimento, aumento de valor, etc.</CardDescription>
              </div>
              <Button onClick={() => setShowAddAddendumDialog(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Novo Aditivo
              </Button>
            </CardHeader>
            <CardContent>
              {!contract?.addendums || contract.addendums.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-600">Nenhum aditivo registrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contract.addendums
                    .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime())
                    .map((addendum) => (
                      <div key={addendum.id} className="p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-sm font-semibold">{addendum.number}</p>
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                addendum.type === "vencimento" ? "bg-blue-100 text-blue-800" :
                                addendum.type === "valor" ? "bg-green-100 text-green-800" :
                                addendum.type === "produto" ? "bg-purple-100 text-purple-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {addendum.type === "vencimento" ? "Vencimento" :
                                 addendum.type === "valor" ? "Valor" :
                                 addendum.type === "produto" ? "Produto" :
                                 addendum.type === "quantidade" ? "Quantidade" :
                                 "Outros"}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mb-2">{addendum.description}</p>
                            <div className="grid grid-cols-2 gap-4 mb-2">
                              {addendum.originalValue !== undefined && (
                                <div>
                                  <p className="text-xs text-gray-500">Valor anterior</p>
                                  <p className="text-sm font-monospace">
                                    {addendum.type === "vencimento" 
                                      ? new Date(addendum.originalValue).toLocaleDateString("pt-BR")
                                      : formatCurrency(addendum.originalValue)
                                    }
                                  </p>
                                </div>
                              )}
                              {addendum.newValue !== undefined && (
                                <div>
                                  <p className="text-xs text-gray-500">Novo valor</p>
                                  <p className="text-sm font-monospace font-bold">
                                    {addendum.type === "vencimento" 
                                      ? new Date(addendum.newValue as string).toLocaleDateString("pt-BR")
                                      : formatCurrency(addendum.newValue as number)
                                    }
                                  </p>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              {new Date(addendum.createdAt || addendum.date).toLocaleDateString("pt-BR")} às{" "}
                              {new Date(addendum.createdAt || addendum.date).toLocaleTimeString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de confirmação para excluir contrato */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o contrato e todos os dados associados.
              {contractOrders.length > 0 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  Atenção: Este contrato possui {contractOrders.length} pedido(s) associado(s).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo para adicionar ajuste de saldo */}
      <AlertDialog open={showAddAdjustmentDialog} onOpenChange={setShowAddAdjustmentDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Adicionar Ajuste de Saldo</AlertDialogTitle>
            <AlertDialogDescription>
              Registre um consumo manual de saldo para este contrato.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="amount" className="text-sm font-medium">
                Valor a Consumir *
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="0,00"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                min="0"
                step="0.01"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Saldo disponível: {formatCurrency((contract?.value || 0) - (contract?.usedValue || 0))}
              </p>
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Descrição *
              </Label>
              <Textarea
                id="description"
                placeholder="Ex: Ajuste de consumo referente à NF 12345"
                value={adjustmentDescription}
                onChange={(e) => setAdjustmentDescription(e.target.value)}
                className="mt-2 resize-none"
                rows={3}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              onClick={handleAddAdjustment}
              disabled={isSubmittingAdjustment || !adjustmentAmount || !adjustmentDescription.trim()}
              className="bg-primary text-primary-foreground"
            >
              {isSubmittingAdjustment ? "Adicionando..." : "Adicionar Ajuste"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo para adicionar aditivo de contrato */}
      <AlertDialog open={showAddAddendumDialog} onOpenChange={setShowAddAddendumDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Novo Aditivo do Contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Crie um aditivo para modificar termos do contrato (vencimento, valor, produtos, etc).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="type" className="text-sm font-medium">
                Tipo de Aditivo *
              </Label>
              <Select value={addendumType} onValueChange={(value) => setAddendumType(value as "vencimento" | "valor" | "produto" | "quantidade" | "outros")}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vencimento">Prorrogação de Vencimento</SelectItem>
                  <SelectItem value="valor">Aumento de Valor</SelectItem>
                  <SelectItem value="produto">Adição de Produto</SelectItem>
                  <SelectItem value="quantidade">Alteração de Quantidade</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="newValue" className="text-sm font-medium">
                {addendumType === "vencimento" 
                  ? "Nova Data de Vencimento *" 
                  : addendumType === "valor"
                  ? "Novo Valor *"
                  : "Novo Valor/Descrição *"}
              </Label>
              {addendumType === "vencimento" ? (
                <Input
                  id="newValue"
                  type="date"
                  value={addendumNewValue}
                  onChange={(e) => setAddendumNewValue(e.target.value)}
                  className="mt-2"
                />
              ) : addendumType === "valor" ? (
                <Input
                  id="newValue"
                  type="number"
                  placeholder="0,00"
                  value={addendumNewValue}
                  onChange={(e) => setAddendumNewValue(e.target.value)}
                  step="0.01"
                  min="0"
                  className="mt-2"
                />
              ) : (
                <Input
                  id="newValue"
                  type="text"
                  placeholder="Descreva o novo produto ou quantidade"
                  value={addendumNewValue}
                  onChange={(e) => setAddendumNewValue(e.target.value)}
                  className="mt-2"
                />
              )}
              {addendumType === "vencimento" && contract?.expirationDate && (
                <p className="text-xs text-gray-500 mt-1">
                  Vencimento atual: {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                </p>
              )}
              {addendumType === "valor" && contract?.value && (
                <p className="text-xs text-gray-500 mt-1">
                  Valor atual: {formatCurrency(contract.value)}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Descrição/Justificativa *
              </Label>
              <Textarea
                id="description"
                placeholder="Ex: Prorrogação solicitada pelo cliente, novo escopo incluído, etc."
                value={addendumDescription}
                onChange={(e) => setAddendumDescription(e.target.value)}
                className="mt-2 resize-none"
                rows={3}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              onClick={handleAddAddendum}
              disabled={isSubmittingAddendum || !addendumNewValue || !addendumDescription.trim()}
              className="bg-primary text-primary-foreground"
            >
              {isSubmittingAddendum ? "Criando..." : "Criar Aditivo"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
