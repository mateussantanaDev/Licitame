"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useReports, type ReportFormat, type ReportFilter } from "@/lib/reports-provider"
import { useContracts } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useProducts } from "@/lib/products-provider"
import { useCostBase } from "@/lib/cost-base-provider"
import {
  FileText,
  Download,
  FileSpreadsheet,
  FileCheck,
  Package,
  Building2,
  ShoppingCart,
  Database,
} from "lucide-react"

export default function RelatoriosPage() {
  const { generateReport, generateBackup } = useReports()
  const { contracts } = useContracts()
  const { orders } = useOrders()
  const { suppliers } = useSuppliers()
  const { products } = useProducts()
  const { costBases } = useCostBase()

  const [format, setFormat] = useState<ReportFormat>("pdf")
  const [filters, setFilters] = useState<ReportFilter>({})

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
              <CardDescription>Gere relatórios detalhados de contratos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
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
              <CardDescription>Gere relatórios detalhados de pedidos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="orderStatus">Status</Label>
                  <Select
                    value={filters.status || "all"}
                    onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger id="orderStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em sepação">Em Sepação</SelectItem>
                      <SelectItem value="concluído">Concluído</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <CardDescription>Gere relatórios detalhados de fornecedores</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplierStatus">Status</Label>
                  <Select
                    value={filters.status || "all"}
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
              </div>
              <Button onClick={() => handleGenerateReport("suppliers")} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Gerar Relatório de Fornecedores
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
