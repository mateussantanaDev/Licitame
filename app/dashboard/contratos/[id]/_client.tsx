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
import { ContractExceededReportDialog } from "@/components/contract-exceeded-report-dialog"

export default function ContratoDetalhesPage({ params }: { params: { id: string } }) {
  const { getContractById, deleteContract, addBalanceAdjustment, addAddendum, editAddendum, deleteAddendum, contracts } = useContracts()
  const { orders, tagOrdersWithPeriod } = useOrders()
  const { generateContractExtrapolationReport } = useReports()
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [contract, setContract] = useState<Contract | null>(null)
  const [contractOrders, setContractOrders] = useState<typeof orders>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showExceededReportDialog, setShowExceededReportDialog] = useState(false)
  const [showAddAdjustmentDialog, setShowAddAdjustmentDialog] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [adjustmentDescription, setAdjustmentDescription] = useState("")
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false)
  const [showAddAddendumDialog, setShowAddAddendumDialog] = useState(false)
  const [addendumType, setAddendumType] = useState<"vencimento" | "valor" | "produto" | "quantidade" | "outros">("vencimento")
  const [addendumValueMode, setAddendumValueMode] = useState<"total" | "addition">("total")
  const [addendumNewValue, setAddendumNewValue] = useState("")
  const [addendumDescription, setAddendumDescription] = useState("")
  const [isSubmittingAddendum, setIsSubmittingAddendum] = useState(false)

  // Estados para edição e exclusão de aditivos com log
  const [deleteAddendumTarget, setDeleteAddendumTarget] = useState<ContractAddendum | null>(null)
  const [isDeletingAddendum, setIsDeletingAddendum] = useState(false)
  const [editAddendumTarget, setEditAddendumTarget] = useState<ContractAddendum | null>(null)
  const [editAddendumDescription, setEditAddendumDescription] = useState("")
  const [editAddendumNewValue, setEditAddendumNewValue] = useState("")
  const [isSubmittingEditAddendum, setIsSubmittingEditAddendum] = useState(false)

  // Estados para gestão de vigências e reequilíbrio
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("active")
  const [resetBalance, setResetBalance] = useState(false)
  const [hasRebalance, setHasRebalance] = useState(false)
  const [rebalancePercent, setRebalancePercent] = useState("")
  const [rebalanceItems, setRebalanceItems] = useState<{
    id: string
    name: string
    quantity: number
    unitPrice: number
    newUnitPrice: number
    percent: number
    totalPrice: number
  }[]>([])

  const [itemAddendumList, setItemAddendumList] = useState<
    Array<{
      id: string
      name: string
      description: string
      originalQuantity: number
      addQuantity: number
      unitPrice: number
      usedQuantity: number
      isNew?: boolean
    }>
  >([])

  const isCompras = user?.role === "compras" || user?.role === "admin"

  useEffect(() => {
    if (contract?.items && showAddAddendumDialog) {
      setRebalanceItems(
        contract.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          newUnitPrice: item.unitPrice,
          percent: 0,
          totalPrice: item.totalPrice,
        }))
      )
      setItemAddendumList(
        contract.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description || "",
          originalQuantity: item.quantity,
          addQuantity: 0,
          unitPrice: item.unitPrice,
          usedQuantity: item.usedQuantity || 0,
        }))
      )
    }
  }, [contract, showAddAddendumDialog])

  const handleItemAddendumFieldChange = (
    id: string,
    field: "name" | "description" | "addQuantity" | "unitPrice",
    value: any
  ) => {
    setItemAddendumList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item }
          if (field === "name" || field === "description") {
            updated[field] = value
          } else if (field === "addQuantity") {
            updated.addQuantity = parseFloat(value) || 0
          } else if (field === "unitPrice") {
            updated.unitPrice = parseFloat(value) || 0
          }
          return updated
        }
        return item
      })
    )
  }

  const handleAddItemAddendumRow = () => {
    const newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `Novo Item ${(itemAddendumList.length + 1)}`,
      description: "",
      originalQuantity: 0,
      addQuantity: 1,
      unitPrice: 0,
      usedQuantity: 0,
      isNew: true,
    }
    setItemAddendumList((prev) => [...prev, newItem])
  }

  const handleRemoveItemAddendumRow = (id: string) => {
    setItemAddendumList((prev) => prev.filter((item) => item.id !== id))
  }

  const handleGlobalRebalancePercentChange = (valStr: string) => {
    setRebalancePercent(valStr)
    const pct = parseFloat(valStr) || 0
    setRebalanceItems((prev) =>
      prev.map((item) => {
        const newPrice = Number((item.unitPrice * (1 + pct / 100)).toFixed(2))
        return {
          ...item,
          percent: pct,
          newUnitPrice: newPrice,
          totalPrice: Number((newPrice * item.quantity).toFixed(2)),
        }
      })
    )
  }

  const handleItemPriceChange = (itemId: string, newPriceVal: number) => {
    setRebalanceItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const pct = item.unitPrice > 0 ? Number((((newPriceVal - item.unitPrice) / item.unitPrice) * 100).toFixed(2)) : 0
          return {
            ...item,
            newUnitPrice: newPriceVal,
            percent: pct,
            totalPrice: Number((newPriceVal * item.quantity).toFixed(2)),
          }
        }
        return item
      })
    )
  }

  const handleItemPercentChange = (itemId: string, pctVal: number) => {
    setRebalanceItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const newPrice = Number((item.unitPrice * (1 + pctVal / 100)).toFixed(2))
          return {
            ...item,
            percent: pctVal,
            newUnitPrice: newPrice,
            totalPrice: Number((newPrice * item.quantity).toFixed(2)),
          }
        }
        return item
      })
    )
  }

  useEffect(() => {
    const foundContract = getContractById(params.id)
    if (foundContract) {
      setContract(foundContract)
    } else if (contracts.length > 0) {
      router.push("/dashboard/contratos")
    }
  }, [params.id, getContractById, router, contracts])

  useEffect(() => {
    if (contract) {
      const selectedPeriod = selectedPeriodId !== "active" && contract.previousPeriods
        ? contract.previousPeriods.find((p) => p.id === selectedPeriodId)
        : null

      const filteredOrders = selectedPeriod
        ? orders.filter((o) => o.contractId === contract.id && o.periodId === selectedPeriod.id)
        : orders.filter((o) => o.contractId === contract.id && (!o.periodId || o.periodId === contract.activePeriodId))

      filteredOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setContractOrders(filteredOrders)
    }
  }, [contract, orders, selectedPeriodId])

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
    if (!contract || !addendumDescription.trim()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, informe a descrição ou justificativa do aditivo.",
        variant: "destructive",
      })
      return
    }

    const isItemAddendum = addendumType === "produto" || addendumType === "quantidade"
    if (!isItemAddendum && !addendumNewValue) {
      toast({
        title: "Erro de validação",
        description: "Por favor, informe a nova data ou valor do aditivo.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingAddendum(true)
    try {
      let updatedItems: ContractItem[] | undefined = undefined
      let finalNewValue: any = undefined

      if (isItemAddendum) {
        updatedItems = itemAddendumList.map((item) => {
          const newQty = Number(item.originalQuantity || 0) + Number(item.addQuantity || 0)
          const price = Number(item.unitPrice) || 0
          const total = Number((newQty * price).toFixed(2))
          return {
            id: item.id,
            name: item.name.trim() || "Item sem nome",
            description: item.description || "",
            quantity: Math.max(0, newQty),
            unitPrice: price,
            totalPrice: total,
            usedQuantity: resetBalance ? 0 : (item.usedQuantity || 0),
          }
        })

        const totalItemsValue = updatedItems.reduce((sum, i) => sum + i.totalPrice, 0)
        finalNewValue = totalItemsValue
      } else if (hasRebalance && rebalanceItems.length > 0) {
        updatedItems = rebalanceItems.map((ri) => {
          const originalItem = contract.items.find((i) => i.id === ri.id)
          return {
            id: ri.id,
            name: ri.name,
            description: originalItem?.description || "",
            quantity: ri.quantity,
            unitPrice: ri.newUnitPrice,
            totalPrice: ri.totalPrice,
            usedQuantity: resetBalance ? 0 : (originalItem?.usedQuantity || 0),
          }
        })
        finalNewValue = addendumType === "vencimento" ? addendumNewValue : parseFloat(addendumNewValue)
      } else {
        finalNewValue = addendumType === "vencimento" ? addendumNewValue : parseFloat(addendumNewValue)
      }

      if (addendumType === "valor" && (isNaN(finalNewValue as number) || (finalNewValue as number) <= 0)) {
        toast({
          title: "Erro de validação",
          description: "O valor deve ser um número maior que zero.",
          variant: "destructive",
        })
        setIsSubmittingAddendum(false)
        return
      }

      const closedPeriodId = `period_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      if (resetBalance) {
        await tagOrdersWithPeriod(contract.id, closedPeriodId)
      }

      const success = await addAddendum(contract.id, {
        number: `${contract.number}-ADIT-${(contract.addendums?.length || 0) + 1}`,
        type: addendumType,
        valueMode: (addendumType === "valor" || isItemAddendum) ? addendumValueMode : undefined,
        originalValue: addendumType === "vencimento" ? contract.expirationDate : contract.value,
        newValue: addendumType === "vencimento" 
          ? (addendumNewValue.includes("T") ? new Date(addendumNewValue).toISOString() : new Date(`${addendumNewValue}T23:59:59`).toISOString()) 
          : finalNewValue,
        description: addendumDescription,
        date: new Date().toISOString(),
        resetBalance: resetBalance,
        rebalancePercent: hasRebalance && rebalancePercent ? parseFloat(rebalancePercent) : undefined,
        updatedItems,
      })

      if (success) {
        toast({
          title: "Sucesso",
          description: resetBalance 
            ? "Aditivo registrado com sucesso! Vigência anterior arquivada no histórico e saldo de consumo zerado."
            : `Aditivo de ${addendumType} adicionado com sucesso.`,
        })
        setAddendumNewValue("")
        setAddendumDescription("")
        setResetBalance(false)
        setHasRebalance(false)
        setRebalancePercent("")
        setShowAddAddendumDialog(false)
        setSelectedPeriodId("active")
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

  const handleOpenEditAddendum = (addendum: ContractAddendum) => {
    setEditAddendumTarget(addendum)
    setEditAddendumDescription(addendum.description || "")
    setEditAddendumNewValue(
      addendum.type === "vencimento" && addendum.newValue
        ? new Date(addendum.newValue).toISOString().split("T")[0]
        : String(addendum.newValue || "")
    )
  }

  const handleSaveEditAddendum = async () => {
    if (!contract || !editAddendumTarget || !editAddendumDescription.trim()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, preencha a descrição/justificativa.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingEditAddendum(true)
    try {
      const parsedVal = editAddendumTarget.type === "vencimento"
        ? (editAddendumNewValue.includes("T") ? new Date(editAddendumNewValue).toISOString() : new Date(`${editAddendumNewValue}T23:59:59`).toISOString())
        : parseFloat(editAddendumNewValue)

      const targetId = editAddendumTarget.id || editAddendumTarget.number
      const success = await editAddendum(contract.id, targetId, {
        description: editAddendumDescription,
        newValue: parsedVal,
      })

      if (success) {
        toast({
          title: "Aditivo atualizado",
          description: "O aditivo foi alterado e o log de auditoria foi gravado com sucesso.",
        })
        setEditAddendumTarget(null)
      } else {
        console.error("[handleSaveEditAddendum] editAddendum retornou false")
        toast({
          title: "Erro",
          description: "Não foi possível alterar o aditivo.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[handleSaveEditAddendum] Erro ao editar aditivo:", error)
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao alterar o aditivo.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingEditAddendum(false)
    }
  }

  const handleConfirmDeleteAddendum = async () => {
    if (!contract || !deleteAddendumTarget) {
      console.warn("[handleConfirmDeleteAddendum] contract ou deleteAddendumTarget está nulo:", { contract, deleteAddendumTarget })
      return
    }
    setIsDeletingAddendum(true)
    try {
      const targetId = deleteAddendumTarget.id || deleteAddendumTarget.number
      console.log(`[handleConfirmDeleteAddendum] Executando exclusão. contract.id="${contract.id}", targetId="${targetId}"`, deleteAddendumTarget)
      const success = await deleteAddendum(contract.id, targetId)
      console.log(`[handleConfirmDeleteAddendum] Resultado do deleteAddendum: ${success}`)
      if (success) {
        toast({
          title: "Aditivo excluído",
          description: "O aditivo foi removido e a ação foi salva no log de auditoria.",
        })
        setDeleteAddendumTarget(null)
      } else {
        console.error("[handleConfirmDeleteAddendum] deleteAddendum retornou false")
        toast({
          title: "Erro",
          description: "Não foi possível excluir o aditivo.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[handleConfirmDeleteAddendum] Exceção capturada:", error)
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao excluir o aditivo.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingAddendum(false)
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

  const selectedPeriod = selectedPeriodId !== "active" && contract.previousPeriods
    ? contract.previousPeriods.find((p) => p.id === selectedPeriodId)
    : null

  const displayValue = selectedPeriod ? selectedPeriod.value : contract.value
  const displayUsedValue = selectedPeriod ? selectedPeriod.usedValue : contract.usedValue
  const displayUsedPercentage = selectedPeriod ? selectedPeriod.usedPercentage : contract.usedPercentage
  const displayItems = selectedPeriod ? selectedPeriod.items : contract.items
  const displayExpirationDate = selectedPeriod ? selectedPeriod.expirationDate : contract.expirationDate

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/contratos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Detalhes do Contrato</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => setShowExceededReportDialog(true)}
          >
            <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
            Relatório de Itens Excedidos
          </Button>
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

      {contract.previousPeriods && contract.previousPeriods.length > 0 && (
        <Card className="bg-muted/40 border-primary/20">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-sm">Visualização de Vigência / Período do Contrato</p>
                <p className="text-xs text-muted-foreground">Este contrato possui aditivos de prazo com históricos arquivados.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label htmlFor="periodSelect" className="text-xs font-medium whitespace-nowrap">Selecionar Período:</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger id="periodSelect" className="w-[280px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">🟢 Vigência Atual (Saldo Ativo)</SelectItem>
                  {contract.previousPeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      📂 {period.name} (Até {new Date(period.expirationDate).toLocaleDateString('pt-BR')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPeriod && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-4 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-amber-900 dark:text-amber-300">
              Você está visualizando o histórico congelado da {selectedPeriod.name}
            </p>
            <p className="text-amber-800 dark:text-amber-400 text-xs">
              Este período foi encerrado via aditivo de prazo. Os dados abaixo refletem o consumo exato da época. O saldo da nova vigência continua independente.
            </p>
          </div>
        </div>
      )}

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
                <p className="text-lg font-semibold">{new Date(selectedPeriod ? selectedPeriod.startDate : contract.startDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data de Vencimento</p>
                <p
                  className={`text-lg font-semibold ${!selectedPeriod && isExpiringSoon ? "text-amber-600" : !selectedPeriod && isExpired ? "text-red-600" : ""}`}
                >
                  {new Date(displayExpirationDate).toLocaleDateString("pt-BR")}
                  {!selectedPeriod && isExpiringSoon && !isExpired && ` (${daysRemaining} dias)`}
                  {!selectedPeriod && isExpired && ` (Vencido há ${daysExpired} dia${daysExpired !== 1 ? "s" : ""})`}
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
                  {formatCurrency(displayUsedValue)} de {formatCurrency(displayValue)}
                </p>
              </div>
              <Progress value={Math.min(100, displayUsedPercentage)} className={`h-2 ${displayUsedValue > displayValue ? "[&>div]:bg-red-600" : ""}`} />
              <div className="flex justify-between text-xs font-semibold">
                <span className={displayUsedPercentage > 100 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                  {displayUsedPercentage}% utilizado {displayUsedPercentage > 100 ? "(EXTRAPOLADO)" : ""}
                </span>
                <span className={displayValue - displayUsedValue < 0 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                  {displayValue - displayUsedValue < 0 
                    ? `Saldo Negativo: ${formatCurrency(displayValue - displayUsedValue)}`
                    : `${formatCurrency(displayValue - displayUsedValue)} disponível`}
                </span>
              </div>
            </div>

            {(displayUsedValue > displayValue || displayItems?.some(i => i.usedQuantity > i.quantity)) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-red-100 border border-red-300 text-red-900 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 animate-pulse" />
                  <div className="text-xs">
                    <p className="font-bold text-red-900">Extrapolação de Limites Detectada</p>
                    <p className="text-red-800">
                      O consumo nesta vigência ultrapassou o teto ou a quantidade permitida por item.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="bg-red-700 hover:bg-red-800 text-white shrink-0"
                  onClick={() => setShowExceededReportDialog(true)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Ver Relatório de Itens Excedidos
                </Button>
              </div>
            )}

            {!selectedPeriod && isExpiringSoon && !isExpired && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-md">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">Este contrato expira em {daysRemaining} dias.</p>
              </div>
            )}

            {!selectedPeriod && isExpired && (
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
              Resumo de Utilização {selectedPeriod ? `(${selectedPeriod.name})` : "(Vigência Atual)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
                <p className="text-lg font-semibold">{formatCurrency(displayValue)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Utilizado</p>
                <p className="text-lg font-semibold">{formatCurrency(displayUsedValue)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Disponível</p>
                <p className="text-lg font-semibold">{formatCurrency(displayValue - displayUsedValue)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Pedidos</p>
                <p className="text-lg font-semibold">{contractOrders.length}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Pedidos da Vigência Selecionada</p>
              {contractOrders.length === 0 ? (
                <p className="text-sm text-center py-4 border rounded-md">Nenhum pedido realizado nesta vigência</p>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Itens do Contrato {selectedPeriod ? `(${selectedPeriod.name})` : "(Vigência Atual)"}</CardTitle>
            <CardDescription>Lista de todos os itens e consumo da vigência selecionada</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowExceededReportDialog(true)}>
            <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
            Relatório de Excesso
          </Button>
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
                {!Array.isArray(displayItems) || displayItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <p className="text-sm text-gray-600">Nenhum item encontrado neste contrato.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayItems.map((item) => {
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
                      <div key={addendum.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
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

                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-primary hover:bg-primary/10"
                              title="Editar Aditivo"
                              onClick={() => handleOpenEditAddendum(addendum)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-destructive hover:bg-destructive/10"
                              title="Excluir Aditivo"
                              onClick={() => setDeleteAddendumTarget(addendum)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Log de Auditoria dos Aditivos */}
              {contract?.addendumLogs && contract.addendumLogs.length > 0 && (
                <div className="mt-8 pt-6 border-t space-y-3">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-gray-800">
                    <Clock className="h-4 w-4 text-primary" />
                    Log de Auditoria dos Aditivos ({contract.addendumLogs.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {contract.addendumLogs.map((log) => (
                      <div key={log.id} className="p-3 bg-muted/40 border rounded-md text-xs flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={log.action === "create" ? "default" : log.action === "edit" ? "outline" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {log.action === "create" ? "Criado" : log.action === "edit" ? "Editado" : "Excluído"}
                            </Badge>
                            <span className="font-semibold text-gray-800">{log.addendumNumber}</span>
                          </div>
                          <p className="text-muted-foreground">{log.description}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleDateString("pt-BR")} {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
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
        <AlertDialogContent className={(hasRebalance || ((addendumType === "produto" || addendumType === "quantidade") && addendumValueMode === "total")) ? "sm:max-w-5xl w-[95vw]" : "sm:max-w-xl w-[95vw]"}>
          <AlertDialogHeader>
            <AlertDialogTitle>Novo Aditivo do Contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Crie um aditivo para modificar termos do contrato (vencimento, valor, produtos, etc).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4 max-h-[75vh] overflow-y-auto pr-1">
            <div>
              <Label htmlFor="type" className="text-sm font-medium">
                Tipo de Aditivo *
              </Label>
              <Select value={addendumType} onValueChange={(value) => setAddendumType(value as "vencimento" | "valor" | "produto" | "quantidade" | "outros")}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vencimento">Prorrogação de Vencimento (Reset de Saldo)</SelectItem>
                  <SelectItem value="valor">Aumento de Valor</SelectItem>
                  <SelectItem value="produto">Adição de Produto</SelectItem>
                  <SelectItem value="quantidade">Alteração de Quantidade</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {addendumType === "vencimento" && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-md text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Arquivamento e Reset de Saldo
                </p>
                <p>
                  O aditivo de prazo irá arquivar os consumos da vigência anterior no histórico e resetar o saldo de pedidos/itens para a nova vigência.
                </p>
              </div>
            )}

            {(addendumType === "valor" || addendumType === "produto" || addendumType === "quantidade") && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">Modo de Cálculo do Aditivo:</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${addendumValueMode === "total" ? "bg-primary/10 border-primary font-semibold text-primary" : "bg-background border-gray-200"}`}>
                    <input
                      type="radio"
                      name="valueMode"
                      checked={addendumValueMode === "total"}
                      onChange={() => setAddendumValueMode("total")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>
                      {addendumType === "valor"
                        ? "Novo Valor Total Global"
                        : "Novo Valor Total dos Itens (Gerenciar cada um)"}
                    </span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${addendumValueMode === "addition" ? "bg-primary/10 border-primary font-semibold text-primary" : "bg-background border-gray-200"}`}>
                    <input
                      type="radio"
                      name="valueMode"
                      checked={addendumValueMode === "addition"}
                      onChange={() => setAddendumValueMode("addition")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>
                      {addendumType === "valor"
                        ? "Apenas o Valor do Acréscimo"
                        : "Acréscimo de Valor/Qtd no Item Original"}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Gerenciamento de Itens quando Aditivo de Produto / Quantidade */}
            {(addendumType === "produto" || addendumType === "quantidade") && (
              <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    Tabela de Itens e Aditivos por Quantidade
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItemAddendumRow}
                    className="h-7 text-xs bg-background"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar Novo Item
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Altere a <strong>Soma Qtd</strong> e o <strong>Valor em Reais (R$)</strong>. O <strong>+ Valor Adicionado</strong>, a <strong>Total Qtd Nova</strong> e o <strong>Total Reais (R$)</strong> do item são calculados automaticamente.
                </p>

                <div className="max-h-72 overflow-y-auto rounded border bg-background overflow-x-auto">
                  <Table className="text-xs w-full min-w-[880px]">
                    <TableHeader>
                      <TableRow className="h-8 bg-muted/50">
                        <TableHead className="py-1 min-w-[140px]">Item</TableHead>
                        <TableHead className="py-1 text-center w-20">Qtd Orig.</TableHead>
                        <TableHead className="py-1 text-right w-24 bg-emerald-500/10 font-bold text-emerald-800 dark:text-emerald-400">Soma Qtd</TableHead>
                        <TableHead className="py-1 text-right w-28 font-semibold">Valor em Reais (R$)</TableHead>
                        <TableHead className="py-1 text-right w-32 bg-emerald-500/10 font-bold text-emerald-700 dark:text-emerald-400">+ Valor Adicionado</TableHead>
                        <TableHead className="py-1 text-center w-24 font-bold text-primary">Total Qtd Nova</TableHead>
                        <TableHead className="py-1 text-right w-32 font-bold text-primary">Total Reais (R$)</TableHead>
                        <TableHead className="py-1 text-center w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemAddendumList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                            Nenhum item cadastrado. Clique em "+ Adicionar Novo Item".
                          </TableCell>
                        </TableRow>
                      ) : (
                        itemAddendumList.map((item) => {
                          const addQty = Number(item.addQuantity || 0)
                          const unitPrice = Number(item.unitPrice || 0)
                          const origQty = Number(item.originalQuantity || 0)

                          const valorAdicionado = Number((addQty * unitPrice).toFixed(2))
                          const totalQtdNova = origQty + addQty
                          const totalReais = Number((totalQtdNova * unitPrice).toFixed(2))

                          return (
                            <TableRow key={item.id} className="h-9">
                              <TableCell className="py-1 font-medium min-w-[140px]">
                                <Input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => handleItemAddendumFieldChange(item.id, "name", e.target.value)}
                                  className="h-8 text-xs bg-background"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-center font-mono text-muted-foreground text-xs">
                                {origQty}
                              </TableCell>
                              <TableCell className="py-1 text-right bg-emerald-500/5">
                                <Input
                                  type="number"
                                  value={item.addQuantity}
                                  onChange={(e) => handleItemAddendumFieldChange(item.id, "addQuantity", e.target.value)}
                                  step="1"
                                  className="h-8 text-xs font-bold text-right w-20 ml-auto font-mono text-emerald-700 dark:text-emerald-400 bg-background"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right font-semibold">
                                <Input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => handleItemAddendumFieldChange(item.id, "unitPrice", e.target.value)}
                                  step="0.01"
                                  min="0"
                                  className="h-8 text-xs text-right w-24 ml-auto font-mono"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs bg-emerald-500/5">
                                +{formatCurrency(valorAdicionado)}
                              </TableCell>
                              <TableCell className="py-1 text-center font-mono font-bold text-primary text-xs">
                                {totalQtdNova}
                              </TableCell>
                              <TableCell className="py-1 text-right font-mono font-bold text-primary text-xs">
                                {formatCurrency(totalReais)}
                              </TableCell>
                              <TableCell className="py-1 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveItemAddendumRow(item.id)}
                                  title="Remover item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="p-3 bg-muted/40 rounded border text-xs space-y-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Valor Total Original do Contrato:</span>
                    <span className="font-mono text-xs font-semibold">{formatCurrency(contract?.value || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>Valor Total Adicionado dos Itens (Aditivo de Produtos):</span>
                    <span className="font-mono text-sm">
                      +{formatCurrency(
                        itemAddendumList.reduce(
                          (sum, i) => sum + (Number(i.addQuantity) || 0) * Number(i.unitPrice || 0),
                          0
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-bold text-sm text-primary">
                    <span>Novo Valor Total do Contrato:</span>
                    <span className="font-mono text-base">
                      {formatCurrency(
                        (contract?.value || 0) +
                          itemAddendumList.reduce(
                            (sum, i) => sum + (Number(i.addQuantity) || 0) * Number(i.unitPrice || 0),
                            0
                          )
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Inputs para tipo Vencimento, Valor Global ou Outros */}
            {addendumType !== "produto" && addendumType !== "quantidade" && (
              <div>
                <Label htmlFor="newValue" className="text-sm font-medium">
                  {addendumType === "vencimento" 
                    ? "Nova Data de Vencimento *" 
                    : addendumType === "valor"
                    ? addendumValueMode === "total" ? "Novo Valor Total do Contrato (R$) *" : "Valor a Adicionar/Acréscimo (R$) *"
                    : "Valor do Aditivo (R$) *"}
                </Label>
                {addendumType === "vencimento" ? (
                  <Input
                    id="newValue"
                    type="date"
                    value={addendumNewValue}
                    onChange={(e) => setAddendumNewValue(e.target.value)}
                    className="mt-2"
                  />
                ) : (
                  <Input
                    id="newValue"
                    type="number"
                    placeholder={addendumValueMode === "total" ? "Ex: 563000,00" : "Ex: 112000,00"}
                    value={addendumNewValue}
                    onChange={(e) => setAddendumNewValue(e.target.value)}
                    step="0.01"
                    min="0"
                    className="mt-2 font-mono font-semibold"
                  />
                )}
                {addendumType === "vencimento" && contract?.expirationDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Vencimento atual: {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                  </p>
                )}
                {(addendumType === "valor" || addendumValueMode === "addition") && contract?.value !== undefined && addendumNewValue && (
                  <div className="mt-3 p-3 bg-muted/40 border rounded-md text-xs space-y-1.5">
                    <p className="font-semibold text-gray-800">Resumo da Alteração de Valor:</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Atual do Contrato:</span>
                      <span className="font-mono">{formatCurrency(contract.value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor do Acréscimo (Aditivo):</span>
                      <span className="font-mono text-green-700 font-semibold">
                        +{formatCurrency(
                          addendumValueMode === "total"
                            ? Math.max(0, (parseFloat(addendumNewValue) || 0) - contract.value)
                            : (parseFloat(addendumNewValue) || 0)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-bold">
                      <span>Novo Valor Total do Contrato:</span>
                      <span className="font-mono text-primary text-sm">
                        {formatCurrency(
                          addendumValueMode === "total"
                            ? (parseFloat(addendumNewValue) || 0)
                            : contract.value + (parseFloat(addendumNewValue) || 0)
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  id="resetBalance"
                  checked={resetBalance}
                  onChange={(e) => setResetBalance(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <Label htmlFor="resetBalance" className="text-sm font-medium cursor-pointer">
                    Resetar saldo de consumo e iniciar nova vigência?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se marcado, o consumo acumulado até o momento será congelado no histórico e o saldo do contrato será zerado para ser consumido novamente.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="hasRebalance"
                  checked={hasRebalance}
                  onChange={(e) => setHasRebalance(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="hasRebalance" className="text-sm font-medium cursor-pointer">
                  Houve reequilíbrio econômico-financeiro de preços?
                </Label>
              </div>

              {hasRebalance && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <Label htmlFor="globalPercent" className="text-xs font-semibold">
                      Reajuste Geral em Porcentagem (%):
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="globalPercent"
                        type="number"
                        placeholder="Ex: 5"
                        value={rebalancePercent}
                        onChange={(e) => handleGlobalRebalancePercentChange(e.target.value)}
                        step="0.01"
                        className="h-8 w-28 text-xs bg-background"
                      />
                      <span className="text-xs text-muted-foreground">% para todos os itens</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Você pode alterar o percentual geral acima ou digitar diretamente o <strong>novo valor unitário em reais (R$)</strong> de qualquer item abaixo:
                  </p>

                  <div className="max-h-72 overflow-y-auto rounded border bg-background overflow-x-auto">
                    <Table className="text-xs w-full min-w-[650px]">
                      <TableHeader>
                        <TableRow className="h-8 bg-muted/50">
                          <TableHead className="py-1 min-w-[160px]">Item</TableHead>
                          <TableHead className="py-1 text-right w-20">Qtd</TableHead>
                          <TableHead className="py-1 text-right w-28">Preço Atual</TableHead>
                          <TableHead className="py-1 text-right w-28">% Reajuste</TableHead>
                          <TableHead className="py-1 text-right w-32">Novo Preço (R$)</TableHead>
                          <TableHead className="py-1 text-right w-32">Novo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rebalanceItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                              Nenhum item cadastrado neste contrato.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rebalanceItems.map((item) => (
                            <TableRow key={item.id} className="h-9">
                              <TableCell className="py-1 font-medium min-w-[160px]" title={item.name}>
                                {item.name}
                              </TableCell>
                              <TableCell className="py-1 text-right text-muted-foreground font-mono">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="py-1 text-right text-muted-foreground font-mono">
                                {formatCurrency(item.unitPrice)}
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <Input
                                  type="number"
                                  value={item.percent || 0}
                                  onChange={(e) => handleItemPercentChange(item.id, parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  className="h-8 w-24 text-xs font-mono text-right ml-auto"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <Input
                                  type="number"
                                  value={item.newUnitPrice || 0}
                                  onChange={(e) => handleItemPriceChange(item.id, parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  className="h-8 w-28 text-xs font-semibold font-mono text-right ml-auto text-primary"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right font-semibold font-mono text-primary">
                                {formatCurrency(item.totalPrice)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between items-center pt-1 text-xs font-semibold border-t">
                    <span>Novo Valor Total do Contrato:</span>
                    <span className="text-primary text-sm font-bold">
                      {formatCurrency(rebalanceItems.reduce((sum, i) => sum + i.totalPrice, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Descrição/Justificativa *
              </Label>
              <Textarea
                id="description"
                placeholder="Ex: Prorrogação solicitada pelo cliente, novo escopo incluído, reequilíbrio de preços, etc."
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

      {/* Diálogo para Editar Aditivo */}
      <AlertDialog open={!!editAddendumTarget} onOpenChange={(open) => !open && setEditAddendumTarget(null)}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Editar Aditivo {editAddendumTarget?.number}</AlertDialogTitle>
            <AlertDialogDescription>
              Modifique os dados do aditivo. Esta alteração será gravada no log de auditoria do contrato.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-3">
            <div>
              <Label className="text-xs font-semibold">Novo Valor/Data (*)</Label>
              {editAddendumTarget?.type === "vencimento" ? (
                <Input
                  type="date"
                  value={editAddendumNewValue}
                  onChange={(e) => setEditAddendumNewValue(e.target.value)}
                  className="mt-1"
                />
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  value={editAddendumNewValue}
                  onChange={(e) => setEditAddendumNewValue(e.target.value)}
                  className="mt-1 font-mono font-semibold"
                />
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold">Descrição / Justificativa (*)</Label>
              <Textarea
                value={editAddendumDescription}
                onChange={(e) => setEditAddendumDescription(e.target.value)}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingEditAddendum}>Cancelar</AlertDialogCancel>
            <Button onClick={handleSaveEditAddendum} disabled={isSubmittingEditAddendum || !editAddendumDescription.trim()}>
              {isSubmittingEditAddendum ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo para Excluir Aditivo */}
      <AlertDialog open={!!deleteAddendumTarget} onOpenChange={(open) => !open && setDeleteAddendumTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Aditivo {deleteAddendumTarget?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este aditivo? O valor/prazo do contrato será reajustado e esta ação será registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAddendum}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteAddendum}
              disabled={isDeletingAddendum}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAddendum ? "Excluindo..." : "Excluir Aditivo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo do Relatório de Itens Excedidos */}
      {contract && (
        <ContractExceededReportDialog
          open={showExceededReportDialog}
          onOpenChange={setShowExceededReportDialog}
          contract={contract}
          contractOrders={contractOrders}
        />
      )}
    </div>
  )
}
