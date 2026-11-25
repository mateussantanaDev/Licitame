"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useReports } from "@/lib/reports-provider"
import { useToast } from "@/components/ui/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { NavigationProgress } from "@/components/navigation-progress"
import { LoadingSpinner } from "@/components/loading-spinner"

import {
  ArrowLeft,
  Building,
  Mail,
  Phone,
  MapPin,
  Globe,
  User,
  CreditCard,
  Star,
  FileText,
  Edit,
  Trash2,
  AlertTriangle,
} from "lucide-react"
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

export default function FornecedorDetalhesPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const { suppliers, getSupplierById, updateSupplier, deleteSupplier } = useSuppliers()
  const { generateReport } = useReports()

  const [supplier, setSupplier] = useState<ReturnType<typeof getSupplierById>>(undefined)
  const [loading, setLoading] = useState(true)
  const [isNavigating, setIsNavigating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)

  useEffect(() => {
    if (params.id) {
      const foundSupplier = getSupplierById(params.id as string)
      setSupplier(foundSupplier)
      setLoading(false)

      if (!foundSupplier) {
        toast({
          title: "Fornecedor não encontrado",
          description: "O fornecedor solicitado não existe ou foi removido.",
          variant: "destructive",
        })
        router.push("/dashboard/fornecedores")
      }
    }
  }, [params.id, getSupplierById, router, toast])

  const handleBack = () => {
    setIsNavigating(true)
    router.push("/dashboard/fornecedores")
  }

  const handleEdit = () => {
    setIsNavigating(true)
    router.push(`/dashboard/fornecedores/editar/${supplier?.id}`)
  }

  const handleToggleStatus = () => {
    setShowStatusDialog(true)
  }

  const confirmStatusChange = () => {
    if (supplier) {
      const newStatus = !supplier.active
      updateSupplier(supplier.id, { active: newStatus })
      setSupplier({ ...supplier, active: newStatus })

      toast({
        title: newStatus ? "Fornecedor ativado" : "Fornecedor desativado",
        description: `O status do fornecedor foi alterado com sucesso.`,
      })

      setShowStatusDialog(false)
    }
  }

  const handleDelete = () => {
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (supplier) {
      deleteSupplier(supplier.id)
      toast({
        title: "Fornecedor excluído",
        description: "O fornecedor foi excluído com sucesso.",
      })
      setIsNavigating(true)
      router.push("/dashboard/fornecedores")
    }
  }

  // Renderizar estrelas com base na avaliação
  const renderRatingStars = (rating: number) => {
    return (
      <div className="flex items-center">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-5 w-5 ${i < Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground"}`}
          />
        ))}
        <span className="ml-2 text-sm font-medium">{rating.toFixed(1)}</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Carregando detalhes do fornecedor...</span>
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold">Fornecedor não encontrado</h2>
        <p className="mt-2 text-muted-foreground">O fornecedor solicitado não existe ou foi removido.</p>
        <Button className="mt-6" onClick={handleBack}>
          Voltar para a lista de fornecedores
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {isNavigating && <NavigationProgress />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
          <Badge variant={supplier.active ? "default" : "destructive"} className="ml-2">
            {supplier.active ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateReport("suppliers", "pdf", { supplier: supplier.name })}
          >
            <FileText className="mr-2 h-4 w-4" />
            Relatório Individual
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {supplier.active ? "Desativar" : "Ativar"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Informações Básicas</CardTitle>
                <CardDescription>Dados cadastrais do fornecedor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-[24px_1fr] items-start gap-x-4 gap-y-3">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Razão Social</p>
                    <p>{supplier.name}</p>
                  </div>

                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">CNPJ</p>
                    <p>{supplier.cnpj}</p>
                  </div>

                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <p>{supplier.website || "Não informado"}</p>
                  </div>

                  <Star className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Avaliação</p>
                    {renderRatingStars(supplier.rating)}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="mb-2 text-sm font-medium">Categoria</h3>
                  <Badge variant="outline">{supplier.category}</Badge>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">Data de Cadastro</h3>
                  <p>{new Date(supplier.createdAt).toLocaleDateString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contato</CardTitle>
                <CardDescription>Informações de contato do fornecedor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-[24px_1fr] items-start gap-x-4 gap-y-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p>{supplier.email || "Não informado"}</p>
                  </div>

                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Telefone</p>
                    <p>{supplier.contactPhone || "Não informado"}</p>
                  </div>

                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Endereço</p>
                    <p>
                      {supplier.address}
                      {supplier.city && supplier.state ? `, ${supplier.city} - ${supplier.state}` : ""}
                      {supplier.zipCode ? `, ${supplier.zipCode}` : ""}
                    </p>
                  </div>
                </div>

                <Separator />

                <h3 className="text-sm font-medium">Contato Principal</h3>
                <div className="grid grid-cols-[24px_1fr] items-start gap-x-4 gap-y-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Nome</p>
                    <p>{supplier.contactName || "Não informado"}</p>
                  </div>

                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Telefone</p>
                    <p>{supplier.contactPhone || "Não informado"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Informações Financeiras</CardTitle>
                <CardDescription>Dados financeiros e bancários</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Dados Bancários</h3>
                    <div className="grid grid-cols-[24px_1fr] items-start gap-x-4 gap-y-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Dados bancários não disponíveis para este fornecedor.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-medium">Estatísticas Financeiras</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Total de Contratos</span>
                        <span className="font-medium">0</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Valor Total Contratado</span>
                        <span className="font-medium">R$ 0,00</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Pedidos Realizados</span>
                        <span className="font-medium">0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle>Contratos</CardTitle>
              <CardDescription>Contratos associados a este fornecedor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Nenhum contrato encontrado para este fornecedor.</p>
                  <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/contratos/novo")}>
                    Criar Novo Contrato
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos</CardTitle>
              <CardDescription>Pedidos realizados para este fornecedor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Nenhum pedido encontrado para este fornecedor.</p>
                  <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/pedidos/novo")}>
                    Criar Novo Pedido
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
              <CardDescription>Documentos associados a este fornecedor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Nenhum documento encontrado para este fornecedor.</p>
                  <Button variant="outline" className="mt-4">
                    Adicionar Documento
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>Histórico de alterações e atividades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Fornecedor cadastrado</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(supplier.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {supplier.createdAt !== supplier.updatedAt && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <Edit className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Fornecedor atualizado</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(supplier.updatedAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de confirmação para excluir fornecedor */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o fornecedor e todos os dados associados.
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

      {/* Diálogo de confirmação para alterar status */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{supplier.active ? "Desativar fornecedor?" : "Ativar fornecedor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {supplier.active
                ? "Isso irá desativar o fornecedor no sistema. Você poderá reativá-lo posteriormente."
                : "Isso irá reativar o fornecedor no sistema."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>
              {supplier.active ? "Desativar" : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
