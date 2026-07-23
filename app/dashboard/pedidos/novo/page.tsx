"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useContracts } from "@/lib/contracts-provider"
import { useProducts } from "@/lib/products-provider"
import { useOrders } from "@/lib/orders-provider"
import { useReports } from "@/lib/reports-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DatePicker } from "@/components/ui/date-picker"
import { LoadingSpinner } from "@/components/loading-spinner"
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Minus,
  Plus,
  Printer,
  Save,
  ShoppingCart,
  Truck,
  AlertCircle,
  Search,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"

// Tipos
type Step = "contract" | "supplier" | "products" | "review"
type OrderStatus = "rascunho" | "pendente" | "em separação" | "realizado" | "entregue" | "concluído" | "cancelado"

interface OrderProduct {
  id: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface OrderFormData {
  requestedBy: string
  department: string
  deliveryDate: Date
  priority: "low" | "medium" | "high"
  deliveryAddress: string
  notes: string
}

interface SupplierMatch {
  supplier: any
  matchedProducts: string[]
  matchPercentage: number
}

export default function NovoPedidoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { suppliers, isLoading: isSuppliersLoading } = useSuppliers()
  const { contracts, isLoading: isContractsLoading } = useContracts()
  const { products, isLoading: isProductsLoading } = useProducts()
  const { addOrder, updateOrder, orders, isLoading: isOrdersLoading } = useOrders()
  const { generateOrderExtrapolationReport } = useReports()

  // Estados
  const [currentStep, setCurrentStep] = useState<Step>("contract")
  const [selectedContractId, setSelectedContractId] = useState<string>("")
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("")
  const [selectedProducts, setSelectedProducts] = useState<OrderProduct[]>([])
  const [formData, setFormData] = useState<OrderFormData>({
    requestedBy: "",
    department: "",
    deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    priority: "medium",
    deliveryAddress: "",
    notes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showOrderSummary, setShowOrderSummary] = useState(false)
  const [orderNumber, setOrderNumber] = useState("")
  const [isNavigating, setIsNavigating] = useState(false)
  const [availableSuppliers, setAvailableSuppliers] = useState<SupplierMatch[]>([])
  const [contractHasSupplier, setContractHasSupplier] = useState(false)
  
  // Estados para edição e pesquisa de produtos
  const [editOrderId, setEditOrderId] = useState<string | null>(null)
  const [productSearchQuery, setProductSearchQuery] = useState("")

  // Dados derivados
  const selectedContract = contracts.find((c) => c.id === selectedContractId)
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId)

  // Filtro de contratos com diagnóstico
  const availableContracts = contracts.filter(
    (contract) => contract.status === "ativo" && new Date(contract.expirationDate) > new Date(),
  )

  // Efeito para logar estado dos contratos
  useEffect(() => {
    const now = new Date()
    const contractDiagnostics = contracts.map(c => {
      const isActive = c.status === "ativo"
      const notExpired = new Date(c.expirationDate) > now
      const isAvailable = isActive && notExpired
      
      return {
        id: c.id,
        numero: c.number,
        status: c.status,
        vencimento: c.expirationDate,
        statusAtivo: isActive,
        naoVencido: notExpired,
        disponivel: isAvailable,
        msgDiagnostico: !isActive ? `Status não é 'ativo' (atual: ${c.status})` : !notExpired ? `Contrato vencido em ${new Date(c.expirationDate).toLocaleDateString('pt-BR')}` : "✓ Disponível"
      }
    })
    
    console.log("[NovoPedidoPage] Diagnóstico de Contratos:", {
      totalContratos: contracts.length,
      isLoadingContratos: isContractsLoading,
      disponiveisParaPedido: availableContracts.length,
      detalhes: contractDiagnostics,
    })
  }, [contracts, availableContracts, isContractsLoading])

  // Carregar dados para edição de pedido se editOrderId estiver presente na URL
  useEffect(() => {
    const editId = searchParams.get("edit")
    if (editId && orders.length > 0 && contracts.length > 0) {
      setEditOrderId(editId)
      const orderToEdit = orders.find((o) => o.id === editId)
      if (orderToEdit) {
        setSelectedContractId(orderToEdit.contractId)
        
        // Buscar fornecedor a partir do contrato
        const contract = contracts.find((c) => c.id === orderToEdit.contractId)
        if (contract && contract.supplierId) {
          setSelectedSupplierId(contract.supplierId)
        }
        
        setSelectedProducts(
          orderToEdit.items.map((item) => ({
            id: item.contractItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          }))
        )
        
        setFormData({
          requestedBy: orderToEdit.requestedBy || "",
          department: orderToEdit.requestedByDepartment || "",
          deliveryDate: orderToEdit.deliveryDate
            ? new Date(orderToEdit.deliveryDate)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          priority: orderToEdit.priority || "medium",
          deliveryAddress: orderToEdit.requestedFor || "",
          notes: orderToEdit.notes || "",
        })
        
        setOrderNumber(orderToEdit.number)
        setCurrentStep("products")
      }
    }
  }, [searchParams, orders, contracts])

  const orderToEdit = editOrderId ? orders.find((o) => o.id === editOrderId) : null

  const availableProducts = selectedContract
    ? products.filter((product) => selectedContract.productIds?.includes(product.id))
    : []

  const filteredContractItems = selectedContract?.items
    .filter((item) => 
      item.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(productSearchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aQty = selectedProducts.find((p) => p.id === a.id)?.quantity || 0
      const bQty = selectedProducts.find((p) => p.id === b.id)?.quantity || 0
      if (aQty > 0 && bQty === 0) return -1
      if (aQty === 0 && bQty > 0) return 1
      return 0
    }) || []

  const selectedProductsWithDetails = selectedProducts.map((sp) => {
    const productDetails = products.find((p) => p.id === sp.id)
    const contractItem = selectedContract?.items.find((item) => item.id === sp.id)
    const originalQty = orderToEdit?.items.find((item) => item.contractItemId === sp.id)?.quantity || 0
    return {
      ...sp,
      name: productDetails?.name || contractItem?.name || "",
      description: productDetails?.description || contractItem?.description || "",
      code: productDetails?.sku || "",
      unit: productDetails?.unit || "",
      availableQuantity: contractItem ? contractItem.quantity - contractItem.usedQuantity + originalQty : 0,
    }
  })

  const totalOrderValue = selectedProducts.reduce((sum, product) => sum + product.totalPrice, 0)

  const originalOrderValue = orderToEdit ? orderToEdit.totalValue : 0
  const contractAvailableLimit = selectedContract
    ? selectedContract.value - selectedContract.usedValue + originalOrderValue
    : 0

  const remainingAfterOrder = contractAvailableLimit - totalOrderValue
  const isOverLimit = remainingAfterOrder < 0

  // Função para encontrar fornecedores compatíveis
  const findCompatibleSuppliers = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId)
    if (!contract || !contract.items.length) return []

    const contractItemNames = contract.items.map((item) => item.name.toLowerCase())

    const supplierMatches: SupplierMatch[] = suppliers
      .map((supplier) => {
        const supplierProducts = products.filter((p) => p.supplierId === supplier.id && p.active)

        const matchedProducts = supplierProducts.filter((product) => {
          const productName = product.name.toLowerCase()
          return contractItemNames.some((itemName) => {
            return productName.includes(itemName) || itemName.includes(productName)
          })
        })

        const matchPercentage = (matchedProducts.length / contract.items.length) * 100

        return {
          supplier,
          matchedProducts: matchedProducts.map((p) => p.name),
          matchPercentage,
        }
      })
      .filter((match) => match.matchPercentage > 0)
      .sort((a, b) => b.matchPercentage - a.matchPercentage)

    return supplierMatches
  }

  // Efeitos
  // Pré-selecionar contrato a partir do parâmetro de query
  useEffect(() => {
    const contractIdFromQuery = searchParams.get("contrato")
    if (contractIdFromQuery) {
      console.log("[NovoPedidoPage] Contrato recebido via query:", contractIdFromQuery)
      setSelectedContractId(contractIdFromQuery)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedContractId) {
      const contract = contracts.find((c) => c.id === selectedContractId)

      if (contract?.supplierId) {
        setSelectedSupplierId(contract.supplierId)
        setContractHasSupplier(true)
        setAvailableSuppliers([])
      } else {
        setSelectedSupplierId("")
        setContractHasSupplier(false)
        const compatibleSuppliers = findCompatibleSuppliers(selectedContractId)
        setAvailableSuppliers(compatibleSuppliers)
      }

      setSelectedProducts([])
    }
  }, [selectedContractId, contracts])

  // Handlers
  const handleBack = () => {
    if (currentStep === "supplier") {
      setCurrentStep("contract")
    } else if (currentStep === "products") {
      setCurrentStep("supplier")
    } else if (currentStep === "review") {
      setCurrentStep("products")
    } else if (showOrderSummary) {
      setShowOrderSummary(false)
    }
  }

  const handleNext = () => {
    if (currentStep === "contract" && selectedContractId) {
      setCurrentStep("supplier")
    } else if (currentStep === "supplier" && selectedSupplierId) {
      setCurrentStep("products")
    } else if (currentStep === "products" && selectedProducts.length > 0 && !isOverLimit) {
      setCurrentStep("review")
    }
  }

  const validateDetailsForm = () => {
    return formData.requestedBy && formData.department && formData.deliveryAddress
  }

  const handleProductSelection = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedProducts((prev) => prev.filter((p) => p.id !== productId))
      return
    }

    const contractItem = selectedContract?.items.find((item) => item.id === productId)
    if (!contractItem) return

    const unitPrice = contractItem.unitPrice
    const totalPrice = unitPrice * quantity

    const existingProductIndex = selectedProducts.findIndex((p) => p.id === productId)

    if (existingProductIndex >= 0) {
      const updatedProducts = [...selectedProducts]
      updatedProducts[existingProductIndex] = {
        ...updatedProducts[existingProductIndex],
        quantity,
        unitPrice,
        totalPrice,
      }
      setSelectedProducts(updatedProducts)
    } else {
      setSelectedProducts([
        ...selectedProducts,
        {
          id: productId,
          quantity,
          unitPrice,
          totalPrice,
        },
      ])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData((prev) => ({ ...prev, deliveryDate: date }))
    }
  }

  const handleSubmitOrder = async (status: OrderStatus = "pendente") => {
    try {
      setIsSubmitting(true)

      const finalOrderNumber = editOrderId ? orderNumber : `PED-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`
      if (!editOrderId) {
        setOrderNumber(finalOrderNumber)
      }

      const orderData = {
        number: finalOrderNumber,
        contractId: selectedContractId,
        contractNumber: selectedContract?.number || "",
        date: editOrderId ? (orders.find(o => o.id === editOrderId)?.date || new Date().toISOString()) : new Date().toISOString(),
        requestedBy: formData.requestedBy,
        requestedByDepartment: formData.department,
        requestedFor: formData.deliveryAddress,
        items: selectedProductsWithDetails.map((product) => ({
          id: product.id,
          contractItemId: product.id,
          name: product.name,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          totalPrice: product.totalPrice,
        })),
        totalValue: totalOrderValue,
        status: status,
        deliveryDate: formData.deliveryDate.toISOString(),
        priority: formData.priority,
        notes: formData.notes,
      }

      if (editOrderId) {
        await updateOrder(editOrderId, orderData)
      } else {
        await addOrder(orderData)
      }
      setShowOrderSummary(true)
    } catch (error) {
      console.error("Erro ao salvar pedido:", error)
      alert("Ocorreu um erro ao salvar o pedido. Por favor, tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveAsDraft = () => {
    handleSubmitOrder("rascunho")
  }

  const handlePrintOrder = () => {
    window.print()
  }

  const handleReturnToOrders = () => {
    setIsNavigating(true)
    if (editOrderId) {
      router.push(`/dashboard/pedidos/${editOrderId}`)
    } else {
      router.push("/dashboard/pedidos")
    }
  }

  const handleCancel = () => {
    setIsNavigating(true)
    if (editOrderId) {
      router.push(`/dashboard/pedidos/${editOrderId}`)
    } else {
      router.push("/dashboard/pedidos")
    }
  }

  const isLoading = isSuppliersLoading || isContractsLoading || isProductsLoading || isOrdersLoading

  // Renderização do resumo do pedido
  if (showOrderSummary) {
    return (
      <div className="container mx-auto py-6 space-y-6 print:p-6">
        <div className="flex items-center justify-between print:hidden">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex gap-2">
            {selectedContract && (
              <Button
                variant="destructive"
                onClick={() => {
                  const orderObj = orders.find((o) => o.number === orderNumber) || {
                    id: "temp",
                    number: orderNumber,
                    contractId: selectedContract.id,
                    contractNumber: selectedContract.number,
                    date: new Date().toISOString(),
                    requestedBy: formData.requestedBy,
                    requestedByDepartment: formData.department,
                    requestedFor: formData.deliveryAddress,
                    items: selectedProductsWithDetails.map((p) => ({
                      id: p.id,
                      contractItemId: p.id,
                      name: p.name,
                      quantity: p.quantity,
                      unitPrice: p.unitPrice,
                      totalPrice: p.totalPrice,
                    })),
                    totalValue: totalOrderValue,
                    status: "pendente" as const,
                  }
                  generateOrderExtrapolationReport(orderObj, selectedContract)
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                Relatório de Extrapolação (PDF)
              </Button>
            )}
            <Button variant="outline" onClick={handlePrintOrder}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button onClick={handleReturnToOrders}>
              <Check className="mr-2 h-4 w-4" />
              Concluir
            </Button>
          </div>
        </div>

        {selectedProductsWithDetails.some((p) => {
          const cItem = selectedContract?.items.find((ci) => ci.id === p.id)
          const availableBefore = cItem ? cItem.quantity - (cItem.usedQuantity - p.quantity) : 0
          return p.quantity > availableBefore
        }) && (
          <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertTitle className="font-bold text-red-900">Extrapolação de Limite Contratual Detectada</AlertTitle>
            <AlertDescription className="text-sm text-red-800">
              Este pedido ultrapassou a quantidade/saldo originalmente prevista no contrato. Conforme diretrizes, você pode emitir o relatório de extrapolação acima para instrução do processo contratual.
            </AlertDescription>
          </Alert>
        )}

        <Card className="print:border-none print:shadow-none">
          <CardContent className="p-6">
            <div className="mb-6 border-b pb-4 text-center">
              <h1 className="text-2xl font-bold">Pedido de Compra</h1>
              <p className="text-lg text-gray-600">Nº {orderNumber}</p>
              <p className="text-sm text-gray-500">Emitido em {new Date().toLocaleDateString("pt-BR")}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-lg font-semibold">Informações do Fornecedor</h2>
                <div className="rounded-md border p-4">
                  <p>
                    <strong>Fornecedor:</strong> {selectedSupplier?.name}
                  </p>
                  <p>
                    <strong>CNPJ:</strong> {selectedSupplier?.cnpj}
                  </p>
                  <p>
                    <strong>Telefone:</strong> {selectedSupplier?.contactPhone}
                  </p>
                  <p>
                    <strong>Email:</strong> {selectedSupplier?.email}
                  </p>
                  <p>
                    <strong>Endereço:</strong> {selectedSupplier?.address}
                  </p>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-lg font-semibold">Informações do Contrato</h2>
                <div className="rounded-md border p-4">
                  <p>
                    <strong>Contrato:</strong> {selectedContract?.number}
                  </p>
                  <p>
                    <strong>Valor Total:</strong> {formatCurrency(selectedContract?.value || 0)}
                  </p>
                  <p>
                    <strong>Valor Utilizado:</strong> {formatCurrency(selectedContract?.usedValue || 0)}
                  </p>
                  <p>
                    <strong>Saldo Disponível:</strong> {formatCurrency(contractAvailableLimit)}
                  </p>
                  <p>
                    <strong>Validade:</strong>{" "}
                    {new Date(selectedContract?.expirationDate || "").toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="mb-2 text-lg font-semibold">Informações do Pedido</h2>
              <div className="rounded-md border p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <p>
                    <strong>Solicitante:</strong> {formData.requestedBy}
                  </p>
                  <p>
                    <strong>Departamento:</strong> {formData.department}
                  </p>
                  <p>
                    <strong>Data de Entrega:</strong> {formData.deliveryDate.toLocaleDateString("pt-BR")}
                  </p>
                  <p>
                    <strong>Prioridade:</strong>{" "}
                    {formData.priority === "high" ? "Alta" : formData.priority === "medium" ? "Média" : "Baixa"}
                  </p>
                  <p>
                    <strong>Endereço de Entrega:</strong> {formData.deliveryAddress}
                  </p>
                </div>
                {formData.notes && (
                  <div className="mt-4">
                    <p>
                      <strong>Observações:</strong>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{formData.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h2 className="mb-2 text-lg font-semibold">Produtos</h2>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Valor Unitário</TableHead>
                      <TableHead>Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProductsWithDetails.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{product.code}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell>{product.unit}</TableCell>
                        <TableCell>{formatCurrency(product.unitPrice)}</TableCell>
                        <TableCell>{formatCurrency(product.totalPrice)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-bold">
                        Valor Total do Pedido:
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(totalOrderValue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-10 border-t pt-10 md:grid-cols-3">
              <div className="flex flex-col items-center">
                <div className="mb-2 h-0.5 w-48 bg-gray-300"></div>
                <p className="text-center text-sm">Assinatura do Solicitante</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="mb-2 h-0.5 w-48 bg-gray-300"></div>
                <p className="text-center text-sm">Assinatura do Aprovador</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="mb-2 h-0.5 w-48 bg-gray-300"></div>
                <p className="text-center text-sm">Assinatura do Fornecedor</p>
              </div>
            </div>

            <div className="mt-8 text-center text-xs text-gray-500">
              <p>
                Este documento foi gerado automaticamente pelo Sistema de Contratos em{" "}
                {new Date().toLocaleDateString("pt-BR")}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Renderização principal
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {editOrderId ? `Editar Pedido #${orderNumber}` : "Novo Pedido"}
          </h1>
          <p className="text-gray-500">
            {editOrderId ? "Atualize as informações do pedido selecionado" : "Preencha as informações para criar um novo pedido"}
          </p>
        </div>
        <Button variant="outline" onClick={handleCancel} disabled={isNavigating}>
          {isNavigating ? <LoadingSpinner className="h-4 w-4 mr-2" /> : null}
          Cancelar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner className="h-8 w-8" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando dados...</span>
        </div>
      ) : (
        <>
          {/* Indicador de progresso */}
          <div className="flex items-center justify-between">
            <div className="flex items-center w-full max-w-3xl mx-auto">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  currentStep === "contract"
                    ? "border-primary bg-primary text-white"
                    : "border-primary bg-white text-primary"
                }`}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div className={`h-1 flex-1 ${currentStep !== "contract" ? "bg-primary" : "bg-gray-200"}`}></div>

              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  currentStep === "supplier"
                    ? "border-primary bg-primary text-white"
                    : currentStep === "contract"
                      ? "border-gray-300 bg-white text-gray-500"
                      : "border-primary bg-white text-primary"
                }`}
              >
                <Building className="h-5 w-5" />
              </div>
              <div
                className={`h-1 flex-1 ${currentStep === "products" || currentStep === "review" ? "bg-primary" : "bg-gray-200"}`}
              ></div>

              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  currentStep === "products"
                    ? "border-primary bg-primary text-white"
                    : currentStep === "contract" || currentStep === "supplier"
                      ? "border-gray-300 bg-white text-gray-500"
                      : "border-primary bg-white text-primary"
                }`}
              >
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div className={`h-1 flex-1 ${currentStep === "review" ? "bg-primary" : "bg-gray-200"}`}></div>

              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  currentStep === "review"
                    ? "border-primary bg-primary text-white"
                    : "border-gray-300 bg-white text-gray-500"
                }`}
              >
                <ClipboardList className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Etapa 1: Seleção de Contrato */}
          {currentStep === "contract" && (
            <Card>
              <CardHeader>
                <CardTitle>Selecione o Contrato</CardTitle>
                <CardDescription>Escolha o contrato para este pedido</CardDescription>
              </CardHeader>
              <CardContent>
                {isContractsLoading ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center">
                    <LoadingSpinner className="h-12 w-12 text-blue-600 mb-4" />
                    <h3 className="text-lg font-medium">Carregando contratos...</h3>
                    <p className="text-sm text-gray-500">Aguarde enquanto buscamos os contratos disponíveis.</p>
                  </div>
                ) : availableContracts.length === 0 ? (
                  <>
                    <div className="flex h-64 flex-col items-center justify-center text-center">
                      <FileText className="mb-2 h-12 w-12 text-gray-300" />
                      <h3 className="text-lg font-medium">Nenhum contrato disponível</h3>
                      <p className="text-sm text-gray-500">Não há contratos ativos disponíveis para pedidos.</p>
                    </div>
                    {contracts.length > 0 && (
                      <div className="mt-4 text-xs text-gray-500 max-w-md rounded-lg bg-yellow-50 p-4 border border-yellow-200">
                        <p className="font-medium mb-2 text-yellow-900">📊 Diagnóstico:</p>
                        <p className="mb-2">Total de contratos carregados: <strong>{contracts.length}</strong></p>
                        <div className="text-left space-y-1 text-yellow-800">
                          {contracts.map((c) => {
                            const isActive = c.status === "ativo"
                            const notExpired = new Date(c.expirationDate) > new Date()
                            const reason = !isActive 
                              ? `Status: ${c.status}` 
                              : !notExpired 
                              ? `Vencido em ${new Date(c.expirationDate).toLocaleDateString('pt-BR')}`
                              : "Disponível"
                            return (
                              <p key={c.id} className="text-xs">
                                • {c.number}: {reason}
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {availableContracts.map((contract) => {
                      const usedPercentage = (contract.usedValue / contract.value) * 100
                      const supplier = suppliers.find((s) => s.id === contract.supplierId)

                      return (
                        <div
                          key={contract.id}
                          className={`cursor-pointer rounded-lg border p-4 transition-all hover:border-primary hover:shadow-md ${
                            selectedContractId === contract.id ? "border-primary bg-primary/5" : ""
                          }`}
                          onClick={() => setSelectedContractId(contract.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{contract.number}</h3>
                                <Badge variant="outline">Ativo</Badge>
                                {!contract.supplierId && (
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                    Sem Fornecedor
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">{contract.description}</p>
                              {supplier ? (
                                <p className="text-sm text-gray-600 mt-1">
                                  <strong>Fornecedor:</strong> {supplier.name}
                                </p>
                              ) : (
                                <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4" />
                                  Você poderá escolher um fornecedor compatível na próxima etapa
                                </p>
                              )}
                            </div>
                            {selectedContractId === contract.id && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>Vigência:</span>
                              <span>
                                {new Date(contract.startDate).toLocaleDateString("pt-BR")} a{" "}
                                {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span>Valor Total:</span>
                              <span className="font-medium">{formatCurrency(contract.value)}</span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span>Valor Utilizado:</span>
                              <span>{formatCurrency(contract.usedValue)}</span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span>Saldo Disponível:</span>
                              <span className="font-medium text-green-600">
                                {formatCurrency(contract.value - contract.usedValue)}
                              </span>
                            </div>

                            <div className="mt-2">
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span>Utilização</span>
                                <span>{usedPercentage.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className={`h-full ${
                                    usedPercentage > 90
                                      ? "bg-red-500"
                                      : usedPercentage > 70
                                        ? "bg-yellow-500"
                                        : "bg-green-500"
                                  }`}
                                  style={{ width: `${usedPercentage}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <div></div>
                <Button onClick={handleNext} disabled={!selectedContractId || availableContracts.length === 0}>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Etapa 2: Seleção/Confirmação do Fornecedor */}
          {currentStep === "supplier" && (
            <Card>
              <CardHeader>
                <CardTitle>{contractHasSupplier ? "Fornecedor do Contrato" : "Selecione um Fornecedor"}</CardTitle>
                <CardDescription>
                  {contractHasSupplier
                    ? "Confirme o fornecedor vinculado ao contrato selecionado"
                    : "Escolha um fornecedor compatível com os itens do contrato"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center gap-2 rounded-md bg-gray-50 p-3">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium">{selectedContract?.number}</p>
                    <p className="text-sm text-gray-500">{selectedContract?.description}</p>
                  </div>
                  <ChevronRight className="ml-auto h-5 w-5 text-gray-400" />
                </div>

                {contractHasSupplier ? (
                  // Fornecedor já vinculado ao contrato
                  <>
                    {selectedSupplier ? (
                      <div className="rounded-lg border border-primary bg-primary/5 p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Building className="h-6 w-6 text-primary" />
                              <h3 className="text-xl font-semibold">{selectedSupplier.name}</h3>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 mt-4">
                              <div>
                                <p className="text-sm text-gray-500">CNPJ</p>
                                <p className="font-medium">{selectedSupplier.cnpj}</p>
                              </div>

                              <div>
                                <p className="text-sm text-gray-500">Categoria</p>
                                <p className="font-medium">{selectedSupplier.category}</p>
                              </div>

                              <div>
                                <p className="text-sm text-gray-500">Telefone</p>
                                <p className="font-medium">{selectedSupplier.contactPhone}</p>
                              </div>

                              <div>
                                <p className="text-sm text-gray-500">Email</p>
                                <p className="font-medium">{selectedSupplier.email}</p>
                              </div>

                              <div className="md:col-span-2">
                                <p className="text-sm text-gray-500">Endereço</p>
                                <p className="font-medium">{selectedSupplier.address}</p>
                                <p className="font-medium">
                                  {selectedSupplier.city}/{selectedSupplier.state} - CEP: {selectedSupplier.zipCode}
                                </p>
                              </div>

                              <div>
                                <p className="text-sm text-gray-500">Contato</p>
                                <p className="font-medium">{selectedSupplier.contactName}</p>
                              </div>

                              <div>
                                <p className="text-sm text-gray-500">Avaliação</p>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={i < selectedSupplier.rating ? "text-yellow-500" : "text-gray-300"}
                                    >
                                      ★
                                    </span>
                                  ))}
                                  <span className="ml-1 text-sm">({selectedSupplier.rating}/5)</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-64 flex-col items-center justify-center text-center">
                        <Building className="mb-2 h-12 w-12 text-gray-300" />
                        <h3 className="text-lg font-medium">Fornecedor não encontrado</h3>
                        <p className="text-sm text-gray-500">
                          O contrato selecionado não possui um fornecedor vinculado.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  // Sem fornecedor vinculado - mostrar opções compatíveis
                  <>
                    {availableSuppliers.length === 0 ? (
                      <div className="flex h-64 flex-col items-center justify-center text-center">
                        <Building className="mb-2 h-12 w-12 text-gray-300" />
                        <h3 className="text-lg font-medium">Nenhum fornecedor compatível</h3>
                        <p className="text-sm text-gray-500">
                          Não foram encontrados fornecedores com produtos compatíveis aos itens deste contrato.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Alert className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Fornecedores Sugeridos</AlertTitle>
                          <AlertDescription>
                            Este contrato não possui um fornecedor vinculado. Abaixo estão os fornecedores que possuem
                            produtos compatíveis com os itens do contrato.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-4">
                          {availableSuppliers.map((match) => (
                            <div
                              key={match.supplier.id}
                              className={`cursor-pointer rounded-lg border p-4 transition-all hover:border-primary hover:shadow-md ${
                                selectedSupplierId === match.supplier.id ? "border-primary bg-primary/5" : ""
                              }`}
                              onClick={() => setSelectedSupplierId(match.supplier.id)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Building className="h-5 w-5 text-gray-500" />
                                    <h3 className="font-semibold">{match.supplier.name}</h3>
                                    <Badge
                                      variant="outline"
                                      className={
                                        match.matchPercentage === 100
                                          ? "bg-green-50 text-green-700 border-green-200"
                                          : match.matchPercentage >= 50
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : "bg-yellow-50 text-yellow-700 border-yellow-200"
                                      }
                                    >
                                      {match.matchPercentage.toFixed(0)}% compatível
                                    </Badge>
                                  </div>

                                  <div className="grid gap-2 text-sm md:grid-cols-2 mt-3">
                                    <div>
                                      <span className="text-gray-500">CNPJ:</span>{" "}
                                      <span className="font-medium">{match.supplier.cnpj}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Categoria:</span>{" "}
                                      <span className="font-medium">{match.supplier.category}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Telefone:</span>{" "}
                                      <span className="font-medium">{match.supplier.contactPhone}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Avaliação:</span>{" "}
                                      <span className="font-medium">
                                        {"★".repeat(match.supplier.rating)}
                                        {"☆".repeat(5 - match.supplier.rating)} ({match.supplier.rating}/5)
                                      </span>
                                    </div>
                                  </div>

                                  {match.matchedProducts.length > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                      <p className="text-sm text-gray-600 mb-2">
                                        <strong>Produtos compatíveis:</strong>
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {match.matchedProducts.slice(0, 3).map((product, idx) => (
                                          <Badge key={idx} variant="secondary" className="text-xs">
                                            {product}
                                          </Badge>
                                        ))}
                                        {match.matchedProducts.length > 3 && (
                                          <Badge variant="secondary" className="text-xs">
                                            +{match.matchedProducts.length - 3} mais
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {selectedSupplierId === match.supplier.id && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white ml-3">
                                    <Check className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!selectedSupplierId || (!contractHasSupplier && availableSuppliers.length === 0)}
                >
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Etapa 3: Seleção de Produtos */}
          {currentStep === "products" && (
            <Card>
              <CardHeader>
                <CardTitle>Produtos do Contrato</CardTitle>
                <CardDescription>Selecione os produtos e quantidades para este pedido</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 space-y-2">
                  <div className="flex flex-col gap-2 rounded-md bg-gray-50 p-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium">{selectedContract?.number}</p>
                      </div>
                    </div>
                    <ChevronRight className="hidden h-5 w-5 text-gray-400 sm:block" />
                    <div className="flex items-center gap-2">
                      <Building className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium">{selectedSupplier?.name}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-md border p-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm text-gray-500">Valor Total do Contrato</p>
                      <p className="text-lg font-medium">{formatCurrency(selectedContract?.value || 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Limite Disponível</p>
                      <p className="text-lg font-medium text-green-600">{formatCurrency(contractAvailableLimit)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Saldo Após Pedido</p>
                      <p className={`text-lg font-medium ${isOverLimit ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(remainingAfterOrder)}
                      </p>
                    </div>
                  </div>

                  {isOverLimit && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTitle>Limite excedido!</AlertTitle>
                      <AlertDescription>
                        O valor total do pedido excede o limite disponível do contrato. Reduza a quantidade de produtos.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {selectedContract && selectedContract.items.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center">
                    <ShoppingCart className="mb-2 h-12 w-12 text-gray-300" />
                    <h3 className="text-lg font-medium">Nenhum produto disponível</h3>
                    <p className="text-sm text-gray-500">Este contrato não possui itens cadastrados.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                      <Input
                        placeholder="Buscar produto pelo nome ou descrição..."
                        className="pl-8"
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                      />
                    </div>
                    {filteredContractItems.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center text-center border rounded-md">
                        <p className="text-sm text-gray-500">Nenhum produto correspondente encontrado.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produto</TableHead>
                              <TableHead>Qtd. Disponível</TableHead>
                              <TableHead>Valor Unitário</TableHead>
                              <TableHead>Quantidade</TableHead>
                              <TableHead>Valor Total</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredContractItems.map((item) => {
                              const selectedProduct = selectedProducts.find((p) => p.id === item.id)
                              const quantity = selectedProduct?.quantity || 0
                              const totalPrice = item.unitPrice * quantity
                              const originalQty = orderToEdit?.items.find((oItem) => oItem.contractItemId === item.id)?.quantity || 0
                              const availableQuantity = item.quantity - item.usedQuantity + originalQty

                              const isExceeded = quantity > availableQuantity && availableQuantity >= 0
                              const exceededQty = isExceeded ? quantity - availableQuantity : (availableQuantity < 0 ? quantity : 0)

                              return (
                                <TableRow key={item.id} className={quantity > 0 ? (isExceeded ? "bg-red-50/50 hover:bg-red-50/70" : "bg-blue-50/40 hover:bg-blue-50/60") : ""}>
                                  <TableCell>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium">{item.name}</p>
                                        {quantity > 0 && !isExceeded && (
                                          <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] py-0 px-1.5 h-4 font-normal">
                                            No Pedido
                                          </Badge>
                                        )}
                                        {exceededQty > 0 && (
                                          <Badge variant="destructive" className="bg-red-600 text-white text-[10px] py-0 px-1.5 h-4 font-semibold animate-pulse">
                                            Extrapolado (+{exceededQty})
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500">{item.description}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <Badge
                                        variant={
                                          availableQuantity > item.quantity * 0.5
                                            ? "default"
                                            : availableQuantity > 0
                                              ? "secondary"
                                              : "destructive"
                                        }
                                      >
                                        {availableQuantity} de {item.quantity}
                                      </Badge>
                                      {exceededQty > 0 && (
                                        <span className="text-[11px] font-bold text-red-600">
                                          Excesso: +{exceededQty} un ({formatCurrency(exceededQty * item.unitPrice)})
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                                  <TableCell>
                                    <div className="flex w-32 items-center">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-r-none bg-transparent"
                                        onClick={() => handleProductSelection(item.id, Math.max(0, quantity - 1))}
                                        disabled={quantity === 0}
                                      >
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={quantity}
                                        onChange={(e) => {
                                          const value = Number.parseInt(e.target.value) || 0
                                          handleProductSelection(item.id, Math.max(0, value))
                                        }}
                                        className={`h-8 rounded-none border-x-0 text-center ${exceededQty > 0 ? "border-red-500 font-bold text-red-600 bg-red-50" : ""}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-l-none bg-transparent"
                                        onClick={() =>
                                          handleProductSelection(item.id, quantity + 1)
                                        }
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className={quantity > 0 ? "font-medium" : ""}>
                                    {formatCurrency(totalPrice)}
                                  </TableCell>
                                  <TableCell>
                                    {quantity > 0 && (
                                      <Button variant="ghost" size="sm" onClick={() => handleProductSelection(item.id, 0)}>
                                        Remover
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                            {selectedProducts.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="text-right font-bold">
                                  Valor Total do Pedido:
                                </TableCell>
                                <TableCell className="font-bold">{formatCurrency(totalOrderValue)}</TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                {editOrderId ? (
                  <Button variant="outline" onClick={() => router.push(`/dashboard/pedidos/${editOrderId}`)}>
                    Cancelar Edição
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  disabled={selectedProducts.length === 0 || isOverLimit || !selectedContract?.items.length}
                >
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Etapa 4: Revisão e Confirmação */}
          {currentStep === "review" && (
            <Card>
              <CardHeader>
                <CardTitle>Confirmar Pedido</CardTitle>
                <CardDescription>Preencha os dados finais e revise as informações do pedido</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Resumo do Pedido */}
                  <div className="rounded-md border p-4 bg-gray-50">
                    <h3 className="font-semibold mb-3">Resumo do Pedido</h3>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Contrato:</span>
                        <span className="font-medium">{selectedContract?.number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fornecedor:</span>
                        <span className="font-medium">{selectedSupplier?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Quantidade de Itens:</span>
                        <span className="font-medium">{selectedProducts.length}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600 font-semibold">Valor Total:</span>
                        <span className="font-bold text-lg">{formatCurrency(totalOrderValue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Formulário de Detalhes */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Informações do Solicitante</h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="requestedBy">Nome do Solicitante *</Label>
                        <Input
                          id="requestedBy"
                          name="requestedBy"
                          value={formData.requestedBy}
                          onChange={handleInputChange}
                          placeholder="Digite seu nome completo"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="department">Departamento *</Label>
                        <Input
                          id="department"
                          name="department"
                          value={formData.department}
                          onChange={handleInputChange}
                          placeholder="Digite seu departamento"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="deliveryDate">Data de Entrega</Label>
                        <DatePicker date={formData.deliveryDate} onDateChange={handleDateChange} id="deliveryDate" />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="priority">Prioridade</Label>
                        <Select
                          value={formData.priority}
                          onValueChange={(value) => handleSelectChange("priority", value)}
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

                    <div className="space-y-2">
                      <Label htmlFor="deliveryAddress">Endereço de Entrega *</Label>
                      <Input
                        id="deliveryAddress"
                        name="deliveryAddress"
                        value={formData.deliveryAddress}
                        onChange={handleInputChange}
                        placeholder="Digite o endereço completo para entrega"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Informações adicionais sobre o pedido"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">Produtos Selecionados</h3>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Valor Unit.</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProductsWithDetails.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-mono text-sm">{product.code}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{product.name}</p>
                                  {product.description && (
                                    <p className="text-xs text-gray-500">{product.description}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {product.quantity} {product.unit}
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(product.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(product.totalPrice)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-gray-50">
                            <TableCell colSpan={4} className="text-right font-bold">
                              Valor Total do Pedido:
                            </TableCell>
                            <TableCell className="text-right font-bold text-lg">
                              {formatCurrency(totalOrderValue)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSaveAsDraft}
                    disabled={isSubmitting || !validateDetailsForm()}
                  >
                    {isSubmitting ? <LoadingSpinner className="h-4 w-4 mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar como Rascunho
                  </Button>
                  <Button onClick={() => handleSubmitOrder()} disabled={isSubmitting || !validateDetailsForm()}>
                    {isSubmitting ? <LoadingSpinner className="h-4 w-4 mr-2" /> : <Truck className="mr-2 h-4 w-4" />}
                    {editOrderId && orders.find((o) => o.id === editOrderId)?.status === "pendente" ? "Salvar Alterações" : "Finalizar Pedido"}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
