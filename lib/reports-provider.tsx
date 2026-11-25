"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useContracts, type Contract } from "@/lib/contracts-provider"
import { useOrders, type Order } from "@/lib/orders-provider"
import { useSuppliers } from "@/lib/suppliers-provider"
import { useProducts } from "@/lib/products-provider"
import { useCostBase } from "@/lib/cost-base-provider"
import { matchCostBase, getCanonicalCostBases } from "./cost-base-utils"
import { formatCpfCnpj } from "@/lib/utils"
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
  costBase?: string
  supplier?: string
}

type ReportsContextType = {
  generateReport: (type: ReportType, format: ReportFormat, filters?: ReportFilter) => void
  generateBackup: () => void
  generateOrderExtrapolationReport: (order: Order, contract: Contract, format?: ReportFormat) => void
  generateContractExtrapolationReport: (contract: Contract, contractOrders: Order[], format?: ReportFormat) => void
  generateContractItemsReport: (contract: Contract, contractOrders: Order[], format?: ReportFormat) => void
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

  const getContractDescription = (contract: Contract): string => {
    if (contract.description && contract.description.trim()) {
      return contract.description.trim()
    }
    return "Objeto não informado"
  }

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  /**
   * Resolve razão social e CNPJ formatado com fallback no cadastro de fornecedores.
   */
  const resolveSupplierDetails = (
    companyName?: string,
    contractCnpj?: string,
    supplierId?: string
  ): { name: string; cnpj: string; formattedDisplay: string } => {
    const rawName = companyName?.trim() || "Fornecedor não identificado"
    let rawCnpj = contractCnpj?.trim() || ""

    if (!rawCnpj && supplierId) {
      const foundById = suppliers.find((s) => s.id === supplierId)
      if (foundById?.cnpj) rawCnpj = foundById.cnpj.trim()
    }

    if (!rawCnpj && companyName) {
      const cleanComp = companyName.toLowerCase().trim()
      const cleanCompNoSuffix = cleanComp.replace(/\b(ltda|eireli|s\/a|sa|me|epp)\b/gi, "").trim()
      const foundByName = suppliers.find((s) => {
        const sName = s.name?.toLowerCase().trim() || ""
        const sNameNoSuffix = sName.replace(/\b(ltda|eireli|s\/a|sa|me|epp)\b/gi, "").trim()
        return (
          sName === cleanComp ||
          (cleanCompNoSuffix && sNameNoSuffix === cleanCompNoSuffix) ||
          (sName && cleanComp.includes(sName)) ||
          (cleanComp && sName.includes(cleanComp))
        )
      })
      if (foundByName?.cnpj) rawCnpj = foundByName.cnpj.trim()
    }

    if (!rawCnpj && companyName) {
      const match = companyName.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)
      if (match) rawCnpj = match[0]
    }

    const formattedCnpj = formatCpfCnpj(rawCnpj)
    const cnpjLine = formattedCnpj ? `CNPJ: ${formattedCnpj}` : "CNPJ: Não informado"
    return {
      name: rawName,
      cnpj: formattedCnpj,
      formattedDisplay: `${rawName}\n${cnpjLine}`,
    }
  }

  const drawKpiCard = (
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    subtext: string,
    accentColor: [number, number, number]
  ) => {
    // Fundo do card
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, w, h, 2, 2, "FD")

    // Barra lateral de destaque
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2])
    doc.roundedRect(x, y, 2.5, h, 1, 1, "F")

    // Rótulo
    doc.setFontSize(6.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(100, 116, 139)
    doc.text(label.toUpperCase(), x + 5, y + 4.5)

    // Valor Principal
    doc.setFontSize(10.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(15, 23, 42)
    doc.text(value, x + 5, y + 10)

    // Subtexto de Apoio
    doc.setFontSize(6.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(148, 163, 184)
    doc.text(subtext, x + 5, y + 14.5)
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
      if (filters.status === "extrapolado") {
        filteredContracts = filteredContracts.filter(
          (c) => c.usedValue > c.value || c.items?.some((i) => i.usedQuantity > i.quantity)
        )
      } else {
        // Filtro estrito: traz apenas e exclusivamente contratos com o status solicitado (ex: apenas 'vencido')
        filteredContracts = filteredContracts.filter((c) => c.status === filters.status)
      }
    }
    if (filters?.costBase && filters.costBase !== "all") {
      filteredContracts = filteredContracts.filter((c) =>
        matchCostBase(c.costBase, filters.costBase)
      )
    }
    if (filters?.supplier && filters.supplier !== "all") {
      const target = filters.supplier.toLowerCase().trim()
      filteredContracts = filteredContracts.filter((c) => {
        const comp = (c.company || "").toLowerCase().trim()
        const suppId = (c.supplierId || "").toLowerCase().trim()
        return comp === target || suppId === target || comp.includes(target) || target.includes(comp)
      })
    }

    const isExtrapolatedFilter = filters?.status === "extrapolado"
    const isExpiredFilter = filters?.status === "vencido"
    const now = new Date()

    // Métricas Executivas para Gestão
    const totalCount = filteredContracts.length
    const vencidosCount = filteredContracts.filter((c) => c.status === "vencido").length

    const totalContractVal = filteredContracts.reduce((sum, c) => sum + (c.value || c.totalValue || 0), 0)
    const totalUsedVal = filteredContracts.reduce((sum, c) => sum + (c.usedValue || 0), 0)
    const totalRemainingVal = totalContractVal - totalUsedVal
    const avgExecutionPct = totalContractVal > 0 ? Math.round((totalUsedVal / totalContractVal) * 100) : 0

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

      // Barra superior decorativa executiva (Navy)
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, 297, 3.5, "F")

      // Identidade do Sistema
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(37, 99, 235)
      doc.text("LICITAME  •  SISTEMA INTEGRADO DE GESTÃO ESTRATÉGICA DE CONTRATOS", 14, 11)

      // Título do Relatório
      let docTitle = "RELATÓRIO GERENCIAL DE CONTRATOS ADMINISTRATIVOS"
      if (isExtrapolatedFilter) {
        docTitle = "RELATÓRIO EXECUTIVO DE CONTRATOS COM SALDO EXTRAPOLADO"
        doc.setTextColor(185, 28, 28)
      } else if (isExpiredFilter) {
        docTitle = "RELATÓRIO EXECUTIVO DE CONTRATOS VENCIDOS"
        doc.setTextColor(185, 28, 28)
      } else if (filters?.status && filters.status !== "all") {
        docTitle = `RELATÓRIO EXECUTIVO DE CONTRATOS (${filters.status.toUpperCase()})`
        doc.setTextColor(15, 23, 42)
      } else {
        doc.setTextColor(15, 23, 42)
      }

      doc.setFontSize(15)
      doc.setFont("helvetica", "bold")
      doc.text(docTitle, 14, 18)

      // Subtítulo Gerencial
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text("Painel analítico para tomada de decisões, monitoramento de prazos de vigência e saldo por secretaria.", 14, 24)

      // Box de Metadados de Emissão (Canto Superior Direito)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
      doc.roundedRect(217, 7, 66, 20, 2, 2, "FD")

      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(71, 85, 105)
      doc.text("PARÂMETROS DE EMISSÃO", 221, 11.5)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`Data/Hora: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, 221, 15.5)
      doc.text(`Filtro Status: ${isExpiredFilter ? "Vencidos" : isExtrapolatedFilter ? "Extrapolados" : filters?.status ? filters.status.toUpperCase() : "Todos"}`, 221, 19.5)
      let secFilterText = "Todas as Secretarias"
      if (filters?.costBase && filters.costBase !== "all") {
        const canonical = getCanonicalCostBases(contracts).find((b) => b.key === filters.costBase)
        secFilterText = canonical ? canonical.label : filters.costBase
      }
      const secFilterDisplay = secFilterText.length > 22 ? secFilterText.substring(0, 20) + "..." : secFilterText
      doc.text(`Secretaria: ${secFilterDisplay}`, 221, 23.5)

      // 4 Cards de KPIs Executivos
      drawKpiCard(
        doc,
        14,
        30,
        64,
        17,
        isExpiredFilter ? "Contratos Vencidos" : "Contratos Analisados",
        `${totalCount} contrato${totalCount !== 1 ? "s" : ""}`,
        isExpiredFilter ? "Exclusivamente contratos com status Vencido" : `${vencidosCount} com status vencido`,
        isExpiredFilter || vencidosCount > 0 ? [220, 38, 38] : [37, 99, 235]
      )

      drawKpiCard(
        doc,
        82,
        30,
        64,
        17,
        "Montante Total Contratado",
        `R$ ${totalContractVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "Soma global do valor homologado",
        [15, 23, 42]
      )

      drawKpiCard(
        doc,
        150,
        30,
        64,
        17,
        "Execução Financeira",
        `R$ ${totalUsedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `${avgExecutionPct}% de consumo médio apurado`,
        [124, 58, 237]
      )

      drawKpiCard(
        doc,
        218,
        30,
        65,
        17,
        totalRemainingVal < 0 ? "Saldo Total Extrapolado" : "Saldo Remanescente",
        totalRemainingVal < 0
          ? `-R$ ${Math.abs(totalRemainingVal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : `R$ ${totalRemainingVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        totalRemainingVal < 0 ? "Atenção: consumo acima do teto pactuado" : "Disponível para emissão de pedidos",
        totalRemainingVal < 0 ? [220, 38, 38] : [16, 185, 129]
      )

      // Mapeamento dos Dados da Tabela Executiva
      const tableRows = filteredContracts.map((contract) => {
        const contractVal = contract.value || contract.totalValue || 0
        const usedVal = contract.usedValue || 0
        const saldoVal = contractVal - usedVal
        const pct = contract.usedPercentage || (contractVal > 0 ? Math.round((usedVal / contractVal) * 100) : 0)

        // Coluna 0: Identificação do Contrato / Processo
        const num = contract.number || "Sem nº"
        const proc = contract.administrativeProcess ? `PA: ${contract.administrativeProcess}` : ""
        const preg = contract.electronicAuction ? `PE: ${contract.electronicAuction}` : ""
        const col0Lines = [num]
        if (proc) col0Lines.push(proc)
        else if (preg) col0Lines.push(preg)

        // Coluna 1: Empresa Fornecedora / CNPJ
        const suppDetails = resolveSupplierDetails(contract.company, contract.cnpj, contract.supplierId)
        const col1 = suppDetails.formattedDisplay

        // Coluna 2: Secretaria / Órgão Demandante
        const sec = contract.costBase || contract.contractingParty || "Geral / Não informada"

        // Coluna 3: Objeto do Contrato (Descrição cadastrada)
        const objeto = getContractDescription(contract)

        // Coluna 4: Prazos e Vigência com Cálculo Preciso
        const start = contract.startDate ? new Date(contract.startDate).toLocaleDateString("pt-BR") : "-"
        const end = contract.expirationDate ? new Date(contract.expirationDate).toLocaleDateString("pt-BR") : "-"
        const expDate = contract.expirationDate ? new Date(contract.expirationDate) : null
        let prazoNote = ""
        if (expDate && expDate <= now) {
          const days = Math.floor((now.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24))
          prazoNote = `\nVencido há ${days}d`
        } else if (expDate) {
          const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (days <= 60) prazoNote = `\nExpira em ${days}d`
        }
        const col4 = `Início: ${start}\nVenc: ${end}${prazoNote}`

        // Coluna 5: Execução Financeira (Pactuado, Executado, Saldo)
        const totalStr = `Pactuado: R$ ${contractVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        const usedStr = `Executado: R$ ${usedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pct}%)`
        const saldoStr = saldoVal < 0
          ? `Extrapolado: -R$ ${Math.abs(saldoVal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : `Saldo: R$ ${saldoVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        const col5 = `${totalStr}\n${usedStr}\n${saldoStr}`

        // Coluna 6: Situação e Ação de Gestão Recomendada
        const statusUpper = (contract.status || "Ativo").toUpperCase()
        const isExp = contract.status === "vencido"
        let rec = "Execução Normal"
        if (usedVal > contractVal) {
          rec = "Auditoria de Limite"
        } else if (isExp) {
          rec = usedVal >= contractVal * 0.9 ? "Encerrar Contrato" : "Avaliar Prorrogação"
        } else if (contract.status === "cancelado") {
          rec = "Contrato Cancelado"
        } else if (contract.status === "expirado") {
          rec = "Contrato Expirado"
        }
        const col6 = `[ ${statusUpper} ]\n${rec}`

        return [col0Lines.join("\n"), col1, sec, objeto, col4, col5, col6]
      })

      const bodyData = tableRows.length > 0
        ? tableRows
        : [["Nenhum contrato encontrado com os filtros selecionados.", "-", "-", "-", "-", "-", "-"]]

      autoTable(doc, {
        head: [
          [
            "Contrato / Processo",
            "Fornecedor Contratado",
            "Secretaria Demandante",
            "Objeto do Contrato",
            "Vigência & Prazos",
            "Execução Financeira",
            "Situação / Recomendação",
          ],
        ],
        body: bodyData,
        startY: 50,
        margin: { top: 18, bottom: 16, left: 14, right: 14 },
        styles: {
          font: "helvetica",
          fontSize: 7,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: isExtrapolatedFilter ? [153, 27, 27] : isExpiredFilter ? [185, 28, 28] : [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 28, fontStyle: "bold", textColor: [15, 23, 42] },
          1: { cellWidth: 46 },
          2: { cellWidth: 38 },
          3: { cellWidth: 60 },
          4: { cellWidth: 27, halign: "center" },
          5: { cellWidth: 40, halign: "right" },
          6: { cellWidth: 30, halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            if (data.column.index === 4) {
              const txt = String(data.cell.raw || "")
              if (txt.includes("Vencido")) {
                data.cell.styles.textColor = [185, 28, 28]
                data.cell.styles.fontStyle = "bold"
              }
            }
            if (data.column.index === 5) {
              const txt = String(data.cell.raw || "")
              if (txt.includes("Extrapolado")) {
                data.cell.styles.textColor = [185, 28, 28]
                data.cell.styles.fontStyle = "bold"
              }
            }
            if (data.column.index === 6) {
              const txt = String(data.cell.raw || "")
              if (txt.includes("VENCIDO")) {
                data.cell.styles.textColor = [185, 28, 28]
              } else if (txt.includes("ATIVO")) {
                data.cell.styles.textColor = [16, 185, 129]
              }
            }
          }
        },
      })

      // Cabeçalho de Páginas Subsequentes e Rodapé em Todas as Páginas
      const pageCount = (doc as any).internal.getNumberOfPages()
      const emitDateStr = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)

        // Cabeçalho a partir da página 2
        if (i > 1) {
          doc.setFontSize(7.5)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(37, 99, 235)
          doc.text("LICITAME", 14, 11)

          doc.setFont("helvetica", "normal")
          doc.setTextColor(100, 116, 139)
          doc.text(` • ${docTitle}`, 28, 11)
          doc.text(`Filtro: ${isExpiredFilter ? "Vencidos" : filters?.status || "Geral"} | Secretaria: ${secFilterText}`, 283, 11, { align: "right" })

          doc.setDrawColor(226, 232, 240)
          doc.line(14, 13, 283, 13)
        }

        // Rodapé Oficial em todas as páginas
        doc.setDrawColor(226, 232, 240)
        doc.line(14, 199, 283, 199)

        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(148, 163, 184)
        doc.text(`Sistema Licitame • Emitido em ${emitDateStr}`, 14, 203.5)
        doc.text("Documento Gerencial para Tomada de Decisão • Uso Reservado", 148, 203.5, { align: "center" })
        doc.text(`Página ${i} de ${pageCount}`, 283, 203.5, { align: "right" })
      }

      let filePrefix = "relatorio-contratos"
      if (isExtrapolatedFilter) filePrefix = "relatorio-contratos-extrapolados"
      else if (isExpiredFilter) filePrefix = "relatorio-contratos-vencidos"
      else if (filters?.status && filters.status !== "all") filePrefix = `relatorio-contratos-${filters.status}`

      doc.save(`${filePrefix}-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvHeader = [
        "Contrato",
        "Processo Administrativo",
        "Fornecedor",
        "CNPJ",
        "Secretaria Demandante",
        "Objeto do Contrato",
        "Data Início",
        "Data Vencimento",
        "Dias Vencidos / Restantes",
        "Valor Contratado (R$)",
        "Valor Executado (R$)",
        "Saldo (R$)",
        "% Executado",
        "Status",
        "Ação Recomendada",
      ]
        .map(escapeCsv)
        .join(";")

      const csvRows = filteredContracts.map((contract) => {
        const contractVal = contract.value || contract.totalValue || 0
        const usedVal = contract.usedValue || 0
        const saldoVal = contractVal - usedVal
        const pct = contract.usedPercentage || (contractVal > 0 ? Math.round((usedVal / contractVal) * 100) : 0)
        const costBase = contract.costBase || contract.contractingParty || "Não informada"
        const objeto = getContractDescription(contract)
        const expDate = contract.expirationDate ? new Date(contract.expirationDate) : null
        let diasLabel = "-"
        if (expDate && expDate <= now) {
          const days = Math.floor((now.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24))
          diasLabel = `Vencido há ${days} dias`
        } else if (expDate) {
          const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          diasLabel = `Restam ${days} dias`
        }

        const isExp = contract.status === "vencido"
        let rec = "Execução Normal"
        if (usedVal > contractVal) {
          rec = "Auditoria de Limite"
        } else if (isExp) {
          rec = usedVal >= contractVal * 0.9 ? "Encerrar Contrato" : "Avaliar Prorrogação"
        } else if (contract.status === "cancelado") {
          rec = "Contrato Cancelado"
        } else if (contract.status === "expirado") {
          rec = "Contrato Expirado"
        }

        const suppCsv = resolveSupplierDetails(contract.company, contract.cnpj, contract.supplierId)

        return [
          contract.number,
          contract.administrativeProcess || contract.electronicAuction || "-",
          suppCsv.name,
          suppCsv.cnpj || "Não informado",
          costBase,
          objeto,
          contract.startDate ? new Date(contract.startDate).toLocaleDateString("pt-BR") : "-",
          contract.expirationDate ? new Date(contract.expirationDate).toLocaleDateString("pt-BR") : "-",
          diasLabel,
          contractVal.toFixed(2),
          usedVal.toFixed(2),
          saldoVal.toFixed(2),
          `${pct}%`,
          contract.status,
          rec,
        ]
          .map(escapeCsv)
          .join(";")
      })

      const csvContent = [csvHeader, ...csvRows].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url

      let filePrefix = "relatorio-contratos"
      if (isExtrapolatedFilter) filePrefix = "relatorio-contratos-extrapolados"
      else if (isExpiredFilter) filePrefix = "relatorio-contratos-vencidos"
      else if (filters?.status && filters.status !== "all") filePrefix = `relatorio-contratos-${filters.status}`

      link.download = `${filePrefix}-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateOrdersReport = (format: ReportFormat, filters?: ReportFilter) => {
    let filteredOrders = [...orders]

    // 1. Filtro por Data
    if (filters?.startDate) {
      filteredOrders = filteredOrders.filter((o) => new Date(o.date) >= new Date(filters.startDate!))
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate!)
      end.setHours(23, 59, 59, 999)
      filteredOrders = filteredOrders.filter((o) => new Date(o.date) <= end)
    }

    // 2. Filtro por Status
    if (filters?.status && filters.status !== "all") {
      filteredOrders = filteredOrders.filter(
        (o) => o.status?.toLowerCase().trim() === filters.status!.toLowerCase().trim()
      )
    }

    // 3. Filtro por Fornecedor (da empresa contratada vinculada ao pedido)
    if (filters?.supplier && filters.supplier !== "all") {
      const target = filters.supplier.toLowerCase().trim()
      const targetClean = target.replace(/\D/g, "")

      filteredOrders = filteredOrders.filter((order) => {
        const contract = contracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)
        if (!contract) return false

        const comp = (contract.company || "").toLowerCase().trim()
        const suppId = (contract.supplierId || "").toLowerCase().trim()
        const cnpj = (contract.cnpj || "").replace(/\D/g, "")

        return (
          comp === target ||
          suppId === target ||
          comp.includes(target) ||
          target.includes(comp) ||
          (targetClean.length >= 8 && cnpj.includes(targetClean))
        )
      })
    }

    // 4. Filtro por Secretaria / Base de Custo
    if (filters?.costBase && filters.costBase !== "all") {
      filteredOrders = filteredOrders.filter((order) => {
        const contract = contracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)
        return matchCostBase(contract?.costBase || order.requestedByDepartment, filters.costBase!)
      })
    }

    const now = new Date()

    // Métricas Executivas para Gestão
    const totalCount = filteredOrders.length
    const totalValue = filteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0)

    const concluidosList = filteredOrders.filter(
      (o) => o.status === "concluído" || o.status === "entregue" || o.status === "realizado"
    )
    const concluidosCount = concluidosList.length
    const concluidosVal = concluidosList.reduce((sum, o) => sum + (o.totalValue || 0), 0)
    const pctConcluidos = totalCount > 0 ? Math.round((concluidosCount / totalCount) * 100) : 0

    const pendentesList = filteredOrders.filter(
      (o) => o.status === "pendente" || o.status === "em separação" || o.status === "rascunho"
    )
    const pendentesCount = pendentesList.length
    const pendentesVal = pendentesList.reduce((sum, o) => sum + (o.totalValue || 0), 0)
    const pctPendentes = totalCount > 0 ? Math.round((pendentesCount / totalCount) * 100) : 0

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

      // Barra superior decorativa executiva (Navy)
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, 297, 3.5, "F")

      // Identidade do Sistema
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(37, 99, 235)
      doc.text("LICITAME  •  SISTEMA INTEGRADO DE GESTÃO ESTRATÉGICA DE PEDIDOS", 14, 11)

      // Título do Relatório
      let docTitle = "RELATÓRIO EXECUTIVO DE PEDIDOS DE FORNECIMENTO"
      const filteredSuppContract =
        filters?.supplier && filters.supplier !== "all"
          ? contracts.find((c) => c.company?.toLowerCase().trim() === filters.supplier!.toLowerCase().trim())
          : undefined
      const filteredSuppDetails =
        filters?.supplier && filters.supplier !== "all"
          ? resolveSupplierDetails(filters.supplier, filteredSuppContract?.cnpj, filteredSuppContract?.supplierId)
          : undefined

      if (filteredSuppDetails) {
        docTitle = `RELATÓRIO DE PEDIDOS — FORNECEDOR: ${filteredSuppDetails.name.toUpperCase()}`
      } else if (filters?.status && filters.status !== "all") {
        docTitle = `RELATÓRIO EXECUTIVO DE PEDIDOS (${filters.status.toUpperCase()})`
      }

      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(15, 23, 42)
      const docTitleDisplay = docTitle.length > 55 ? docTitle.substring(0, 52) + "..." : docTitle
      doc.text(docTitleDisplay, 14, 18)

      // Subtítulo Gerencial (com CNPJ abaixo do nome do fornecedor quando filtrado)
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      if (filteredSuppDetails) {
        doc.setFont("helvetica", "bold")
        doc.text(
          `CNPJ: ${filteredSuppDetails.cnpj || "Não informado"}`,
          14,
          23
        )
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.5)
        doc.text(
          "Painel analítico para conferência de itens solicitados, contratos vinculados e status de entrega.",
          14,
          27.5
        )
      } else {
        doc.text(
          "Painel analítico para conferência de itens solicitados, fornecedores, contratos vinculados e status de entrega.",
          14,
          24
        )
      }

      // Box de Metadados de Emissão (Canto Superior Direito)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
      doc.roundedRect(217, 6, 66, 21.5, 2, 2, "FD")

      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(71, 85, 105)
      doc.text("PARÂMETROS DE EMISSÃO", 221, 10.5)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      doc.text(
        `Data/Hora: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        221,
        14.2
      )

      const suppLabel = filteredSuppDetails ? filteredSuppDetails.name : "Todos os Fornecedores"
      const suppDisplay = suppLabel.length > 20 ? suppLabel.substring(0, 18) + "..." : suppLabel
      doc.text(`Fornecedor: ${suppDisplay}`, 221, 17.7)

      const statusLabel = filters?.status && filters.status !== "all" ? filters.status.toUpperCase() : "Todos os Status"
      if (filteredSuppDetails) {
        doc.text(`CNPJ: ${filteredSuppDetails.cnpj || "Não informado"}`, 221, 21.2)
        doc.text(`Status: ${statusLabel}`, 221, 24.7)
      } else {
        doc.text(`Status: ${statusLabel}`, 221, 21.5)
      }

      // 4 Cards de KPIs Executivos
      drawKpiCard(
        doc,
        14,
        30,
        64,
        17,
        "Total de Pedidos",
        `${totalCount} pedido${totalCount !== 1 ? "s" : ""}`,
        `${concluidosCount} concluído(s) / ${pendentesCount} em aberto`,
        [37, 99, 235]
      )

      drawKpiCard(
        doc,
        82,
        30,
        64,
        17,
        "Volume Financeiro Total",
        `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "Soma dos valores totais dos pedidos",
        [15, 23, 42]
      )

      drawKpiCard(
        doc,
        150,
        30,
        64,
        17,
        "Concluídos / Entregues",
        `R$ ${concluidosVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `${concluidosCount} pedido${concluidosCount !== 1 ? "s" : ""} (${pctConcluidos}% do volume)`,
        [16, 185, 129]
      )

      drawKpiCard(
        doc,
        218,
        30,
        65,
        17,
        "Em Aberto / Pendentes",
        `R$ ${pendentesVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `${pendentesCount} pedido${pendentesCount !== 1 ? "s" : ""} (${pctPendentes}% aguardando)`,
        pendentesCount > 0 ? [217, 119, 6] : [100, 116, 139]
      )

      // Mapeamento dos Dados da Tabela Executiva
      const tableRows = filteredOrders.map((order) => {
        const contract = contracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)

        // Coluna 0: Identificação do Pedido & Data
        const orderNum = order.number || "Sem nº"
        const orderDate = order.date ? new Date(order.date).toLocaleDateString("pt-BR") : "-"
        const deliveryDate = order.deliveryDate ? `Entrega: ${new Date(order.deliveryDate).toLocaleDateString("pt-BR")}` : ""
        const col0 = deliveryDate ? `${orderNum}\nData: ${orderDate}\n${deliveryDate}` : `${orderNum}\nData: ${orderDate}`

        // Coluna 1: Fornecedor Contratado / CNPJ
        const suppDetails = resolveSupplierDetails(contract?.company, contract?.cnpj, contract?.supplierId)
        const col1 = suppDetails.formattedDisplay

        // Coluna 2: Contrato & Secretaria Demandante
        const contractRef = order.contractNumber || contract?.number || "Sem contrato vinculado"
        const sec = contract?.costBase || order.requestedByDepartment || "Geral / Não informada"
        const col2 = `${contractRef}\nSecretaria: ${sec}`

        // Coluna 3: Itens do Pedido (Produtos / Quantidade / Valores)
        let col3 = "Nenhum item discriminado"
        if (order.items && order.items.length > 0) {
          col3 = order.items
            .map((item) => {
              const qty = item.quantity || 0
              const unitPrice = item.unitPrice || 0
              const itemTotal = item.totalPrice || qty * unitPrice
              return `• ${item.name} (${qty} un) — R$ ${itemTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            })
            .join("\n")
        }

        // Coluna 4: Solicitante & Destino
        const sol = order.requestedBy ? `Sol: ${order.requestedBy}` : "Sol: Não informado"
        const dest = order.requestedFor ? `Para: ${order.requestedFor}` : order.requestedByDepartment ? `Depto: ${order.requestedByDepartment}` : ""
        const col4 = dest ? `${sol}\n${dest}` : sol

        // Coluna 5: Valor Total
        const col5 = `R$ ${(order.totalValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

        // Coluna 6: Status
        const statusUpper = (order.status || "Pendente").toUpperCase()
        const col6 = `[ ${statusUpper} ]`

        return [col0, col1, col2, col3, col4, col5, col6]
      })

      const bodyData = tableRows.length > 0
        ? tableRows
        : [["Nenhum pedido encontrado com os filtros selecionados.", "-", "-", "-", "-", "-", "-"]]

      autoTable(doc, {
        head: [
          [
            "Nº Pedido / Data",
            "Fornecedor / CNPJ",
            "Contrato / Secretaria",
            "Itens do Pedido (Produtos, Qtd e Valor)",
            "Solicitante / Destino",
            "Valor Total",
            "Status",
          ],
        ],
        body: bodyData,
        startY: 50,
        margin: { top: 18, bottom: 16, left: 14, right: 14 },
        styles: {
          font: "helvetica",
          fontSize: 7,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: "bold", textColor: [15, 23, 42] },
          1: { cellWidth: 48 },
          2: { cellWidth: 40 },
          3: { cellWidth: 68 },
          4: { cellWidth: 33 },
          5: { cellWidth: 26, halign: "right", fontStyle: "bold", textColor: [15, 23, 42] },
          6: { cellWidth: 24, halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            if (data.column.index === 6) {
              const txt = String(data.cell.raw || "").toUpperCase()
              if (txt.includes("CONCLUÍDO") || txt.includes("ENTREGUE") || txt.includes("REALIZADO")) {
                data.cell.styles.textColor = [16, 185, 129]
                data.cell.styles.fontStyle = "bold"
              } else if (txt.includes("PENDENTE") || txt.includes("SEPARAÇÃO") || txt.includes("SEPAÇÃO")) {
                data.cell.styles.textColor = [217, 119, 6]
                data.cell.styles.fontStyle = "bold"
              } else if (txt.includes("CANCELADO")) {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fontStyle = "bold"
              }
            }
          }
        },
      })

      // Cabeçalho de Páginas Subsequentes e Rodapé em Todas as Páginas
      const pageCount = (doc as any).internal.getNumberOfPages()
      const emitDateStr = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)

        // Cabeçalho a partir da página 2
        if (i > 1) {
          doc.setFontSize(7.5)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(37, 99, 235)
          doc.text("LICITAME", 14, 11)

          doc.setFont("helvetica", "normal")
          doc.setTextColor(100, 116, 139)
          doc.text(` • ${docTitleDisplay}`, 28, 11)
          doc.text(`Fornecedor: ${suppLabel} | Status: ${statusLabel}`, 283, 11, { align: "right" })

          doc.setDrawColor(226, 232, 240)
          doc.line(14, 13, 283, 13)
        }

        // Rodapé Oficial em todas as páginas
        doc.setDrawColor(226, 232, 240)
        doc.line(14, 199, 283, 199)

        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(148, 163, 184)
        doc.text(`Sistema Licitame • Emitido em ${emitDateStr}`, 14, 203.5)
        doc.text("Documento Gerencial para Tomada de Decisão • Uso Reservado", 148, 203.5, { align: "center" })
        doc.text(`Página ${i} de ${pageCount}`, 283, 203.5, { align: "right" })
      }

      let filePrefix = "relatorio-pedidos"
      if (filters?.supplier && filters.supplier !== "all") {
        const slug = filters.supplier.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")
        filePrefix = `relatorio-pedidos-${slug}`
      } else if (filters?.status && filters.status !== "all") {
        filePrefix = `relatorio-pedidos-${filters.status}`
      }

      doc.save(`${filePrefix}-${new Date().toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvHeader = [
        "Número do Pedido",
        "Data do Pedido",
        "Previsão de Entrega",
        "Fornecedor Contratado",
        "CNPJ",
        "Contrato Vinculado",
        "Secretaria / Órgão Demandante",
        "Solicitante",
        "Destino / Setor",
        "Itens do Pedido",
        "Quantidade de Itens",
        "Valor Total (R$)",
        "Status",
      ]
        .map(escapeCsv)
        .join(";")

      const csvRows = filteredOrders.map((order) => {
        const contract = contracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)
        const suppCsv = resolveSupplierDetails(contract?.company, contract?.cnpj, contract?.supplierId)
        const supplierName = suppCsv.name
        const cnpj = suppCsv.cnpj || "Não informado"
        const contractRef = order.contractNumber || contract?.number || "-"
        const sec = contract?.costBase || order.requestedByDepartment || "-"
        const orderDate = order.date ? new Date(order.date).toLocaleDateString("pt-BR") : "-"
        const deliveryDate = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("pt-BR") : "-"

        const itemsSummary = order.items && order.items.length > 0
          ? order.items.map((i) => `${i.quantity}x ${i.name} (R$ ${(i.totalPrice || i.quantity * i.unitPrice).toFixed(2)})`).join(" | ")
          : "Nenhum item"
        const itemsCount = order.items ? order.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0

        return [
          order.number,
          orderDate,
          deliveryDate,
          supplierName,
          cnpj,
          contractRef,
          sec,
          order.requestedBy || "-",
          order.requestedFor || "-",
          itemsSummary,
          itemsCount,
          (order.totalValue || 0).toFixed(2),
          order.status,
        ]
          .map(escapeCsv)
          .join(";")
      })

      const csvContent = [csvHeader, ...csvRows].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url

      let filePrefix = "relatorio-pedidos"
      if (filters?.supplier && filters.supplier !== "all") {
        const slug = filters.supplier.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")
        filePrefix = `relatorio-pedidos-${slug}`
      } else if (filters?.status && filters.status !== "all") {
        filePrefix = `relatorio-pedidos-${filters.status}`
      }

      link.download = `${filePrefix}-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateSuppliersReport = (format: ReportFormat, filters?: ReportFilter) => {
    const now = new Date()

    const applyLandscapeChrome = (
      doc: jsPDF,
      headerTitle: string,
      rightFilterText: string
    ) => {
      const pageCount = (doc as any).internal.getNumberOfPages()
      const emitDateStr = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        if (i > 1) {
          doc.setFontSize(7.5)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(37, 99, 235)
          doc.text("LICITAME", 14, 11)

          doc.setFont("helvetica", "normal")
          doc.setTextColor(100, 116, 139)
          const truncatedTitle = headerTitle.length > 65 ? headerTitle.substring(0, 62) + "..." : headerTitle
          doc.text(` • ${truncatedTitle}`, 28, 11)
          doc.text(rightFilterText, 283, 11, { align: "right" })

          doc.setDrawColor(226, 232, 240)
          doc.line(14, 13, 283, 13)
        }

        doc.setDrawColor(226, 232, 240)
        doc.line(14, 199, 283, 199)

        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(148, 163, 184)
        doc.text(`Sistema Licitame • Emitido em ${emitDateStr}`, 14, 203.5)
        doc.text("Documento Gerencial para Tomada de Decisão • Uso Reservado", 148, 203.5, { align: "center" })
        doc.text(`Página ${i} de ${pageCount}`, 283, 203.5, { align: "right" })
      }
    }

    // MODO A: RELATÓRIO INDIVIDUAL DO FORNECEDOR (Dossiê completo com contratos e todos os pedidos feitos)
    if (filters?.supplier && filters.supplier !== "all") {
      const target = filters.supplier.toLowerCase().trim()
      const targetClean = target.replace(/\D/g, "")

      const matchedSupplier = suppliers.find((s) => {
        const sName = (s.name || "").toLowerCase().trim()
        const sCnpj = (s.cnpj || "").replace(/\D/g, "")
        return (
          s.id.toLowerCase() === target ||
          sName === target ||
          (sName && (sName.includes(target) || target.includes(sName))) ||
          (targetClean.length >= 8 && sCnpj.includes(targetClean))
        )
      })

      const supplierContracts = contracts.filter((c) => {
        const comp = (c.company || "").toLowerCase().trim()
        const suppId = (c.supplierId || "").toLowerCase().trim()
        const cnpj = (c.cnpj || "").replace(/\D/g, "")
        if (matchedSupplier && suppId && suppId === matchedSupplier.id.toLowerCase()) return true
        return (
          comp === target ||
          (comp && (comp.includes(target) || target.includes(comp))) ||
          (targetClean.length >= 8 && cnpj.includes(targetClean))
        )
      })

      const contractIds = new Set(supplierContracts.map((c) => c.id).filter(Boolean))
      const contractNumbers = new Set(supplierContracts.map((c) => c.number).filter(Boolean))

      let supplierOrders = orders.filter(
        (o) => (o.contractId && contractIds.has(o.contractId)) || (o.contractNumber && contractNumbers.has(o.contractNumber))
      )

      if (filters?.startDate) {
        supplierOrders = supplierOrders.filter((o) => new Date(o.date) >= new Date(filters.startDate!))
      }
      if (filters?.endDate) {
        const end = new Date(filters.endDate!)
        end.setHours(23, 59, 59, 999)
        supplierOrders = supplierOrders.filter((o) => new Date(o.date) <= end)
      }
      const orderStatusFilter = filters?.status?.toLowerCase().trim()
      if (orderStatusFilter && !["all", "ativo", "inativo"].includes(orderStatusFilter)) {
        supplierOrders = supplierOrders.filter((o) => o.status?.toLowerCase().trim() === orderStatusFilter)
      }

      supplierOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      const suppDetails = resolveSupplierDetails(
        matchedSupplier?.name || supplierContracts[0]?.company || filters.supplier,
        matchedSupplier?.cnpj || supplierContracts[0]?.cnpj,
        matchedSupplier?.id || supplierContracts[0]?.supplierId
      )

      const totalContractedVal = supplierContracts.reduce((sum, c) => sum + (c.value || c.totalValue || 0), 0)
      const totalOrdersCount = supplierOrders.length
      const totalOrdersVal = supplierOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0)
      const avgOrderVal = totalOrdersCount > 0 ? totalOrdersVal / totalOrdersCount : 0

      const concluidos = supplierOrders.filter((o) =>
        ["concluído", "entregue", "realizado"].includes((o.status || "").toLowerCase())
      )
      const pendentes = supplierOrders.filter((o) =>
        ["pendente", "em separação", "em sepação", "rascunho"].includes((o.status || "").toLowerCase())
      )
      const canceladosCount = supplierOrders.filter((o) => (o.status || "").toLowerCase() === "cancelado").length
      const concluidosVal = concluidos.reduce((sum, o) => sum + (o.totalValue || 0), 0)
      const pendentesVal = pendentes.reduce((sum, o) => sum + (o.totalValue || 0), 0)
      const pctConcluidos = totalOrdersCount > 0 ? Math.round((concluidos.length / totalOrdersCount) * 100) : 0

      const slug = suppDetails.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")

      if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

        // Barra superior executiva
        doc.setFillColor(15, 23, 42)
        doc.rect(0, 0, 297, 3.5, "F")

        // Identidade do Sistema
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(37, 99, 235)
        doc.text("LICITAME  •  RELATÓRIO INDIVIDUAL DE FORNECEDOR E HISTÓRICO DE PEDIDOS", 14, 10.5)

        // Título com Nome do Fornecedor
        const docTitle = `DOSSIÊ DO FORNECEDOR — ${suppDetails.name.toUpperCase()}`
        const docTitleDisplay = docTitle.length > 56 ? docTitle.substring(0, 53) + "..." : docTitle
        doc.setFontSize(13.5)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(15, 23, 42)
        doc.text(docTitleDisplay, 14, 17.5)

        // CNPJ imediatamente abaixo do nome + ficha de contato
        doc.setFontSize(8.5)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(51, 65, 85)
        const statusBadgeText = matchedSupplier ? (matchedSupplier.active ? " • Situação: ATIVO" : " • Situação: INATIVO") : ""
        doc.text(`CNPJ: ${suppDetails.cnpj || "Não informado"}${statusBadgeText}`, 14, 22.5)

        doc.setFontSize(7.5)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 116, 139)
        const contactParts: string[] = []
        if (matchedSupplier?.contactPhone) contactParts.push(`Tel: ${matchedSupplier.contactPhone}`)
        if (matchedSupplier?.email) contactParts.push(`Email: ${matchedSupplier.email}`)
        if (matchedSupplier?.city) contactParts.push(`${matchedSupplier.city}${matchedSupplier.state ? `/${matchedSupplier.state}` : ""}`)
        doc.text(
          contactParts.length > 0
            ? contactParts.join("  |  ")
            : "Consolidado gerencial de contratos vigentes e todos os pedidos realizados ao fornecedor.",
          14,
          27
        )

        // Box de Parâmetros de Emissão
        doc.setFillColor(248, 250, 252)
        doc.setDrawColor(203, 213, 225)
        doc.roundedRect(217, 6, 66, 21.5, 2, 2, "FD")

        doc.setFontSize(7)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(71, 85, 105)
        doc.text("PARÂMETROS DO DOSSIÊ", 221, 10.5)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(6.5)
        doc.setTextColor(100, 116, 139)
        doc.text(
          `Emissão: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          221,
          14.2
        )
        const periodLabel =
          filters?.startDate || filters?.endDate
            ? `${filters?.startDate ? new Date(filters.startDate).toLocaleDateString("pt-BR") : "..."} a ${
                filters?.endDate ? new Date(filters.endDate).toLocaleDateString("pt-BR") : "..."
              }`
            : "Todo o Histórico"
        doc.text(`Período: ${periodLabel}`, 221, 17.7)
        doc.text(`Contratos: ${supplierContracts.length}  |  Pedidos: ${totalOrdersCount}`, 221, 21.2)
        const orderStatusDisplay =
          orderStatusFilter && !["all", "ativo", "inativo"].includes(orderStatusFilter)
            ? orderStatusFilter.toUpperCase()
            : "Todos os Pedidos"
        doc.text(`Filtro Pedidos: ${orderStatusDisplay}`, 221, 24.7)

        // 4 Cards de KPIs Executivos
        drawKpiCard(
          doc,
          14,
          30,
          64,
          17,
          "Contratos Vinculados",
          `${supplierContracts.length} contrato${supplierContracts.length !== 1 ? "s" : ""}`,
          `Pactuado: R$ ${totalContractedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          [15, 23, 42]
        )

        drawKpiCard(
          doc,
          82,
          30,
          64,
          17,
          "Pedidos Feitos ao Fornecedor",
          `${totalOrdersCount} pedido${totalOrdersCount !== 1 ? "s" : ""}`,
          `${concluidos.length} concluído(s) • ${pendentes.length} em aberto`,
          [37, 99, 235]
        )

        drawKpiCard(
          doc,
          150,
          30,
          64,
          17,
          "Volume Total em Pedidos",
          `R$ ${totalOrdersVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `Ticket médio: R$ ${avgOrderVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          [124, 58, 237]
        )

        drawKpiCard(
          doc,
          218,
          30,
          65,
          17,
          "Atendidos vs Em Aberto",
          `R$ ${concluidosVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `${pctConcluidos}% atendido • Aberto: R$ ${pendentesVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          pendentes.length > 0 ? [217, 119, 6] : [16, 185, 129]
        )

        let nextSectionY = 52

        // Seção 1: Resumo dos Contratos Vinculados
        if (supplierContracts.length > 0) {
          doc.setFontSize(8.5)
          doc.setFont("helvetica", "bold")
          doc.setTextColor(15, 23, 42)
          doc.text(`1. CONTRATOS VINCULADOS (${supplierContracts.length})`, 14, nextSectionY)

          const contractRows = supplierContracts.map((c) => {
            const cVal = c.value || c.totalValue || 0
            const cUsed = c.usedValue || 0
            const cSaldo = cVal - cUsed
            const start = c.startDate ? new Date(c.startDate).toLocaleDateString("pt-BR") : "-"
            const end = c.expirationDate ? new Date(c.expirationDate).toLocaleDateString("pt-BR") : "-"
            return [
              c.number || "Sem nº",
              c.costBase || c.contractingParty || "Geral",
              getContractDescription(c),
              `${start}\na ${end}`,
              `R$ ${cVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              `Exec: R$ ${cUsed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\nSaldo: R$ ${cSaldo.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`,
              `[ ${(c.status || "Ativo").toUpperCase()} ]`,
            ]
          })

          autoTable(doc, {
            head: [["Contrato", "Secretaria / Base", "Objeto", "Vigência", "Valor Pactuado", "Execução / Saldo", "Situação"]],
            body: contractRows,
            startY: nextSectionY + 2.5,
            margin: { top: 18, bottom: 16, left: 14, right: 14 },
            styles: {
              font: "helvetica",
              fontSize: 6.8,
              textColor: [30, 41, 59],
              lineColor: [226, 232, 240],
              lineWidth: 0.1,
              cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
              overflow: "linebreak",
              valign: "top",
            },
            headStyles: {
              fillColor: [30, 41, 59],
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: "bold",
              cellPadding: 2,
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
              0: { cellWidth: 30, fontStyle: "bold" },
              1: { cellWidth: 38 },
              2: { cellWidth: 81 },
              3: { cellWidth: 26, halign: "center" },
              4: { cellWidth: 30, halign: "right" },
              5: { cellWidth: 40, halign: "right" },
              6: { cellWidth: 24, halign: "center", fontStyle: "bold" },
            },
          })

          nextSectionY = ((doc as any).lastAutoTable?.finalY || nextSectionY + 20) + 8
        }

        // Evita título órfão no fim da página
        if (nextSectionY > 172) {
          doc.addPage()
          nextSectionY = 19
        }

        // Seção 2: Todos os Pedidos Realizados ao Fornecedor
        doc.setFontSize(8.5)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(15, 23, 42)
        doc.text(
          `${supplierContracts.length > 0 ? "2." : "1."} HISTÓRICO COMPLETO DE PEDIDOS FEITOS (${supplierOrders.length})`,
          14,
          nextSectionY
        )

        const orderRows = supplierOrders.map((order) => {
          const linkedContract = supplierContracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)
          const orderNum = order.number || "Sem nº"
          const orderDate = order.date ? new Date(order.date).toLocaleDateString("pt-BR") : "-"
          const deliveryStr = order.deliveryDate ? `\nEntrega: ${new Date(order.deliveryDate).toLocaleDateString("pt-BR")}` : ""
          const col0 = `${orderNum}\nData: ${orderDate}${deliveryStr}`

          const contractRef = order.contractNumber || linkedContract?.number || "Sem contrato"
          const sec = linkedContract?.costBase || order.requestedByDepartment || "Não informada"
          const col1 = `${contractRef}\nSec: ${sec}`

          const col2 =
            order.items && order.items.length > 0
              ? order.items
                  .map((item) => {
                    const qty = item.quantity || 0
                    const unit = item.unitPrice || 0
                    const total = item.totalPrice || qty * unit
                    return `• ${qty}x ${item.name} (Unit: R$ ${unit.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })} | Total: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`
                  })
                  .join("\n")
              : "Nenhum item discriminado"

          const sol = order.requestedBy ? `Sol: ${order.requestedBy}` : "Sol: Não informado"
          const dest = order.requestedFor
            ? `\nPara: ${order.requestedFor}`
            : order.requestedByDepartment
              ? `\nDepto: ${order.requestedByDepartment}`
              : ""
          const notes = order.notes ? `\nObs: ${order.notes}` : ""
          const col3 = `${sol}${dest}${notes}`

          const col4 = `R$ ${(order.totalValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          const col5 = `[ ${(order.status || "Pendente").toUpperCase()} ]`

          return [col0, col1, col2, col3, col4, col5]
        })

        const orderBody =
          orderRows.length > 0
            ? orderRows
            : [["Nenhum pedido encontrado para este fornecedor com os filtros selecionados.", "-", "-", "-", "-", "-"]]

        autoTable(doc, {
          head: [
            [
              "Nº Pedido / Datas",
              "Contrato / Secretaria",
              "Itens do Pedido (Qtd, Produto, Unitário e Total)",
              "Solicitante / Destino",
              "Valor Total",
              "Status",
            ],
          ],
          body: orderBody,
          startY: nextSectionY + 2.5,
          margin: { top: 18, bottom: 16, left: 14, right: 14 },
          styles: {
            font: "helvetica",
            fontSize: 7,
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.1,
            cellPadding: { top: 2.3, bottom: 2.3, left: 2, right: 2 },
            overflow: "linebreak",
            valign: "top",
          },
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: "bold",
            cellPadding: 2.5,
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 30, fontStyle: "bold", textColor: [15, 23, 42] },
            1: { cellWidth: 42 },
            2: { cellWidth: 92 },
            3: { cellWidth: 43 },
            4: { cellWidth: 32, halign: "right", fontStyle: "bold", textColor: [15, 23, 42] },
            5: { cellWidth: 30, halign: "center" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 5) {
              const txt = String(data.cell.raw || "").toUpperCase()
              if (txt.includes("CONCLUÍDO") || txt.includes("ENTREGUE") || txt.includes("REALIZADO")) {
                data.cell.styles.textColor = [16, 185, 129]
                data.cell.styles.fontStyle = "bold"
              } else if (txt.includes("PENDENTE") || txt.includes("SEPARAÇÃO") || txt.includes("SEPAÇÃO")) {
                data.cell.styles.textColor = [217, 119, 6]
                data.cell.styles.fontStyle = "bold"
              } else if (txt.includes("CANCELADO")) {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fontStyle = "bold"
              }
            }
          },
        })

        applyLandscapeChrome(
          doc,
          docTitleDisplay,
          `Fornecedor: ${suppDetails.name} | CNPJ: ${suppDetails.cnpj || "Não informado"}`
        )

        doc.save(`dossie-fornecedor-${slug}-${now.toISOString().split("T")[0]}.pdf`)
      } else if (format === "csv" || format === "excel") {
        const csvHeader = [
          "Fornecedor",
          "CNPJ",
          "Número do Pedido",
          "Data do Pedido",
          "Previsão de Entrega",
          "Contrato Vinculado",
          "Secretaria / Base de Custo",
          "Itens do Pedido",
          "Qtd Total de Itens",
          "Solicitante",
          "Destino",
          "Observações",
          "Valor Total (R$)",
          "Status",
        ]
          .map(escapeCsv)
          .join(";")

        const csvRows = supplierOrders.map((order) => {
          const linkedContract = supplierContracts.find((c) => c.id === order.contractId || c.number === order.contractNumber)
          const itemsSummary =
            order.items && order.items.length > 0
              ? order.items
                  .map(
                    (i) =>
                      `${i.quantity}x ${i.name} (Unit: R$ ${(i.unitPrice || 0).toFixed(2)} | Total: R$ ${(
                        i.totalPrice || i.quantity * i.unitPrice
                      ).toFixed(2)})`
                  )
                  .join(" | ")
              : "Nenhum item"
          const itemsCount = order.items ? order.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0

          return [
            suppDetails.name,
            suppDetails.cnpj || "Não informado",
            order.number,
            order.date ? new Date(order.date).toLocaleDateString("pt-BR") : "-",
            order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("pt-BR") : "-",
            order.contractNumber || linkedContract?.number || "-",
            linkedContract?.costBase || order.requestedByDepartment || "-",
            itemsSummary,
            itemsCount,
            order.requestedBy || "-",
            order.requestedFor || "-",
            order.notes || "-",
            (order.totalValue || 0).toFixed(2),
            order.status,
          ]
            .map(escapeCsv)
            .join(";")
        })

        const csvContent = [csvHeader, ...csvRows].join("\n")
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `dossie-fornecedor-${slug}-${now.toISOString().split("T")[0]}.csv`
        link.click()
        URL.revokeObjectURL(url)
      }
      return
    }

    // MODO B: RELATÓRIO GERAL DE FORNECEDORES (consolidado executivo com contagem de contratos e pedidos)
    type UnifiedSupplierRow = {
      id?: string
      name: string
      cnpj: string
      email: string
      contactPhone: string
      cityState: string
      active: boolean
      contractsCount: number
      contractedVal: number
      ordersCount: number
      ordersVal: number
    }

    const unifiedMap = new Map<string, UnifiedSupplierRow>()

    const getSupplierStats = (sId: string | undefined, sName: string, sCnpj: string) => {
      const cleanTarget = sName.toLowerCase().trim()
      const cleanCnpj = sCnpj.replace(/\D/g, "")
      const matchedContracts = contracts.filter((c) => {
        if (sId && c.supplierId === sId) return true
        const comp = (c.company || "").toLowerCase().trim()
        const cCnpj = (c.cnpj || "").replace(/\D/g, "")
        return comp === cleanTarget || (cleanCnpj.length >= 8 && cCnpj === cleanCnpj)
      })
      const cIds = new Set(matchedContracts.map((c) => c.id).filter(Boolean))
      const cNums = new Set(matchedContracts.map((c) => c.number).filter(Boolean))
      const matchedOrders = orders.filter(
        (o) => (o.contractId && cIds.has(o.contractId)) || (o.contractNumber && cNums.has(o.contractNumber))
      )
      return {
        contractsCount: matchedContracts.length,
        contractedVal: matchedContracts.reduce((sum, c) => sum + (c.value || c.totalValue || 0), 0),
        ordersCount: matchedOrders.length,
        ordersVal: matchedOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0),
      }
    }

    suppliers.forEach((s) => {
      const details = resolveSupplierDetails(s.name, s.cnpj, s.id)
      const key = details.name.toLowerCase().trim()
      const stats = getSupplierStats(s.id, details.name, details.cnpj)
      unifiedMap.set(key, {
        id: s.id,
        name: details.name,
        cnpj: details.cnpj,
        email: s.email || "-",
        contactPhone: s.contactPhone || "-",
        cityState: s.city ? `${s.city}${s.state ? `/${s.state}` : ""}` : "-",
        active: s.active,
        ...stats,
      })
    })

    contracts.forEach((c) => {
      const details = resolveSupplierDetails(c.company, c.cnpj, c.supplierId)
      const key = details.name.toLowerCase().trim()
      if (!unifiedMap.has(key) && c.company?.trim()) {
        const stats = getSupplierStats(c.supplierId, details.name, details.cnpj)
        unifiedMap.set(key, {
          id: c.supplierId,
          name: details.name,
          cnpj: details.cnpj,
          email: "-",
          contactPhone: "-",
          cityState: "-",
          active: true,
          ...stats,
        })
      }
    })

    let filteredSuppliers = Array.from(unifiedMap.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

    if (filters?.status === "ativo" || filters?.status === "inativo") {
      const isActive = filters.status === "ativo"
      filteredSuppliers = filteredSuppliers.filter((s) => s.active === isActive)
    }

    const totalCount = filteredSuppliers.length
    const activeCount = filteredSuppliers.filter((s) => s.active).length
    const totalContracts = filteredSuppliers.reduce((sum, s) => sum + s.contractsCount, 0)
    const totalOrdersCount = filteredSuppliers.reduce((sum, s) => sum + s.ordersCount, 0)
    const totalOrdersVal = filteredSuppliers.reduce((sum, s) => sum + s.ordersVal, 0)

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, 297, 3.5, "F")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(37, 99, 235)
      doc.text("LICITAME  •  SISTEMA INTEGRADO DE GESTÃO ESTRATÉGICA DE FORNECEDORES", 14, 11)

      const docTitle = "RELATÓRIO EXECUTIVO DE FORNECEDORES E DEMANDAS"
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(15, 23, 42)
      doc.text(docTitle, 14, 18)

      doc.setFontSize(8.5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text(
        "Visão gerencial da base de fornecedores, contratos ativos, volume de pedidos realizados e canais de contato.",
        14,
        24
      )

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
      doc.roundedRect(217, 7, 66, 20, 2, 2, "FD")

      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(71, 85, 105)
      doc.text("PARÂMETROS DE EMISSÃO", 221, 11.5)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      doc.text(
        `Data/Hora: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        221,
        15.5
      )
      doc.text(`Status: ${filters?.status ? filters.status.toUpperCase() : "Todos"}`, 221, 19.5)
      doc.text(`Fornecedores: ${totalCount}`, 221, 23.5)

      drawKpiCard(
        doc,
        14,
        30,
        64,
        17,
        "Fornecedores Listados",
        `${totalCount} empresa${totalCount !== 1 ? "s" : ""}`,
        `${activeCount} ativo(s) • ${totalCount - activeCount} inativo(s)`,
        [37, 99, 235]
      )
      drawKpiCard(
        doc,
        82,
        30,
        64,
        17,
        "Contratos Vinculados",
        `${totalContracts} contrato${totalContracts !== 1 ? "s" : ""}`,
        "Soma global dos vínculos ativos/encerrados",
        [15, 23, 42]
      )
      drawKpiCard(
        doc,
        150,
        30,
        64,
        17,
        "Pedidos Registrados",
        `${totalOrdersCount} pedido${totalOrdersCount !== 1 ? "s" : ""}`,
        "Total de solicitações emitidas aos fornecedores",
        [124, 58, 237]
      )
      drawKpiCard(
        doc,
        218,
        30,
        65,
        17,
        "Volume Movimentado",
        `R$ ${totalOrdersVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "Valor acumulado dos pedidos listados",
        [16, 185, 129]
      )

      const tableRows = filteredSuppliers.map((s) => [
        `${s.name}\nCNPJ: ${s.cnpj || "Não informado"}`,
        `Tel: ${s.contactPhone}\nEmail: ${s.email}`,
        s.cityState,
        `${s.contractsCount} contrato(s)\nR$ ${s.contractedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `${s.ordersCount} pedido(s)\nR$ ${s.ordersVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `[ ${s.active ? "ATIVO" : "INATIVO"} ]`,
      ])

      autoTable(doc, {
        head: [["Fornecedor / CNPJ", "Contato / Email", "Cidade / UF", "Contratos", "Pedidos Feitos", "Status"]],
        body: tableRows.length > 0 ? tableRows : [["Nenhum fornecedor encontrado.", "-", "-", "-", "-", "-"]],
        startY: 50,
        margin: { top: 18, bottom: 16, left: 14, right: 14 },
        styles: {
          font: "helvetica",
          fontSize: 7,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
          cellPadding: { top: 2.3, bottom: 2.3, left: 2, right: 2 },
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
          cellPadding: 2.5,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 74, fontStyle: "bold", textColor: [15, 23, 42] },
          1: { cellWidth: 62 },
          2: { cellWidth: 32 },
          3: { cellWidth: 38, halign: "right" },
          4: { cellWidth: 39, halign: "right" },
          5: { cellWidth: 24, halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const txt = String(data.cell.raw || "").toUpperCase()
            if (txt.includes("ATIVO") && !txt.includes("INATIVO")) {
              data.cell.styles.textColor = [16, 185, 129]
              data.cell.styles.fontStyle = "bold"
            } else if (txt.includes("INATIVO")) {
              data.cell.styles.textColor = [220, 38, 38]
              data.cell.styles.fontStyle = "bold"
            }
          }
        },
      })

      applyLandscapeChrome(doc, docTitle, `Status: ${filters?.status || "Todos"}`)
      doc.save(`relatorio-fornecedores-${now.toISOString().split("T")[0]}.pdf`)
    } else if (format === "csv" || format === "excel") {
      const csvHeader = [
        "Nome / Razão Social",
        "CNPJ",
        "Email",
        "Telefone",
        "Cidade / UF",
        "Qtd Contratos",
        "Valor Contratado (R$)",
        "Qtd Pedidos",
        "Volume em Pedidos (R$)",
        "Status",
      ]
        .map(escapeCsv)
        .join(";")

      const csvRows = filteredSuppliers.map((s) =>
        [
          s.name,
          s.cnpj || "Não informado",
          s.email,
          s.contactPhone,
          s.cityState,
          s.contractsCount,
          s.contractedVal.toFixed(2),
          s.ordersCount,
          s.ordersVal.toFixed(2),
          s.active ? "Ativo" : "Inativo",
        ]
          .map(escapeCsv)
          .join(";")
      )

      const csvContent = [csvHeader, ...csvRows].join("\n")
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-fornecedores-${now.toISOString().split("T")[0]}.csv`
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
      const suppOrderExt = resolveSupplierDetails(contract.company, contract.cnpj, contract.supplierId)
      doc.text(`Empresa Contratada: ${suppOrderExt.name} | CNPJ: ${suppOrderExt.cnpj || "Não informado"}`, 14, 46)

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
    // Filtrar APENAS os itens que efetivamente excederam a cota contratual
    const exceededItems = (contract.items || []).filter((item) => item.usedQuantity > item.quantity)

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(16)
      doc.setTextColor(180, 0, 0)
      doc.text("RELATÓRIO DE ITENS EXCEDIDOS NO CONTRATO", 14, 20)

      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 28)
      const suppContractInfo = resolveSupplierDetails(contract.company, contract.cnpj, contract.supplierId)
      doc.text(`Contrato Nº: ${contract.number} | Empresa: ${suppContractInfo.name} | CNPJ: ${suppContractInfo.cnpj || "Não informado"}`, 14, 34)
      doc.text(`Valor Total Contratado: R$ ${contract.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, 40)
      doc.text(`Valor Total Consumido: R$ ${contract.usedValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${contract.usedPercentage}%)`, 14, 46)

      const saldo = contract.value - contract.usedValue
      if (saldo < 0) {
        doc.setTextColor(180, 0, 0)
        doc.text(`Saldo Global: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (SALDO NEGATIVO / EXTRAPOLADO)`, 14, 52)
      } else {
        doc.setTextColor(0, 100, 0)
        doc.text(`Saldo Global: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (Dentro do Limite)`, 14, 52)
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      doc.text("1. Itens que Excederam a Cota Contratual", 14, 62)

      const itemTableData: any[] = []
      let globalExceededQty = 0
      let globalExceededValue = 0

      if (exceededItems.length === 0) {
        itemTableData.push(["Nenhum item excedeu a cota neste contrato.", "-", "-", "-", "-", "-", "-", "-"] || [])
      } else {
        exceededItems.forEach((item) => {
          const exceededQty = item.usedQuantity - item.quantity
          const exceededVal = exceededQty * item.unitPrice

          globalExceededQty += exceededQty
          globalExceededValue += exceededVal

          itemTableData.push([
            item.name,
            `${item.quantity} un`,
            `${item.usedQuantity} un`,
            `+${exceededQty} un`,
            `R$ ${item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `R$ ${(item.quantity * item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `R$ ${(item.usedQuantity * item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `R$ ${exceededVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          ])
        })
      }

      autoTable(doc, {
        head: [["Item / Produto", "Qtd Orig.", "Qtd Consum.", "Excesso (un)", "Preço Unit.", "Valor Orig.", "Valor Consum.", "Valor Excedido"]],
        body: itemTableData,
        startY: 66,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [180, 0, 0] },
        columnStyles: {
          3: { fontStyle: "bold", textColor: [180, 0, 0] },
          7: { fontStyle: "bold", textColor: [180, 0, 0] }
        }
      })

      let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 130

      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text("2. Histórico de Pedidos dos Itens Excedidos (Quando foi pedido)", 14, currentY)

      // Identificar pedidos que continham os itens excedidos
      const relevantOrderRows: any[] = []
      
      // Ordenar pedidos por data
      const sortedOrders = [...(contractOrders || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      exceededItems.forEach((exItem) => {
        let accumulated = 0
        sortedOrders.forEach((o) => {
          if (o.status === "cancelado") return
          const match = o.items?.find((oi) => oi.contractItemId === exItem.id || oi.name === exItem.name)
          if (match && match.quantity > 0) {
            accumulated += match.quantity
            const isExceeding = accumulated > exItem.quantity
            const excessInOrder = isExceeding ? (accumulated - match.quantity < exItem.quantity ? accumulated - exItem.quantity : match.quantity) : 0
            
            if (isExceeding) {
              relevantOrderRows.push([
                exItem.name,
                o.number,
                new Date(o.date).toLocaleDateString("pt-BR"),
                o.requestedBy || "Não informado",
                `${match.quantity} un`,
                `+${excessInOrder} un`,
                `R$ ${(excessInOrder * exItem.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              ])
            }
          }
        })
      })

      if (relevantOrderRows.length === 0) {
        relevantOrderRows.push(["Sem pedidos gravados para itens excedidos", "-", "-", "-", "-", "-", "-"])
      }

      autoTable(doc, {
        head: [["Item Excedido", "Pedido Nº", "Data do Pedido", "Solicitante", "Qtd Solicitada", "Excesso no Pedido", "Valor Excedido (R$)"]],
        body: relevantOrderRows,
        startY: currentY + 4,
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [70, 70, 70] },
        columnStyles: {
          5: { fontStyle: "bold", textColor: [180, 0, 0] },
          6: { fontStyle: "bold", textColor: [180, 0, 0] }
        }
      })

      currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 40

      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text("Síntese Geral da Extrapolação Contratual:", 14, currentY)
      doc.text(`• Quantidade de Itens que Extrapolaram a Cota: ${exceededItems.length} item(ns)`, 14, currentY + 6)
      doc.text(`• Total de Unidades Extrapoladas: +${globalExceededQty} unidade(s)`, 14, currentY + 12)
      doc.text(`• Valor Financeiro Total Extrapolado nos Itens: R$ ${globalExceededValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, currentY + 18)
      doc.text(`• Excesso no Saldo Global do Contrato: R$ ${Math.max(0, contract.usedValue - contract.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, currentY + 24)

      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text("Relatório enxuto gerado exclusivamente com itens que excederam os limites previstos no contrato.", 14, currentY + 34)

      doc.save(`relatorio-itens-excedidos-contrato-${contract.number}.pdf`)
    } else {
      const csvContent = [
        ["Item Excedido", "Qtd Contrato Original", "Qtd Total Consumida", "Unidades Excedidas", "Preço Unitario", "Valor Total Original", "Valor Total Consumido", "Valor Financeiro Excedido"].join(";"),
        ...exceededItems.map((item) => {
          const exceededQty = item.usedQuantity - item.quantity
          const exceededVal = exceededQty * item.unitPrice
          return [
            item.name,
            item.quantity,
            item.usedQuantity,
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
      link.download = `relatorio-itens-excedidos-contrato-${contract.number}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  const generateContractItemsReport = (contract: Contract, contractOrders: Order[], format: ReportFormat = "pdf") => {
    const items = contract.items || []
    const sortedOrders = [...(contractOrders || [])].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    if (format === "pdf") {
      const doc = new jsPDF()

      doc.setFontSize(16)
      doc.setTextColor(20, 50, 100)
      doc.text("RELATÓRIO GERAL DE ITENS DO CONTRATO", 14, 20)

      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 28)
      const suppContractInfo = resolveSupplierDetails(contract.company, contract.cnpj, contract.supplierId)
      doc.text(`Contrato Nº: ${contract.number} | Empresa: ${suppContractInfo.name} | CNPJ: ${suppContractInfo.cnpj || "Não informado"}`, 14, 34)
      doc.text(`Valor Total Contratado: R$ ${contract.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, 40)
      doc.text(`Valor Total Consumido: R$ ${contract.usedValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${contract.usedPercentage}%)`, 14, 46)

      const saldo = contract.value - contract.usedValue
      if (saldo < 0) {
        doc.setTextColor(180, 0, 0)
        doc.text(`Saldo Disponível: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (SALDO NEGATIVO / EXTRAPOLADO)`, 14, 52)
      } else {
        doc.setTextColor(0, 100, 0)
        doc.text(`Saldo Disponível: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (Dentro do Limite)`, 14, 52)
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      doc.text("1. Demonstrativo de Itens (Quantidade e Valores)", 14, 62)

      const itemTableData: any[] = []
      let totalQty = 0
      let totalUsedQty = 0
      let totalAvailableQty = 0

      if (items.length === 0) {
        itemTableData.push(["Nenhum item cadastrado neste contrato.", "-", "-", "-", "-", "-", "-", "-"])
      } else {
        items.forEach((item) => {
          const qty = item.quantity || 0
          const usedQty = item.usedQuantity || 0
          const availableQty = Math.max(0, qty - usedQty)
          const unitPrice = item.unitPrice || 0
          const totalVal = qty * unitPrice
          const usedVal = usedQty * unitPrice
          const saldoVal = (qty - usedQty) * unitPrice

          totalQty += qty
          totalUsedQty += usedQty
          totalAvailableQty += availableQty

          const saldoStr = saldoVal < 0 
            ? `-R$ ${Math.abs(saldoVal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            : `R$ ${saldoVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

          const availStr = usedQty > qty 
            ? `+${usedQty - qty} exced.`
            : `${availableQty} un`

          itemTableData.push([
            item.name,
            `${qty} un`,
            `${usedQty} un`,
            availStr,
            `R$ ${unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `R$ ${totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `R$ ${usedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            saldoStr
          ])
        })
      }

      autoTable(doc, {
        head: [["Item / Produto", "Qtd Total", "Qtd Usada", "Qtd Disp.", "Preço Unit.", "Valor Total", "Valor Usado", "Saldo (R$)"]],
        body: itemTableData,
        startY: 66,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: {
          3: { fontStyle: "bold" },
          7: { fontStyle: "bold" }
        }
      })

      let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 130

      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text("2. Histórico de Pedidos Realizados no Contrato", 14, currentY)

      const orderRows: any[] = []
      sortedOrders.forEach((o) => {
        if (o.status === "cancelado") return
        const itemCount = o.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0
        orderRows.push([
          o.number,
          new Date(o.date).toLocaleDateString("pt-BR"),
          o.requestedBy || "Não informado",
          o.requestedFor || "Geral",
          `${itemCount} un (${o.items?.length || 0} itens)`,
          `R$ ${(o.totalValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          o.status ? o.status.toUpperCase() : "CONCLUÍDO"
        ])
      })

      if (orderRows.length === 0) {
        orderRows.push(["Nenhum pedido registrado para este contrato", "-", "-", "-", "-", "-", "-"])
      }

      autoTable(doc, {
        head: [["Pedido Nº", "Data", "Solicitante", "Destino", "Qtd Total Pedida", "Valor do Pedido", "Status"]],
        body: orderRows,
        startY: currentY + 4,
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [51, 65, 85] }
      })

      currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : currentY + 40

      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text("Resumo Geral:", 14, currentY)
      doc.text(`• Total de Itens: ${items.length} cadastrados | Unidades Totais: ${totalQty} un (Usadas: ${totalUsedQty} un, Disponíveis: ${totalAvailableQty} un)`, 14, currentY + 6)
      doc.text(`• Valor Total Contratual: R$ ${contract.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Consumido: R$ ${contract.usedValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Saldo: R$ ${(contract.value - contract.usedValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, 14, currentY + 12)
      doc.text(`• Total de Pedidos Concluídos: ${orderRows.filter(r => r[0] !== "Nenhum pedido registrado para este contrato").length} pedido(s)`, 14, currentY + 18)

      doc.save(`relatorio-itens-contrato-${contract.number}.pdf`)
    } else {
      const csvContent = [
        ["Item", "Descricao", "Qtd Total Contrato", "Qtd Usada", "Qtd Disponivel", "Preco Unitario (R$)", "Valor Total Contratado (R$)", "Valor Total Usado (R$)", "Saldo Disponivel (R$)", "Percentual Usado (%)", "Status"].join(";"),
        ...items.map((item) => {
          const qty = item.quantity || 0
          const usedQty = item.usedQuantity || 0
          const availQty = qty - usedQty
          const unitPrice = item.unitPrice || 0
          const totalVal = qty * unitPrice
          const usedVal = usedQty * unitPrice
          const saldoVal = availQty * unitPrice
          const pct = qty > 0 ? ((usedQty / qty) * 100).toFixed(1) : "0.0"
          const status = usedQty > qty ? "Excedido" : usedQty === qty ? "Esgotado" : "Disponível"

          return [
            `"${(item.name || "").replace(/"/g, '""')}"`,
            `"${(item.description || "").replace(/"/g, '""')}"`,
            qty,
            usedQty,
            availQty,
            unitPrice.toFixed(2),
            totalVal.toFixed(2),
            usedVal.toFixed(2),
            saldoVal.toFixed(2),
            pct,
            status
          ].join(";")
        })
      ].join("\n")

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `relatorio-itens-contrato-${contract.number}.csv`
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
        generateContractItemsReport,
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

