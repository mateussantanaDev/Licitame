"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useReports, type ReportFormat, type ReportFilter } from "@/lib/reports-provider"
import { useContracts } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useProducts } from "@/lib/products-provider"
import { useCostBase } from "@/lib/cost-base-provider"
import { getCanonicalCostBases, matchCostBase, removeAccents } from "@/lib/cost-base-utils"
import { formatCpfCnpj } from "@/lib/utils"
import {
  FileText,
  Download,
  FileSpreadsheet,
  FileCheck,
  Package,
  Building2,
  ShoppingCart,
  Database,
  Search,
  Check,
  ChevronsUpDown,
  X,
} from "lucide-react"

type AvailableSupplierOption = {
  key: string
  name: string
  cnpj?: string
  orderCount: number
  contractCount: number
}

function SupplierFilterCombobox({
  id,
  suppliers,
  value,
  onChange,
  allLabel = "Todos os fornecedores",
  countMode = "both",
}: {
  id: string
  suppliers: AvailableSupplierOption[]
  value?: string
  onChange: (nextValue?: string) => void
  allLabel?: string
  countMode?: "contracts" | "orders" | "both"
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selected = useMemo(() => {
    if (!value || value === "all") return undefined
    const target = value.toLowerCase().trim()
    return suppliers.find((s) => s.key.toLowerCase().trim() === target)
  }, [suppliers, value])

  const filtered = useMemo(() => {
    const rawTerm = search.trim()
    if (!rawTerm) return suppliers
    const normTerm = removeAccents(rawTerm)
    const digitsTerm = rawTerm.replace(/\D/g, "")

    return suppliers.filter((s) => {
      const normName = removeAccents(s.name)
      const digitsCnpj = (s.cnpj || "").replace(/\D/g, "")
      const matchName = normName.includes(normTerm)
      const matchCnpj =
        (s.cnpj && s.cnpj.toLowerCase().includes(rawTerm.toLowerCase())) ||
        (digitsTerm.length >= 2 && digitsCnpj.includes(digitsTerm))
      return matchName || Boolean(matchCnpj)
    })
  }, [suppliers, search])

  const formatCount = (s: AvailableSupplierOption) => {
    if (countMode === "contracts") {
      return s.contractCount > 0 ? `(${s.contractCount} contrato${s.contractCount !== 1 ? "s" : ""})` : ""
    }
    if (countMode === "orders") {
      return s.orderCount > 0 ? `(${s.orderCount} pedido${s.orderCount !== 1 ? "s" : ""})` : ""
    }
    return `(${s.contractCount} contr. / ${s.orderCount} ped.)`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-auto min-h-10 py-1.5 px-3 justify-between font-normal bg-background text-left"
        >
          {selected ? (
            <div className="flex flex-col text-left leading-tight overflow-hidden mr-2">
              <span className="font-medium text-sm text-foreground truncate">{selected.name}</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {selected.cnpj ? `CNPJ: ${selected.cnpj}` : "CNPJ não informado"}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground truncate">{allLabel}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-2" align="start">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar fornecedor por nome ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 text-sm h-9"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
                setSearch("")
              }}
              className={`w-full flex items-center justify-between py-2 px-2.5 rounded-md text-left text-sm hover:bg-accent transition-colors ${
                !selected ? "bg-accent/60 font-medium" : ""
              }`}
            >
              <span>{allLabel}</span>
              {!selected && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>

            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum fornecedor encontrado para &ldquo;{search}&rdquo;.
              </p>
            ) : (
              filtered.map((s) => {
                const isSelected = selected?.key === s.key
                const countStr = formatCount(s)
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      onChange(s.key)
                      setOpen(false)
                      setSearch("")
                    }}
                    className={`w-full flex items-center justify-between py-2 px-2.5 rounded-md text-left text-sm hover:bg-accent transition-colors ${
                      isSelected ? "bg-accent/60 font-medium" : ""
                    }`}
                  >
                    <div className="flex flex-col overflow-hidden mr-2 leading-tight">
                      <span className="font-medium text-sm text-foreground truncate">
                        {s.name} {countStr && <span className="text-muted-foreground font-normal">{countStr}</span>}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {s.cnpj ? `CNPJ: ${s.cnpj}` : "CNPJ não informado"}
                      </span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function RelatoriosPage() {
  const { generateReport, generateBackup } = useReports()
  const { contracts } = useContracts()
  const { orders } = useOrders()
  const { suppliers } = useSuppliers()
  const { products } = useProducts()
  const { costBases } = useCostBase()

  const [format, setFormat] = useState<ReportFormat>("pdf")
  const [filters, setFilters] = useState<ReportFilter>({})

  // Obter bases de custo consolidadas e agrupadas a partir dos próprios contratos
  const canonicalCostBases = useMemo(() => getCanonicalCostBases(contracts), [contracts])

  // Obter lista consolidada e única de fornecedores (cadastrados e vinculados a contratos)
  const availableSuppliers = useMemo(() => {
    const map = new Map<string, { key: string; name: string; cnpj?: string; orderCount: number; contractCount: number }>()

    const contractMap = new Map<string, { company: string; cnpj?: string }>()
    contracts.forEach((c) => {
      const comp = c.company?.trim()
      if (comp) {
        if (c.id) contractMap.set(c.id, { company: comp, cnpj: c.cnpj })
        if (c.number) contractMap.set(c.number, { company: comp, cnpj: c.cnpj })
      }
    })

    const orderCountByCompany = new Map<string, number>()
    orders.forEach((o) => {
      const info = contractMap.get(o.contractId) || contractMap.get(o.contractNumber)
      if (info) {
        const key = info.company.toLowerCase()
        orderCountByCompany.set(key, (orderCountByCompany.get(key) || 0) + 1)
      }
    })

    const contractCountByCompany = new Map<string, number>()
    contracts.forEach((c) => {
      const comp = c.company?.trim()
      if (comp) {
        const key = comp.toLowerCase()
        contractCountByCompany.set(key, (contractCountByCompany.get(key) || 0) + 1)
      }
    })

    // Do cadastro oficial de fornecedores
    suppliers.forEach((s) => {
      const name = s.name?.trim()
      if (name) {
        const key = name.toLowerCase()
        const orderCount = orderCountByCompany.get(key) || 0
        const contractCount = contractCountByCompany.get(key) || 0
        map.set(key, { key: name, name, cnpj: formatCpfCnpj(s.cnpj), orderCount, contractCount })
      }
    })

    // Dos contratos existentes (com fallback de CNPJ pelo cadastro oficial)
    contracts.forEach((c) => {
      const name = c.company?.trim()
      if (name) {
        const key = name.toLowerCase()
        const orderCount = orderCountByCompany.get(key) || 0
        const contractCount = contractCountByCompany.get(key) || 0
        let rawCnpj = c.cnpj?.trim() || ""
        if (!rawCnpj && c.supplierId) {
          rawCnpj = suppliers.find((s) => s.id === c.supplierId)?.cnpj || ""
        }
        const formattedCnpj = formatCpfCnpj(rawCnpj)
        if (!map.has(key)) {
          map.set(key, { key: name, name, cnpj: formattedCnpj, orderCount, contractCount })
        } else if (!map.get(key)!.cnpj && formattedCnpj) {
          map.get(key)!.cnpj = formattedCnpj
        }
      }
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [suppliers, contracts, orders])

  const selectedSupplierInfo = useMemo(() => {
    if (!filters.supplier || filters.supplier === "all") return undefined
    const target = filters.supplier.toLowerCase().trim()
    return availableSuppliers.find((s) => s.key.toLowerCase().trim() === target)
  }, [availableSuppliers, filters.supplier])

  // Pré-visualização dinâmica dos pedidos para a aba Pedidos e Dossiê Individual do Fornecedor
  const filterOrdersBySupplierAndPeriod = (ignoreCostBase: boolean) => {
    let list = [...orders]
    if (filters.startDate) {
      list = list.filter((o) => new Date(o.date) >= new Date(filters.startDate!))
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate!)
      end.setHours(23, 59, 59, 999)
      list = list.filter((o) => new Date(o.date) <= end)
    }
    const statusClean = filters.status?.toLowerCase().trim()
    if (statusClean && !["all", "ativo", "inativo"].includes(statusClean)) {
      list = list.filter((o) => o.status?.toLowerCase().trim() === statusClean)
    }
    if (filters.supplier && filters.supplier !== "all") {
      const target = filters.supplier.toLowerCase().trim()
      const targetClean = target.replace(/\D/g, "")
      list = list.filter((o) => {
        const contract = contracts.find((c) => c.id === o.contractId || c.number === o.contractNumber)
        if (!contract) return false
        const comp = (contract.company || "").toLowerCase().trim()
        const suppId = (contract.supplierId || "").toLowerCase().trim()
        const cnpj = (contract.cnpj || "").replace(/\D/g, "")
        return (
          comp === target ||
          suppId === target ||
          (comp && (comp.includes(target) || target.includes(comp))) ||
          (targetClean.length >= 8 && cnpj.includes(targetClean))
        )
      })
    }
    if (!ignoreCostBase && filters.costBase && filters.costBase !== "all") {
      list = list.filter((o) => {
        const contract = contracts.find((c) => c.id === o.contractId || c.number === o.contractNumber)
        return matchCostBase(contract?.costBase || o.requestedByDepartment, filters.costBase!)
      })
    }
    return list
  }

  const previewOrders = useMemo(() => filterOrdersBySupplierAndPeriod(false), [orders, contracts, filters])
  const previewSupplierOrders = useMemo(() => filterOrdersBySupplierAndPeriod(true), [orders, contracts, filters])

  const handleGenerateReport = (type: "contracts" | "orders" | "suppliers" | "products" | "costbase") => {
    generateReport(type, format, filters)
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Relatórios</h2>
          <p className="text-muted-foreground">Gere relatórios detalhados do sistema</p>
        </div>
        <Button onClick={generateBackup} variant="outline" size="lg">
          <Database className="mr-2 h-4 w-4" />
          Backup Completo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contracts.length}</div>
            <p className="text-xs text-muted-foreground">registros disponíveis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">registros disponíveis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.length}</div>
            <p className="text-xs text-muted-foreground">registros disponíveis</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">registros disponíveis</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="contracts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="costbase">Bases de Custo</TabsTrigger>
        </TabsList>

        <Card>
          <CardHeader>
            <CardTitle>Configurações do Relatório</CardTitle>
            <CardDescription>Selecione o formato e aplique filtros</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="format">Formato</Label>
                <Select value={format} onValueChange={(value) => setFormat(value as ReportFormat)}>
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">
                      <div className="flex items-center">
                        <FileText className="mr-2 h-4 w-4" />
                        PDF
                      </div>
                    </SelectItem>
                    <SelectItem value="excel">
                      <div className="flex items-center">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Excel/CSV
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Data Inicial</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={filters.startDate || ""}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">Data Final</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={filters.endDate || ""}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="contracts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Contratos</CardTitle>
              <CardDescription>Gere relatórios executivos de contratos com controle de vigência e saldo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="contractStatus">Status</Label>
                  <Select
                    value={filters.status || "all"}
                    onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="contractStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="extrapolado">Extrapolado</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="expirado">Expirado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contractCostBase">Secretaria / Base de Custo</Label>
                  <Select
                    value={filters.costBase || "all"}
                    onValueChange={(value) => setFilters({ ...filters, costBase: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="contractCostBase">
                      <SelectValue placeholder="Todas as secretarias / bases" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as secretarias / bases</SelectItem>
                      {canonicalCostBases.map((cb) => (
                        <SelectItem key={cb.key} value={cb.key}>
                          {cb.label} ({cb.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contractSupplier">Fornecedor Contratado</Label>
                  <SupplierFilterCombobox
                    id="contractSupplier"
                    suppliers={availableSuppliers}
                    value={filters.supplier}
                    onChange={(nextSupplier) => setFilters({ ...filters, supplier: nextSupplier })}
                    allLabel="Todos os fornecedores"
                    countMode="contracts"
                  />
                </div>
              </div>
              <Button onClick={() => handleGenerateReport("contracts")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Gerar Relatório de Contratos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Pedidos</CardTitle>
              <CardDescription>
                Gere relatórios executivos de pedidos com discriminação de itens, fornecedor contratado, secretaria e status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="orderSupplier">Fornecedor Contratado</Label>
                  <SupplierFilterCombobox
                    id="orderSupplier"
                    suppliers={availableSuppliers}
                    value={filters.supplier}
                    onChange={(nextSupplier) => setFilters({ ...filters, supplier: nextSupplier })}
                    allLabel="Todos os fornecedores"
                    countMode="orders"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderStatus">Status do Pedido</Label>
                  <Select
                    value={filters.status || "all"}
                    onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="orderStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em separação">Em Separação</SelectItem>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="entregue">Entregue</SelectItem>
                      <SelectItem value="concluído">Concluído</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderCostBase">Secretaria / Base de Custo</Label>
                  <Select
                    value={filters.costBase || "all"}
                    onValueChange={(value) => setFilters({ ...filters, costBase: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="orderCostBase">
                      <SelectValue placeholder="Todas as secretarias / bases" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as secretarias / bases</SelectItem>
                      {canonicalCostBases.map((cb) => (
                        <SelectItem key={cb.key} value={cb.key}>
                          {cb.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Pedidos filtrados: {previewOrders.length} {previewOrders.length === 1 ? "registro" : "registros"}
                </span>
                <span>
                  Valor total correspondente:{" "}
                  <strong className="text-foreground">
                    R${" "}
                    {previewOrders
                      .reduce((sum, o) => sum + (o.totalValue || 0), 0)
                      .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>

              <Button onClick={() => handleGenerateReport("orders")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Gerar Relatório de Pedidos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Fornecedores</CardTitle>
              <CardDescription>
                Gere o relatório geral consolidado ou escolha um fornecedor específico para visualizar o dossiê individual com todos os contratos e pedidos feitos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplierSelect">Fornecedor (Individual ou Todos)</Label>
                  <SupplierFilterCombobox
                    id="supplierSelect"
                    suppliers={availableSuppliers}
                    value={filters.supplier}
                    onChange={(nextSupplier) => {
                      const cleanedStatus =
                        nextSupplier && (filters.status === "ativo" || filters.status === "inativo")
                          ? undefined
                          : !nextSupplier &&
                              filters.status &&
                              !["ativo", "inativo"].includes(filters.status)
                            ? undefined
                            : filters.status
                      setFilters({ ...filters, supplier: nextSupplier, status: cleanedStatus })
                    }}
                    allLabel="Todos os fornecedores (Relatório Geral)"
                    countMode="both"
                  />
                </div>

                {selectedSupplierInfo ? (
                  <div className="space-y-2">
                    <Label htmlFor="supplierOrderStatus">Status dos Pedidos do Fornecedor</Label>
                    <Select
                      value={
                        filters.status && !["ativo", "inativo"].includes(filters.status)
                          ? filters.status
                          : "all"
                      }
                      onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                    >
                      <SelectTrigger id="supplierOrderStatus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os pedidos</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em separação">Em Separação</SelectItem>
                        <SelectItem value="realizado">Realizado</SelectItem>
                        <SelectItem value="entregue">Entregue</SelectItem>
                        <SelectItem value="concluído">Concluído</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="supplierStatus">Status do Fornecedor</Label>
                    <Select
                      value={filters.status === "ativo" || filters.status === "inativo" ? filters.status : "all"}
                      onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                    >
                      <SelectTrigger id="supplierStatus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {selectedSupplierInfo && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Dossiê Individual: {selectedSupplierInfo.contractCount} contrato(s) • {previewSupplierOrders.length}{" "}
                    {previewSupplierOrders.length === 1 ? "pedido encontrado" : "pedidos encontrados"}
                  </span>
                  <span>
                    Volume em pedidos:{" "}
                    <strong className="text-foreground">
                      R${" "}
                      {previewSupplierOrders
                        .reduce((sum, o) => sum + (o.totalValue || 0), 0)
                        .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                </div>
              )}

              <Button onClick={() => handleGenerateReport("suppliers")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                {selectedSupplierInfo
                  ? "Gerar Relatório Individual do Fornecedor"
                  : "Gerar Relatório Geral de Fornecedores"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Produtos</CardTitle>
              <CardDescription>Gere relatórios detalhados de produtos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="productStatus">Status</Label>
                  <Select
                    value={filters.status || "all"}
                    onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="productStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="productCategory">Categoria</Label>
                  <Select
                    value={filters.category || "all"}
                    onValueChange={(value) => setFilters({ ...filters, category: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="productCategory">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="Escritório">Escritório</SelectItem>
                      <SelectItem value="Limpeza">Limpeza</SelectItem>
                      <SelectItem value="Alimentação">Alimentação</SelectItem>
                      <SelectItem value="Tecnologia">Tecnologia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => handleGenerateReport("products")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Gerar Relatório de Produtos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costbase" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Bases de Custo</CardTitle>
              <CardDescription>Gere relatórios detalhados de bases de custo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => handleGenerateReport("costbase")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Gerar Relatório de Bases de Custo
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
