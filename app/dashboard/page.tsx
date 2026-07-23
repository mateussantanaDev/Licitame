"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useContracts } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useAuth } from "@/lib/auth-provider"
import { FileText, AlertTriangle, Clock, DollarSign, AlertCircle } from "lucide-react"
import { formatCurrency, calculateDaysRemaining, calculateDaysExpired } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardPage() {
  const { user } = useAuth()
  const { contracts } = useContracts()
  const { orders } = useOrders()
  const router = useRouter()
  const [stats, setStats] = useState({
    totalContracts: 0,
    activeContracts: 0,
    expiringContracts: 0,
    expiredContracts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalValue: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Pequeno delay para simular carregamento dos dados
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Calcular estatísticas
    const now = new Date()
    const in60Days = new Date()
    in60Days.setDate(now.getDate() + 60)

    const activeContracts = contracts.filter((c) => new Date(c.expirationDate) > now)
    const expiringContracts = contracts.filter(
      (c) => new Date(c.expirationDate) > now && new Date(c.expirationDate) < in60Days,
    )
    const expiredContracts = contracts.filter((c) => new Date(c.expirationDate) <= now)

    const pendingOrders = orders.filter((o) => o.status === "pendente")

    const totalValue = contracts.reduce((sum, contract) => sum + contract.value, 0)

    setStats({
      totalContracts: contracts.length,
      activeContracts: activeContracts.length,
      expiringContracts: expiringContracts.length,
      expiredContracts: expiredContracts.length,
      totalOrders: orders.length,
      pendingOrders: pendingOrders.length,
      totalValue,
    })
  }, [contracts, orders])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/dashboard/contratos")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos Ativos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeContracts}</div>
            <p className="text-xs text-muted-foreground">De um total de {stats.totalContracts} contratos</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/dashboard/contratos/expirando")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos a Expirar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiringContracts}</div>
            <p className="text-xs text-muted-foreground">Contratos que expiram nos próximos 60 dias</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/dashboard/contratos")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos Vencidos</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiredContracts}</div>
            <p className="text-xs text-muted-foreground">Contratos com data de vencimento ultrapassada</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/dashboard/pedidos/pendentes")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingOrders}</div>
            <p className="text-xs text-muted-foreground">De um total de {stats.totalOrders} pedidos</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => router.push("/dashboard/contratos")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total de Contratos</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
            <p className="text-xs text-muted-foreground">Soma de todos os contratos ativos</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="contracts">
        <TabsList>
          <TabsTrigger value="contracts">Contratos Recentes</TabsTrigger>
          <TabsTrigger value="orders">Pedidos Recentes</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Contratos Recentes</CardTitle>
                <CardDescription>Lista dos últimos contratos cadastrados no sistema</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/contratos")}>
                Ver todos
              </Button>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-1">Nenhum contrato cadastrado</h3>
                  <p className="text-sm text-muted-foreground mb-4">Comece criando seu primeiro contrato no sistema</p>
                  <Button onClick={() => router.push("/dashboard/contratos/novo")}>Criar Contrato</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {contracts.slice(0, 5).map((contract) => {
                    const daysRemaining = calculateDaysRemaining(contract.expirationDate)
                    const daysExpired = calculateDaysExpired(contract.expirationDate)
                    const isExpired = daysRemaining <= 0

                    return (
                      <div
                        key={contract.id}
                        className="flex items-center border-b pb-4 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                        onClick={() => router.push(`/dashboard/contratos/${contract.id}`)}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {contract.number} - {contract.company}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Base: {contract.costBase} | Valor: {formatCurrency(contract.value)}
                          </p>
                        </div>
                        <div className="ml-auto font-medium flex flex-col items-end gap-1">
                          <span className={isExpired ? "text-red-600" : ""}>
                            {new Date(contract.expirationDate).toLocaleDateString("pt-BR")}
                            {isExpired && ` (Vencido há ${daysExpired} dia${daysExpired !== 1 ? "s" : ""})`}
                          </span>
                          <Badge
                            variant={
                              contract.usedPercentage >= 90
                                ? "destructive"
                                : contract.usedPercentage >= 60
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {contract.usedPercentage}% utilizado
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pedidos Recentes</CardTitle>
                <CardDescription>Lista dos últimos pedidos realizados no sistema</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/pedidos")}>
                Ver todos
              </Button>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-1">Nenhum pedido realizado</h3>
                  <p className="text-sm text-muted-foreground mb-4">Comece criando seu primeiro pedido no sistema</p>
                  <Button onClick={() => router.push("/dashboard/pedidos/novo")}>Criar Pedido</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {orders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center border-b pb-4 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                      onClick={() => router.push(`/dashboard/pedidos/${order.id}`)}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          Pedido #{order.number} - Contrato: {order.contractNumber}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Solicitante: {order.requestedBy} | Valor: {formatCurrency(order.totalValue)}
                        </p>
                      </div>
                      <div className="ml-auto font-medium">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            order.status === "concluído"
                              ? "bg-green-100 text-green-800"
                              : order.status === "rascunho"
                                ? "bg-gray-100 text-gray-800 border border-gray-200"
                                : order.status === "pendente"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
