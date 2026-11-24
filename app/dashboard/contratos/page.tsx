"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useContracts } from "@/lib/contracts-provider"
import { useAuth } from "@/lib/auth-provider"
import { formatCurrency, calculateDaysRemaining, calculateDaysExpired } from "@/lib/utils"
import { getCanonicalCostBases, matchCostBase } from "@/lib/cost-base-utils"
import { FileText, MoreHorizontal, Plus, Search, Upload, Download } from "lucide-react"
import { ContractImportDialog } from "@/components/contract-import-dialog"
import { useToast } from "@/hooks/use-toast"

export default function ContratosPage() {
  const { contracts, isLoading, exportData } = useContracts()
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("todos")
  const [baseFilter, setBaseFilter] = useState("todas")
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const isAdmin = user?.role === "admin"
  const isCompras = user?.role === "compras" || isAdmin

  useEffect(() => {
    console.log("[ContratosPage] Estado atual:", {
      isLoading,
      contractsCount: contracts.length,
      contracts: contracts,
    })
  }, [isLoading, contracts])

  // Obter bases de custo consolidadas e agrupadas
  const costBases = useMemo(() => getCanonicalCostBases(contracts), [contracts])

  // Filtrar contratos
  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      (contract.number?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (contract.company?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (contract.description?.toLowerCase() || "").includes(search.toLowerCase())

    const matchesStatus = statusFilter === "todos" || contract.status === statusFilter
    const matchesBase = baseFilter === "todas" || matchCostBase(contract.costBase, baseFilter)

    return matchesSearch && matchesStatus && matchesBase
  })

  const handleExport = () => {
    exportData()
    toast({
      title: "Exportação concluída",
      description: "Os contratos foram exportados com sucesso.",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Contratos</h1>
        <div className="flex gap-2">
          {isCompras && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
              <Button onClick={() => router.push("/dashboard/contratos/novo")}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Contrato
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gerenciar Contratos</CardTitle>
          <CardDescription>Visualize e gerencie todos os contratos do sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700 font-medium">⏳ Carregando contratos...</p>
            </div>
          )}
          <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar contratos..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="vencido">Vencidos</SelectItem>
                  <SelectItem value="expirado">Expirados</SelectItem>
                  <SelectItem value="cancelado">Cancelados</SelectItem>
                </SelectContent>
              </Select>

              <Select value={baseFilter} onValueChange={setBaseFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Base de Custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as bases</SelectItem>
                  {costBases.map((base) => (
                    <SelectItem key={base.key} value={base.key}>
                      {base.label} ({base.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isLoading && contracts.length > 0 && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                ✓ {contracts.length} contrato(s) carregado(s) • Mostrando {filteredContracts.length} com filtro(s)
              </p>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Base de Custo</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Utilizado</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {isLoading ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full" />
                          <p className="text-sm text-gray-600">Carregando contratos...</p>
                        </div>
                      ) : contracts.length === 0 ? (
                        <div className="flex flex-col gap-2">
                          <p className="font-medium text-gray-700">Nenhum contrato encontrado.</p>
      
                        </div>
                      ) : (
                        <p className="text-gray-600"></p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts.map((contract) => {
                    const daysRemaining = calculateDaysRemaining(contract.expirationDate)
                    const daysExpired = calculateDaysExpired(contract.expirationDate)
                    const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 60
                    const isExpired = daysRemaining <= 0

                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium">{contract.number}</TableCell>
                        <TableCell>{contract.company}</TableCell>
                        <TableCell>{contract.costBase}</TableCell>
                        <TableCell>{formatCurrency(contract.value)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-full max-w-[100px] h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  contract.usedPercentage >= 90
                                    ? "bg-red-500"
                                    : contract.usedPercentage >= 60
                                      ? "bg-amber-500"
                                      : "bg-green-500"
                                }`}
                                style={{ width: `${contract.usedPercentage}%` }}
                              />
                            </div>
                            <span className="text-xs">{contract.usedPercentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={isExpiringSoon && !isExpired ? "text-amber-600 font-medium" : isExpired ? "text-red-600 font-medium" : ""}>
                            {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                            {isExpiringSoon && !isExpired && ` (${daysRemaining} dias)`}
                            {isExpired && ` (Vencido há ${daysExpired} dia${daysExpired !== 1 ? "s" : ""})`}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              contract.status === "ativo"
                                ? "bg-green-100 text-green-800"
                                : contract.status === "vencido"
                                  ? "bg-orange-100 text-orange-800"
                                  : contract.status === "expirado"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {(contract.status?.charAt(0).toUpperCase() + contract.status?.slice(1)) || "Indefinido"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Abrir menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => router.push(`/dashboard/contratos/${contract.id}`)}>
                                <FileText className="mr-2 h-4 w-4" />
                                Visualizar detalhes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isCompras && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/dashboard/contratos/editar/${contract.id}`)}
                                  >
                                    Editar contrato
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/dashboard/pedidos/novo?contrato=${contract.id}`)}
                                    disabled={contract.status !== "ativo"}
                                  >
                                    Fazer pedido
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ContractImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  )
}
