"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useContracts, type Contract } from "@/lib/contracts-provider"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DatePicker } from "@/components/ui/date-picker"
import { NavigationProgress } from "@/components/navigation-progress"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { ArrowLeft, Building, FileText, AlertCircle, CheckCircle2, Plus, Trash2, Check, ChevronsUpDown, Search } from "lucide-react"

function SupplierCombobox({
  suppliers,
  value,
  onSelect,
}: {
  suppliers: Array<{ id: string; name: string; cnpj?: string }>
  value: string
  onSelect: (supplierId: string, supplierName?: string, supplierCnpj?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selectedSupplier = suppliers.find((s) => s.id === value)

  const filteredSuppliers = suppliers.filter((s) => {
    const term = search.toLowerCase().trim()
    if (!term) return true
    return s.name.toLowerCase().includes(term) || (s.cnpj && s.cnpj.includes(term))
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal bg-background text-left"
        >
          {selectedSupplier ? (
            <span className="truncate font-medium">
              {selectedSupplier.name} {selectedSupplier.cnpj ? `(${selectedSupplier.cnpj})` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Escolha um fornecedor...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-2" align="start">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou CNPJ/CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm h-9"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredSuppliers.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum fornecedor encontrado.
              </p>
            ) : (
              filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => {
                    onSelect(supplier.id, supplier.name, supplier.cnpj)
                    setOpen(false)
                    setSearch("")
                  }}
                  className={`w-full flex items-center justify-between py-2 px-2.5 rounded-md text-left text-sm hover:bg-accent transition-colors ${
                    value === supplier.id ? "bg-accent/60 font-medium" : ""
                  }`}
                >
                  <div className="flex flex-col overflow-hidden mr-2">
                    <span className="font-medium text-sm truncate">{supplier.name}</span>
                    {supplier.cnpj && <span className="text-xs text-muted-foreground">{supplier.cnpj}</span>}
                  </div>
                  {value === supplier.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function EditarContratoPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { toast } = useToast()
  const { getContractById, updateContract } = useContracts()
  const { suppliers } = useSuppliers()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [contract, setContract] = useState<Contract | null>(null)

  const [formData, setFormData] = useState({
    number: "",
    company: "",
    cnpj: "",
    supplierId: "",
    startDate: undefined as Date | undefined,
    expirationDate: undefined as Date | undefined,
    costBase: "",
    description: "",
    status: "ativo" as "ativo" | "vencido" | "expirado" | "cancelado",
  })

  const [items, setItems] = useState<
    Array<{
      id: string
      name: string
      description: string
      quantity: string
      unitPrice: string
      totalPrice: string
      usedQuantity: number
    }>
  >([])

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const foundContract = getContractById(params.id)

    if (!foundContract) {
      toast({
        title: "Contrato não encontrado",
        description: "O contrato que você está tentando editar não existe.",
        variant: "destructive",
      })
      router.push("/dashboard/contratos")
      return
    }

    setContract(foundContract)

    // Função auxiliar para converter string de data para Date seguro
    const parseDate = (dateValue: any): Date | undefined => {
      if (!dateValue) return undefined
      try {
        if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? undefined : dateValue
        }
        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue)
          return isNaN(parsed.getTime()) ? undefined : parsed
        }
      } catch (error) {
        console.error("Erro ao processar data:", error)
        return undefined
      }
      return undefined
    }

    // Preencher formulário com dados do contrato
    setFormData({
      number: foundContract.number,
      company: foundContract.company,
      cnpj: foundContract.cnpj || "",
      supplierId: foundContract.supplierId || "",
      startDate: parseDate(foundContract.startDate),
      expirationDate: parseDate(foundContract.expirationDate),
      costBase: foundContract.costBase,
      description: foundContract.description,
      status: foundContract.status,
    })

    // Preencher itens
    setItems(
      foundContract.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
        usedQuantity: item.usedQuantity,
      })),
    )

    setIsLoading(false)
  }, [params.id, getContractById, router, toast])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleDateChange = (name: "startDate" | "expirationDate", date: Date | undefined) => {
    setFormData((prev) => ({ ...prev, [name]: date }))

    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleItemChange = (id: string, field: string, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          if (field === "quantity" || field === "unitPrice") {
            const quantity = Number.parseFloat(field === "quantity" ? value : item.quantity) || 0
            const unitPrice = Number.parseFloat(field === "unitPrice" ? value : item.unitPrice) || 0
            updatedItem.totalPrice = (quantity * unitPrice).toFixed(2)
          }

          return updatedItem
        }
        return item
      }),
    )
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        name: "",
        description: "",
        quantity: "1",
        unitPrice: "0",
        totalPrice: "0",
        usedQuantity: 0,
      },
    ])
  }

  const removeItem = (id: string) => {
    // Não permitir remover itens que já foram usados
    const item = items.find((i) => i.id === id)
    if (item && item.usedQuantity > 0) {
      toast({
        title: "Não é possível remover",
        description: "Este item já possui quantidade utilizada e não pode ser removido.",
        variant: "destructive",
      })
      return
    }

    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const calculateTotalValue = () => {
    return items.reduce((sum, item) => sum + Number.parseFloat(item.totalPrice || "0"), 0).toFixed(2)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.number.trim()) newErrors.number = "Número do contrato é obrigatório"
    if (!formData.company.trim()) newErrors.company = "Empresa é obrigatória"
    if (!formData.startDate) newErrors.startDate = "Data de início é obrigatória"
    if (!formData.expirationDate) newErrors.expirationDate = "Data de vencimento é obrigatória"
    if (!formData.costBase.trim()) newErrors.costBase = "Base de custo é obrigatória"
    if (!formData.description.trim()) newErrors.description = "Descrição é obrigatória"

    if (items.length === 0) {
      newErrors.items = "Adicione pelo menos um item ao contrato"
    }

    items.forEach((item, index) => {
      if (!item.name.trim()) {
        newErrors[`item_${index}_name`] = "Nome do item é obrigatório"
      }

      // Validar que quantidade não pode ser menor que quantidade usada
      const quantity = Number.parseFloat(item.quantity)
      if (quantity < item.usedQuantity) {
        newErrors[`item_${index}_quantity`] = `Quantidade não pode ser menor que ${item.usedQuantity} (já utilizada)`
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, corrija os erros no formulário antes de continuar.",
        variant: "destructive",
      })
      return
    }

    if (!contract) return

    setIsSubmitting(true)

    try {
      const updatedContractData = {
        number: formData.number,
        company: formData.company,
        value: Number.parseFloat(calculateTotalValue()),
        startDate: formData.startDate ? formData.startDate.toISOString().split("T")[0] : contract.startDate,
        expirationDate: formData.expirationDate
          ? formData.expirationDate.toISOString().split("T")[0]
          : contract.expirationDate,
        costBase: formData.costBase,
        description: formData.description,
        status: formData.status,
        supplierId: formData.supplierId || undefined,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          quantity: Number.parseFloat(item.quantity),
          unitPrice: Number.parseFloat(item.unitPrice),
          totalPrice: Number.parseFloat(item.totalPrice),
          usedQuantity: item.usedQuantity,
        })),
      }

      const success = await updateContract(contract.id, updatedContractData)

      if (!success) {
        toast({
          title: "Erro ao atualizar contrato",
          description: "Não foi possível atualizar o contrato. Tente novamente.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      toast({
        title: "Contrato atualizado com sucesso",
        description: `O contrato ${formData.number} foi atualizado.`,
      })

      setIsNavigating(true)
      router.push(`/dashboard/contratos/${contract.id}`)
    } catch (error) {
      console.error("Erro ao atualizar contrato:", error)
      toast({
        title: "Erro ao atualizar contrato",
        description: "Ocorreu um erro ao tentar atualizar o contrato. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsNavigating(true)
    router.push(`/dashboard/contratos/${params.id}`)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    )
  }

  if (!contract) {
    return null
  }

  return (
    <div className="space-y-6">
      {isNavigating && <NavigationProgress />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleCancel} disabled={isNavigating || isSubmitting}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Editar Contrato</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
            <TabsTrigger value="items">Itens do Contrato</TabsTrigger>
            <TabsTrigger value="review">Revisão</TabsTrigger>
          </TabsList>

          {/* Aba de Informações Básicas */}
          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados do Contrato</CardTitle>
                <CardDescription>Atualize as informações básicas do contrato</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="number">
                      Número do Contrato <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex">
                      <div className="flex items-center justify-center bg-muted px-3 rounded-l-md border border-r-0 border-input">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Input
                        id="number"
                        name="number"
                        className={`rounded-l-none ${errors.number ? "border-destructive" : ""}`}
                        placeholder="CT-2024-001"
                        value={formData.number}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    {errors.number && (
                      <p className="text-sm text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {errors.number}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => handleSelectChange("status", value)}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="vencido">Vencido</SelectItem>
                        <SelectItem value="expirado">Expirado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="startDate">
                      Data de Início <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      date={formData.startDate}
                      onDateChange={(date) => handleDateChange("startDate", date)}
                    />
                    {errors.startDate && (
                      <p className="text-sm text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {errors.startDate}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">
                      Data de Vencimento <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      date={formData.expirationDate}
                      onDateChange={(date) => handleDateChange("expirationDate", date)}
                    />
                    {errors.expirationDate && (
                      <p className="text-sm text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {errors.expirationDate}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company">
                      Empresa/Fornecedor <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex">
                      <div className="flex items-center justify-center bg-muted px-3 rounded-l-md border border-r-0 border-input">
                        <Building className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Input
                        id="company"
                        name="company"
                        className={`rounded-l-none ${errors.company ? "border-destructive" : ""}`}
                        placeholder="Nome da empresa"
                        value={formData.company}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    {errors.company && (
                      <p className="text-sm text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {errors.company}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplierId">Selecionar Fornecedor</Label>
                    <SupplierCombobox
                      suppliers={suppliers}
                      value={formData.supplierId || ""}
                      onSelect={(supplierId, supplierName, supplierCnpj) => {
                        setFormData((prev) => ({
                          ...prev,
                          supplierId,
                          ...(supplierName ? { company: supplierName } : {}),
                          ...(supplierCnpj ? { cnpj: supplierCnpj } : {}),
                        }))
                        if (errors.supplierId) {
                          setErrors((prev) => {
                            const newErrors = { ...prev }
                            delete newErrors.supplierId
                            return newErrors
                          })
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="costBase">
                      Base de Custo <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="costBase"
                      name="costBase"
                      className={errors.costBase ? "border-destructive" : ""}
                      placeholder="Centro de custo"
                      value={formData.costBase}
                      onChange={handleInputChange}
                      required
                    />
                    {errors.costBase && (
                      <p className="text-sm text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {errors.costBase}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Objeto do Contrato <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    className={errors.description ? "border-destructive" : ""}
                    placeholder="Descreva o objeto do contrato"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    required
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive flex items-center mt-1">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.description}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Informações sobre edição</p>
                      <p className="text-sm text-blue-700 mt-1">
                        O valor total do contrato será calculado automaticamente com base nos itens cadastrados.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba de Itens */}
          <TabsContent value="items" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Itens do Contrato</CardTitle>
                <CardDescription>Gerencie os itens incluídos no contrato</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="p-4 border rounded-lg space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">
                        Item {index + 1}
                        {item.usedQuantity > 0 && (
                          <span className="ml-2 text-sm text-amber-600">({item.usedQuantity} unidades utilizadas)</span>
                        )}
                      </h4>
                      {items.length > 1 && item.usedQuantity === 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`item-${item.id}-name`}>
                          Nome do Item <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`item-${item.id}-name`}
                          placeholder="Nome do produto/serviço"
                          value={item.name}
                          onChange={(e) => handleItemChange(item.id, "name", e.target.value)}
                          className={errors[`item_${index}_name`] ? "border-destructive" : ""}
                        />
                        {errors[`item_${index}_name`] && (
                          <p className="text-sm text-destructive flex items-center mt-1">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {errors[`item_${index}_name`]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`item-${item.id}-description`}>Descrição</Label>
                        <Textarea
                          id={`item-${item.id}-description`}
                          placeholder="Descrição detalhada"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`item-${item.id}-quantity`}>
                          Quantidade
                          {item.usedQuantity > 0 && (
                            <span className="text-xs text-muted-foreground ml-2">(mínimo: {item.usedQuantity})</span>
                          )}
                        </Label>
                        <Input
                          id={`item-${item.id}-quantity`}
                          type="number"
                          placeholder="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                          min={item.usedQuantity}
                          step="0.01"
                          className={errors[`item_${index}_quantity`] ? "border-destructive" : ""}
                        />
                        {errors[`item_${index}_quantity`] && (
                          <p className="text-sm text-destructive flex items-center mt-1">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {errors[`item_${index}_quantity`]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`item-${item.id}-unitPrice`}>Valor Unitário</Label>
                        <Input
                          id={`item-${item.id}-unitPrice`}
                          type="number"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Valor Total</Label>
                        <div className="p-3 bg-muted rounded-md font-medium">
                          R$ {Number.parseFloat(item.totalPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addItem} className="w-full bg-transparent">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>

                <Separator />

                <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                  <span className="font-medium">Valor Total do Contrato:</span>
                  <span className="text-xl font-bold">
                    R$ {Number.parseFloat(calculateTotalValue()).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Atenção ao editar itens</p>
                      <p className="text-sm text-amber-700 mt-1">
                        • Itens com quantidade utilizada não podem ser removidos
                        <br />• A quantidade não pode ser menor que a quantidade já utilizada
                        <br />• O valor total será recalculado automaticamente
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba de Revisão */}
          <TabsContent value="review" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Revisão das Alterações</CardTitle>
                <CardDescription>Revise todas as informações antes de salvar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Dados do Contrato</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Número:</dt>
                    <dd className="font-medium">{formData.number || "-"}</dd>
                    <dt className="text-muted-foreground">Empresa:</dt>
                    <dd className="font-medium">{formData.company || "-"}</dd>
                    <dt className="text-muted-foreground">Fornecedor:</dt>
                    <dd className="font-medium">
                      {formData.supplierId
                        ? suppliers.find((s) => s.id === formData.supplierId)?.name || "-"
                        : "Nenhum"}
                    </dd>
                    <dt className="text-muted-foreground">Período:</dt>
                    <dd className="font-medium">
                      {formData.startDate && formData.expirationDate
                        ? `${formData.startDate.toLocaleDateString("pt-BR")} até ${formData.expirationDate.toLocaleDateString("pt-BR")}`
                        : "-"}
                    </dd>
                    <dt className="text-muted-foreground">Base de Custo:</dt>
                    <dd className="font-medium">{formData.costBase || "-"}</dd>
                    <dt className="text-muted-foreground">Status:</dt>
                    <dd className="font-medium capitalize">{formData.status}</dd>
                  </dl>
                </div>

                <Separator />

                <div>
                  <h3 className="font-medium mb-2">Itens ({items.length})</h3>
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id} className="p-3 bg-muted rounded-lg text-sm">
                        <div className="font-medium">{item.name || `Item ${index + 1}`}</div>
                        <div className="text-muted-foreground">
                          Qtd: {item.quantity} × R$ {Number.parseFloat(item.unitPrice).toFixed(2)} = R${" "}
                          {Number.parseFloat(item.totalPrice).toFixed(2)}
                          {item.usedQuantity > 0 && (
                            <span className="ml-2 text-amber-600">({item.usedQuantity} utilizadas)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Valor Total Atualizado</p>
                      <p className="text-lg font-bold text-green-700 mt-1">
                        R${" "}
                        {Number.parseFloat(calculateTotalValue()).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <div className="flex justify-between border rounded-lg p-6">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isNavigating || isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isNavigating}>
              {isSubmitting ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </Tabs>
      </form>
    </div>
  )
}
