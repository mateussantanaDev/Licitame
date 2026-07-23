"use client"

import type React from "react"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useOrders } from "@/lib/orders-provider"
import { useContracts, type Contract } from "@/lib/contracts-provider"
import { useSuppliers, type Supplier } from "@/lib/suppliers-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Eye, FileText, Filter, Plus, Search, SlidersHorizontal, Printer } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

// Tipos bem definidos
type OrderStatus = "rascunho" | "pendente" | "aprovado" | "rejeitado" | "entregue"

interface EnrichedOrder {
  id: string
  number: string
  date: string
  totalValue: number
  status: OrderStatus
  contract: Contract
  supplier: Supplier
}

// Componente de spinner de carregamento
const LoadingSpinner = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <div className={`inline-block animate-spin ${className}`} style={{ width: size, height: size }}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  </div>
)

// Funções auxiliares (Clean Architecture - Domain Layer)
const createEmptySupplier = (id: string): Supplier => ({
  id,
  name: "Fornecedor não encontrado",
  cnpj: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  contactName: "",
  contactPhone: "",
  email: "",
  category: "Sem categoria",
  rating: 0,
  active: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const createEmptyContract = (id: string): Contract => ({
  id,
  number: "Contrato não encontrado",
  company: "Empresa não informada",
  value: 0,
  usedValue: 0,
  usedPercentage: 0,
  expirationDate: new Date().toISOString(),
  startDate: new Date().toISOString(),
  costBase: "Base não informada",
  description: "Sem descrição",
  items: [],
  status: "cancelado",
})

const enrichOrder = (
  order: any,
  contracts: Contract[],
  suppliers: Supplier[]
): EnrichedOrder => {
  const contract = contracts.find((c) => c.id === order.contractId) ?? createEmptyContract(order.contractId || "unknown")
  const supplier = suppliers.find((s) => s.id === contract.supplierId) ?? createEmptySupplier(contract.supplierId || "unknown")

  return {
    id: order.id,
    number: order.number || `Pedido-${order.id.slice(0, 8)}`,
    date: order.date || new Date().toISOString(),
    totalValue: order.totalValue ?? 0,
    status: (order.status || "pendente") as OrderStatus,
    contract,
    supplier,
  }
}

const matchesSearchTerm = (order: EnrichedOrder, searchTerm: string): boolean => {
  const lowerSearch = searchTerm.toLowerCase()
  return (
    order.number.toLowerCase().includes(lowerSearch) ||
    order.contract.company.toLowerCase().includes(lowerSearch) ||
    order.supplier.name.toLowerCase().includes(lowerSearch)
  )
}

const matchesStatusFilter = (order: EnrichedOrder, statusFilter: string): boolean => {
  return statusFilter === "todos" || order.status === statusFilter
}

const formatDate = (dateString: string | number | Date): string => {
  try {
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? "Data inválida" : date.toLocaleDateString("pt-BR")
  } catch {
    return "Data inválida"
  }
}

const getStatusBadgeVariant = (status: OrderStatus): "default" | "secondary" | "destructive" | "outline" => {
  const variants: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
    rascunho: "outline",
    aprovado: "default",
    pendente: "secondary",
    rejeitado: "destructive",
    entregue: "outline",
  }
  return variants[status] ?? "outline"
}

// Componente Principal
export default function PedidosPage() {
  const router = useRouter()
  const { orders, isLoading: isLoadingOrders } = useOrders()
  const { contracts, isLoading: isLoadingContracts } = useContracts()
  const { suppliers, isLoading: isLoadingSuppliers } = useSuppliers()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("todos")
  const [isNavigating, setIsNavigating] = useState(false)

  // Enriquecer dados com memoização para performance
  const enrichedOrders = useMemo(
    () => orders.map((order) => enrichOrder(order, contracts, suppliers)),
    [orders, contracts, suppliers]
  )

  // Filtrar com memoização
  const filteredOrders = useMemo(
    () =>
      enrichedOrders.filter(
        (order) => matchesSearchTerm(order, searchTerm) && matchesStatusFilter(order, statusFilter)
      ),
    [enrichedOrders, searchTerm, statusFilter]
  )

  const handleNewOrderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsNavigating(true)
    router.push("/dashboard/pedidos/novo")
  }

  const handleViewOrder = (orderId: string) => {
    setIsNavigating(true)
    router.push(`/dashboard/pedidos/${orderId}`)
  }

  const handlePrintOrder = (orderId: string, orderNumber: string) => {
    setIsNavigating(true)
    router.push(`/dashboard/pedidos/${orderId}/imprimir`)
  }

  const isLoading = isLoadingOrders || isLoadingContracts || isLoadingSuppliers

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <Button onClick={handleNewOrderClick} disabled={isNavigating} type="button">
          {isNavigating ? <LoadingSpinner size={16} className="mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
          Novo Pedido
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gerenciar Pedidos</CardTitle>
          <CardDescription>Visualize e gerencie todos os pedidos do sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar por número, contrato ou fornecedor..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="rejeitado">Rejeitado</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <LoadingSpinner size={32} />
              <span className="ml-2 text-sm text-muted-foreground">Carregando pedidos...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <FileText className="mb-2 h-12 w-12 text-gray-300" />
              <h3 className="text-lg font-medium">Nenhum pedido encontrado</h3>
              <p className="text-sm text-gray-500">
                {searchTerm || statusFilter !== "todos"
                  ? "Tente ajustar os filtros para ver mais resultados."
                  : "Clique em 'Novo Pedido' para criar seu primeiro pedido."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.number}</TableCell>
                      <TableCell>{formatDate(order.date)}</TableCell>
                      <TableCell>{order.contract.number}</TableCell>
                      <TableCell>{order.supplier.name}</TableCell>
                      <TableCell>{formatCurrency(order.totalValue)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handlePrintOrder(order.id, order.number)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Reimprimir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
