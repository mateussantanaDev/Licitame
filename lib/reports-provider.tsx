"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useContracts } from "@/lib/contracts-provider"
import { useOrders } from "@/lib/orders-provider"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useProducts } from "@/lib/products-provider"
import { useCostBase } from "@/lib/cost-base-provider"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export type ReportType = "contracts" | "orders" | "suppliers" | "products" | "costbase" | "backup"
export type ReportFormat = "pdf" | "excel" | "csv"

export type ReportFilter = {
  startDate?: string
  endDate?: string
  status?: string
  category?: string
  type?: string
}

type ReportsContextType = {
  generateReport: (type: ReportType, format: ReportFormat, filters?: ReportFilter) => void
  generateBackup: () => void
  generateOrderExtrapolationReport: (order: Order, contract: Contract, format?: ReportFormat) => void
  generateContractExtrapolationReport: (contract: Contract, contractOrders: Order[], format?: ReportFormat) => void
}

const ReportsContext = createContext<ReportsContextType | undefined>(undefined)

export function ReportsProvider({ children }: { children: ReactNode }) {
  const { contracts } = useContracts()
  const { orders } = useOrders()
  const { suppliers } = useSuppliers()
  const { products } = useProducts()
  const { costBases } = useCostBase()

  const generateReport = (type: ReportType, format: ReportFormat, filters?: ReportFilter) => {
    switch (type) {
      case "contracts":
        generateContractsReport(format, filters)
        break
      case "orders":
        generateOrdersReport(format, filters)
        break
      case "suppliers":
        generateSuppliersReport(format, filters)
        break
      case "products":
        generateProductsReport(format, filters)
        break
      case "costbase":
        generateCostBaseReport(format, filters)
        break
      case "backup":
        generateBackup()
        break
    }
  }

  const generateContractsReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredContracts = [...contracts]

    if (filters?.startDate) {
      filteredContracts = filteredContracts.filter((c) => new Date(c.startDate) >= new Date(filters.startDate!))
    }
    if (filters?.endDate) {
      filteredContracts = filteredContracts.filter((c) => new Date(c.expirationDate) <= new Date(filters.endDate!))
    }
    if (filters?.status) {
      filteredContracts = filteredContracts.filter((c) => c.status === filters.status)
    }

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(18)
      doc.text("Relatório de Contratos", 14, 22)

      doc.setFontSize(11)
      doc.text(`Data de geração: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32)
      doc.text(`Total de contratos: ${filteredContracts.length}`, 14, 38)

      const tableData = filteredContracts.map((contract) => [
        contract.number,
        contract.company,
        new Date(contract.startDate).toLocaleDateString("pt-BR"),
        new Date(contract.expirationDate).toLocaleDateString("pt-BR"),
        `R$ ${contract.totalValue ? contract.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : contract.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        contract.status,
      ])

      autoTable(doc, {
        head: [["Número", "Empresa", "Início", "Vencimento", "Valor Total", "Status"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      })

      doc.save(`relatorio-contratos-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvContent = [
        ["Número", "Empresa", "Início", "Vencimento", "Valor Total", "Usado", "Status"].join(";"),
        ...filteredContracts.map((contract) =>
          [
            contract.number,
            contract.company,
            new Date(contract.startDate).toLocaleDateString("pt-BR"),
            new Date(contract.expirationDate).toLocaleDateString("pt-BR"),
            contract.totalValue ? contract.totalValue.toFixed(2) : contract.value.toFixed(2),
            contract.usedValue.toFixed(2),
            contract.status,
          ].join(";"),
        ),
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-contratos-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateOrdersReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredOrders = [...orders]

    if (filters?.startDate) {
      filteredOrders = filteredOrders.filter((o) => new Date(o.date) >= new Date(filters.startDate!))
    }
    if (filters?.endDate) {
      filteredOrders = filteredOrders.filter((o) => new Date(o.date) <= new Date(filters.endDate!))
    }
    if (filters?.status) {
      filteredOrders = filteredOrders.filter((o) => o.status === filters.status)
    }

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(18)
      doc.text("Relatório de Pedidos", 14, 22)

      doc.setFontSize(11)
      doc.text(`Data de geração: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32)
      doc.text(`Total de pedidos: ${filteredOrders.length}`, 14, 38)

      const tableData = filteredOrders.map((order) => [
        order.number,
        order.contractNumber,
        new Date(order.date).toLocaleDateString("pt-BR"),
        `R$ ${order.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        order.status,
      ])

      autoTable(doc, {
        head: [["Número", "Contrato", "Data", "Valor Total", "Status"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      })

      doc.save(`relatorio-pedidos-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvContent = [
        ["Número", "Contrato", "Data", "Valor Total", "Status", "Solicitante"].join(";"),
        ...filteredOrders.map((order) =>
          [
            order.number,
            order.contractNumber,
            new Date(order.date).toLocaleDateString("pt-BR"),
            order.totalValue.toFixed(2),
            order.status,
            order.requestedBy,
          ].join(";"),
        ),
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-pedidos-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateSuppliersReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredSuppliers = [...suppliers]

    if (filters?.status) {
      const isActive = filters.status === "ativo"
      filteredSuppliers = filteredSuppliers.filter((s) => s.active === isActive)
    }

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(18)
      doc.text("Relatório de Fornecedores", 14, 22)

      doc.setFontSize(11)
      doc.text(`Data de geração: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32)
      doc.text(`Total de fornecedores: ${filteredSuppliers.length}`, 14, 38)

      const tableData = filteredSuppliers.map((supplier) => [
        supplier.name,
        supplier.cnpj,
        supplier.email,
        supplier.phone,
        supplier.active ? "Ativo" : "Inativo",
      ])

      autoTable(doc, {
        head: [["Nome", "CNPJ", "Email", "Telefone", "Status"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      })

      doc.save(`relatorio-fornecedores-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvContent = [
        ["Nome", "CNPJ", "Email", "Telefone", "Cidade", "Estado", "Status"].join(";"),
        ...filteredSuppliers.map((supplier) =>
          [
            supplier.name,
            supplier.cnpj,
            supplier.email,
            supplier.phone,
            supplier.city,
            supplier.state,
            supplier.active ? "Ativo" : "Inativo",
          ].join(";"),
        ),
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-fornecedores-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateProductsReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredProducts = [...products]

    if (filters?.status) {
      const isActive = filters.status === "ativo"
      filteredProducts = filteredProducts.filter((p) => p.active === isActive)
    }
    if (filters?.category) {
      filteredProducts = filteredProducts.filter((p) => p.category === filters.category)
    }

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(18)
      doc.text("Relatório de Produtos", 14, 22)

      doc.setFontSize(11)
      doc.text(`Data de geração: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32)
      doc.text(`Total de produtos: ${filteredProducts.length}`, 14, 38)

      const tableData = filteredProducts.map((product) => [
        product.name,
        product.code,
        product.category,
        `${product.currentStock} ${product.unit}`,
        `${product.minStock} ${product.unit}`,
        product.active ? "Ativo" : "Inativo",
      ])

      autoTable(doc, {
        head: [["Nome", "Código", "Categoria", "Estoque Atual", "Estoque Mínimo", "Status"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      })

      doc.save(`relatorio-produtos-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvContent = [
        ["Nome", "Código", "Categoria", "Estoque Atual", "Estoque Mínimo", "Unidade", "Status"].join(";"),
        ...filteredProducts.map((product) =>
          [
            product.name,
            product.code,
            product.category,
            product.currentStock,
            product.minStock,
            product.unit,
            product.active ? "Ativo" : "Inativo",
          ].join(";"),
        ),
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-produtos-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateCostBaseReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredCostBases = [...costBases]

    if (filters?.startDate) {
      filteredCostBases = filteredCostBases.filter((cb) => new Date(cb.validFrom) >= new Date(filters.startDate!))
    }
    if (filters?.endDate) {
      filteredCostBases = filteredCostBases.filter((cb) => {
        if (!cb.validUntil) return true
        return new Date(cb.validUntil) <= new Date(filters.endDate!)
      })
    }

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(18)
      doc.text("Relatório de Bases de Custo", 14, 22)

      doc.setFontSize(11)
      doc.text(`Data de geração: ${new Date().toLocaleDateString("pt-BR")}`, 14, 32)
      doc.text(`Total de bases de custo: ${filteredCostBases.length}`, 14, 38)

      const tableData = filteredCostBases.map((costBase) => [
        costBase.name,
        costBase.supplierName,
        costBase.productName,
        `R$ ${costBase.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        new Date(costBase.validFrom).toLocaleDateString("pt-BR"),
        costBase.validUntil ? new Date(costBase.validUntil).toLocaleDateString("pt-BR") : "Indefinido",
      ])

      autoTable(doc, {
        head: [["Nome", "Fornecedor", "Produto", "Preço", "Válido De", "Válido Até"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      })

      doc.save(`relatorio-bases-custo-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvContent = [
        ["Nome", "Fornecedor", "Produto", "Preço Unitário", "Válido De", "Válido Até"].join(";"),
        ...filteredCostBases.map((costBase) =>
          [
            costBase.name,
            costBase.supplierName,
            costBase.productName,
            costBase.unitPrice.toFixed(2),
            new Date(costBase.validFrom).toLocaleDateString("pt-BR"),
            costBase.validUntil ? new Date(costBase.validUntil).toLocaleDateString("pt-BR") : "Indefinido",
          ].join(";"),
        ),
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-bases-custo-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateOrderExtrapolationReport = (order: Order, contract: Contract, format: ReportFormat = "pdf") => {
    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(16)
      doc.setTextColor(180, 0, 0)
      doc.text("RELATÓRIO DE EXTRAPOLAÇÃO DE LIMITES - PEDIDO", 14, 20)

      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 28)
      doc.text(`Pedido Nº: ${order.number} | Contrato Nº: ${contract.number}`, 14, 34)
      doc.text(`Solicitante: ${order.requestedBy || "Não informado"} (${order.requestedByDepartment || "Geral"})`, 14, 40)
      doc.text(`Empresa Contratada: ${contract.company}`, 14, 46)

      const tableData: any[] = []
      let totalExceededQty = 0
      let totalExceededValue = 0

      order.items.forEach((item) => {
        const cItem = contract.items.find((ci) => ci.id === item.contractItemId)
        const totalContractQty = cItem ? cItem.quantity : 0
        const currentUsedQty = cItem ? cItem.usedQuantity : 0
        const availableBefore = Math.max(0, totalContractQty - (currentUsedQty - item.quantity))
        const exceededQty = Math.max(0, item.quantity - availableBefore)
        const exceededVal = exceededQty * item.unitPrice

        totalExceededQty += exceededQty
        totalExceededValue += exceededVal

        tableData.push([
          item.name,
          totalContractQty,
          availableBefore,
          item.quantity,
          exceededQty > 0 ? `+${exceededQty}` : "0",
          `R$ ${item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `R$ ${exceededVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        ])
      })

      autoTable(doc, {
        head: [["Item / Produto", "Qtd Contrato", "Qtd Disp. Antes", "Qtd Pedida", "Qtd Excedida", "Preço Unit.", "Valor Excedido"]],
        body: tableData,
        startY: 54,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [180, 0, 0] },
        columnStyles: {
          4: { fontStyle: "bold", textColor: [180, 0, 0] },
          6: { fontStyle: "bold", textColor: [180, 0, 0] }
        }
      })

      const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 120

      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text("Resumo Financeiro da Extrapolação no Pedido:", 14, finalY)
      doc.setFontSize(10)
      doc.text(`- Total de Itens em Excesso: ${totalExceededQty} unidade(s)`, 14, finalY + 6)
      doc.text(`- Valor Total Extrapolado neste Pedido: R$ ${totalExceededValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, finalY + 12)
      doc.text(`- Valor Total do Pedido: R$ ${order.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, finalY + 18)
      
      const currentContractBalance = contract.value - contract.usedValue
      doc.text(`- Saldo Atual do Contrato pós-pedido: R$ ${currentContractBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${currentContractBalance < 0 ? "(SALDO NEGATIVO)" : ""}`, 14, finalY + 24)

      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text("Documento oficial gerado para fins de fiscalização, auditoria e instrução contratual.", 14, finalY + 36)

      doc.save(`relatorio-extrapolacao-pedido-${order.number}.pdf`)
    } else {
      const csvContent = [
        ["Item / Produto", "Qtd Contrato", "Qtd Disp. Antes", "Qtd Pedida", "Qtd Excedida", "Preço Unitario", "Valor Excedido"].join(";"),
        ...order.items.map((item) => {
          const cItem = contract.items.find((ci) => ci.id === item.contractItemId)
          const totalContractQty = cItem ? cItem.quantity : 0
          const currentUsedQty = cItem ? cItem.usedQuantity : 0
          const availableBefore = Math.max(0, totalContractQty - (currentUsedQty - item.quantity))
          const exceededQty = Math.max(0, item.quantity - availableBefore)
          const exceededVal = exceededQty * item.unitPrice
          return [
            item.name,
            totalContractQty,
            availableBefore,
            item.quantity,
            exceededQty,
            item.unitPrice.toFixed(2),
            exceededVal.toFixed(2)
          ].join(";")
        })
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-extrapolacao-pedido-${order.number}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateContractExtrapolationReport = (contract: Contract, contractOrders: Order[], format: ReportFormat = "pdf") => {
    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(16)
      doc.setTextColor(180, 0, 0)
      doc.text("RELATÓRIO DE EXTRAPOLAÇÃO E EXCESSO CONTRATUAL", 14, 20)

      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 28)
      doc.text(`Contrato Nº: ${contract.number} | Empresa: ${contract.company}`, 14, 34)
      doc.text(`Valor Total Contratado: R$ ${contract.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, 40)
      doc.text(`Valor Total Consumido: R$ ${contract.usedValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${contract.usedPercentage}%)`, 14, 46)

      const saldo = contract.value - contract.usedValue
      if (saldo < 0) {
        doc.setTextColor(180, 0, 0)
        doc.text(`Saldo do Contrato: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (SALDO NEGATIVO / EXTRAPOLADO)`, 14, 52)
      } else {
        doc.setTextColor(0, 100, 0)
        doc.text(`Saldo do Contrato: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (Dentro do Limite)`, 14, 52)
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      doc.text("1. Extrapolação por Item do Contrato", 14, 62)

      const itemTableData: any[] = []
      let globalExceededQty = 0
      let globalExceededValue = 0

      contract.items.forEach((item) => {
        const exceededQty = Math.max(0, item.usedQuantity - item.quantity)
        const exceededVal = exceededQty * item.unitPrice

        globalExceededQty += exceededQty
        globalExceededValue += exceededVal

        itemTableData.push([
          item.name,
          item.quantity,
          item.usedQuantity,
          item.quantity - item.usedQuantity,
          exceededQty > 0 ? `+${exceededQty}` : "0",
          `R$ ${item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `R$ ${(item.quantity * item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `R$ ${(item.usedQuantity * item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `R$ ${exceededVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        ])
      })

      autoTable(doc, {
        head: [["Item", "Qtd Contrato", "Qtd Consumida", "Saldo Qtd", "Qtd Excedida", "Preço Unit.", "Valor Total", "Valor Consumido", "Valor Excedido"]],
        body: itemTableData,
        startY: 66,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [180, 0, 0] },
        columnStyles: {
          4: { fontStyle: "bold", textColor: [180, 0, 0] },
          8: { fontStyle: "bold", textColor: [180, 0, 0] }
        }
      })

      let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 130

      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text("2. Histórico de Pedidos no Contrato", 14, currentY)

      const orderTableData: any[] = []
      contractOrders.forEach((o) => {
        orderTableData.push([
          o.number,
          new Date(o.date).toLocaleDateString("pt-BR"),
          o.requestedBy || "Não informado",
          o.requestedByDepartment || "Geral",
          `R$ ${o.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          o.status
        ])
      })

      autoTable(doc, {
        head: [["Pedido Nº", "Data", "Solicitante", "Departamento", "Valor Total (R$)", "Status"]],
        body: orderTableData,
        startY: currentY + 4,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [70, 70, 70] },
      })

      currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 40

      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text("Síntese Geral da Extrapolação Contratual:", 14, currentY)
      doc.text(`• Total de Unidades Extrapoladas: ${globalExceededQty} item(ns)`, 14, currentY + 6)
      doc.text(`• Valor Financeiro Total Extrapolado nos Itens: R$ ${globalExceededValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, currentY + 12)
      doc.text(`• Valor Excedido do Saldo Global do Contrato: R$ ${Math.max(0, contract.usedValue - contract.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, currentY + 18)

      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text("Relatório emitido para instrução de termo aditivo de reajuste ou controle financeiro do contrato.", 14, currentY + 30)

      doc.save(`relatorio-extrapolacao-contrato-${contract.number}.pdf`)
    } else {
      const csvContent = [
        ["Item", "Qtd Contrato", "Qtd Consumida", "Saldo Qtd", "Qtd Excedida", "Preço Unitario", "Valor Total Contrato", "Valor Total Consumido", "Valor Excedido"].join(";"),
        ...contract.items.map((item) => {
          const exceededQty = Math.max(0, item.usedQuantity - item.quantity)
          const exceededVal = exceededQty * item.unitPrice
          return [
            item.name,
            item.quantity,
            item.usedQuantity,
            item.quantity - item.usedQuantity,
            exceededQty,
            item.unitPrice.toFixed(2),
            (item.quantity * item.unitPrice).toFixed(2),
            (item.usedQuantity * item.unitPrice).toFixed(2),
            exceededVal.toFixed(2)
          ].join(";")
        })
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-extrapolacao-contrato-${contract.number}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateBackup = () => {
    const backupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      data: {
        contracts,
        orders,
        suppliers,
        products,
        costBases,
      },
    }

    const dataStr = JSON.stringify(backupData, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `backup-completo-${new Date().toISOString().split("T")[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ReportsContext.Provider
      value={{
        generateReport,
        generateBackup,
        generateOrderExtrapolationReport,
        generateContractExtrapolationReport,
      }}
    >
      {children}
    </ReportsContext.Provider>
  )
}

export function useReports() {
  const context = useContext(ReportsContext)
  if (context === undefined) {
    throw new Error("useReports deve ser usado dentro de um ReportsProvider")
  }
  return context
}

