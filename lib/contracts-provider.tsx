"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { ValidationLogger } from "./validation/validation-logger"
import { validateObject, contractSchema } from "./validation/schemas"
import {
  isFirebaseConfigured,
  getAllDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  COLLECTIONS,
} from "./firebase"
import { addContractAdjustment } from "./contract-adjustments"

export type ContractPeriod = {
  id: string
  addendumId?: string
  addendumNumber?: string
  name: string
  startDate: string
  expirationDate: string
  value: number
  usedValue: number
  usedPercentage: number
  items: ContractItem[]
  createdAt: string
  description?: string
}

export type Contract = {
  id: string
  number: string
  company: string
  value: number
  usedValue: number
  usedPercentage: number
  expirationDate: string
  startDate: string
  costBase: string
  description: string
  items: ContractItem[]
  status: "ativo" | "expirado" | "vencido" | "cancelado"
  supplierId?: string
  productIds?: string[]
  driveLink?: string // Link do Google Drive para o documento original
  extractedContent?: string // Texto extraido de documentos Word/PDF importados
  createdAt?: string
  updatedAt?: string
  administrativeProcess?: string
  electronicAuction?: string
  cnpj?: string
  contractingParty?: string
  totalValue?: number
  signatureDate?: string
  validityMonths?: number
  balanceAdjustments?: BalanceAdjustment[]
  addendums?: ContractAddendum[]
  previousPeriods?: ContractPeriod[]
  activePeriodId?: string
}

export type ContractItem = {
  id: string
  name: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  usedQuantity: number
}

export type BalanceAdjustment = {
  id: string
  amount: number
  description: string
  date: string
  createdAt?: string
}

export type ContractAddendum = {
  id: string
  number: string
  type: "vencimento" | "valor" | "produto" | "quantidade" | "outros"
  originalValue?: any
  newValue?: any
  description: string
  date: string
  createdAt?: string
  resetBalance?: boolean
  rebalancePercent?: number
  updatedItems?: ContractItem[]
}

type ContractsContextType = {
  contracts: Contract[]
  isLoading: boolean
  addContract: (contract: Omit<Contract, "id" | "usedValue" | "usedPercentage">) => Promise<boolean>
  updateContract: (id: string, contract: Partial<Contract>) => Promise<boolean>
  deleteContract: (id: string) => Promise<boolean>
  getContractById: (id: string) => Contract | undefined
  updateContractUsage: (id: string, value: number) => void
  updateContractItemUsage: (contractId: string, itemId: string, quantity: number) => void
  recalculateContractBalances: (ordersList: any[]) => void
  addBalanceAdjustment: (contractId: string, adjustment: Omit<BalanceAdjustment, "id" | "createdAt">) => Promise<boolean>
  addAddendum: (contractId: string, addendum: Omit<ContractAddendum, "id" | "createdAt">) => Promise<boolean>
  exportData: () => void
  importData: (data: Contract[]) => Promise<boolean>
}

const ContractsContext = createContext<ContractsContextType | undefined>(undefined)

// Função para transformar dados do Firebase para a estrutura esperada
const transformFirebaseContract = (data: any): Contract => {
  const totalValue = Number(data.valor_total_contrato || data.value || 0)
  const rawUsedValue = Number(data.valor_utilizado || data.usedValue || 0)
  // Garantir que valor utilizado legado do banco não venha negativo por erro de sinal
  const usedValue = rawUsedValue < 0 ? Math.abs(rawUsedValue) : rawUsedValue
  const usedPercentage = totalValue > 0 ? Math.round((usedValue / totalValue) * 100) : 0

  // Função auxiliar para converter strings de data para ISO string válido
  const parseDate = (dateValue: any): string => {
    if (!dateValue) return new Date().toISOString()
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue)
      return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
    }
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? new Date().toISOString() : dateValue.toISOString()
    }
    return new Date().toISOString()
  }

  // Função auxiliar para normalizar status
  const parseStatus = (statusValue: any): "ativo" | "expirado" | "vencido" | "cancelado" => {
    if (!statusValue) return "ativo"
    const normalized = String(statusValue).toLowerCase().trim()
    if (normalized.includes("ativo") || normalized.includes("active")) return "ativo"
    if (normalized.includes("vencido")) return "vencido"
    if (normalized.includes("expirado") || normalized.includes("expired")) return "expirado"
    if (normalized.includes("cancelado") || normalized.includes("cancelled") || normalized.includes("cancelada")) return "cancelado"
    return "ativo"
  }

  // Mapear items - procurar por ambas as chaves (items em inglês ou itens em português)
  const rawItems = data.items || data.itens || []
  const transformedItems = Array.isArray(rawItems) ? 
    rawItems.map((item: any) => ({
      id: item.id || "",
      name: item.name || "Sem nome",
      description: item.description || "Sem descrição",
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      usedQuantity: Number(item.usedQuantity) || 0,
    })) : []

  // Converter data de vencimento
  const expirationDate = parseDate(data.data_vencimento || data.expirationDate)
  
  // Verificar se o contrato está vencido
  let finalStatus = parseStatus(data.status || data.situacao || "ativo")
  const now = new Date()
  const expDate = new Date(expirationDate)
  
  // Se a data de vencimento passou e o status é "ativo", mude para "vencido"
  if (finalStatus === "ativo" && expDate <= now) {
    finalStatus = "vencido"
  }

  return {
    id: data.id || "",
    number: data.numero || data.number || "Não informado",
    company: data.fornecedor?.razao_social || data.company || "Não informado",
    value: totalValue,
    usedValue: usedValue,
    usedPercentage: usedPercentage,
    expirationDate: expirationDate,
    startDate: parseDate(data.data_assinatura || data.startDate),
    costBase: data.base_custo || data.costBase || "Não informado",
    description: data.descricao || data.description || "",
    items: transformedItems,
    status: finalStatus,
    supplierId: data.fornecedor?.id || data.supplierId,
    driveLink: data.driveLink || "",
    extractedContent: data.extractedContent || "",
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    administrativeProcess: data.processo_administrativo || data.administrativeProcess || "",
    electronicAuction: data.pregao_eletronico || data.electronicAuction || "",
    cnpj: data.fornecedor?.cnpj || data.cnpj || "",
    contractingParty: data.contratante || data.contractingParty || "",
    totalValue: totalValue,
    signatureDate: data.data_assinatura || data.signatureDate || "",
    validityMonths: data.vigencia_meses || data.validityMonths || 0,
    addendums: data.addendums || [],
    previousPeriods: data.previousPeriods || [],
    activePeriodId: data.activePeriodId || undefined,
  }
}

export function ContractsProvider({ children }: { children: ReactNode }) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadFromFirestore()
  }, [])

  // Verificar e atualizar status de contratos vencidos periodicamente
  useEffect(() => {
    if (contracts.length === 0) return

    const checkExpiredContracts = async () => {
      const now = new Date()
      let hasChanges = false
      const contractsToUpdate: { id: string; contract: Contract }[] = []

      const updatedContracts = contracts.map((contract) => {
        // Se o contrato está ativo e já passou da data de vencimento
        if (contract.status === "ativo") {
          const expirationDate = new Date(contract.expirationDate)
          if (expirationDate <= now && contract.status !== "vencido") {
            hasChanges = true
            const updatedContract = { ...contract, status: "vencido" as const }
            contractsToUpdate.push({ id: contract.id, contract: updatedContract })
            return updatedContract
          }
        }
        return contract
      })

      // Atualizar apenas se houve mudanças
      if (hasChanges) {
        setContracts(updatedContracts)
        console.log(`${contractsToUpdate.length} contrato(s) foram marcados como vencido(s) automaticamente`)

        // Salvar as mudanças no Firebase
        const isConfigured = isFirebaseConfigured()
        if (isConfigured) {
          try {
            for (const { id, contract } of contractsToUpdate) {
              await updateDocument(COLLECTIONS.CONTRACTS, id, { status: "vencido" })
            }
            console.log("Alterações de status salvas no Firebase")
          } catch (error) {
            console.error("Erro ao salvar alterações no Firebase:", error)
          }
        }
      }
    }

    // Verificar imediatamente ao carregar
    checkExpiredContracts()

    // Verificar a cada 5 minutos
    const intervalId = setInterval(checkExpiredContracts, 5 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [contracts])

  const loadFromFirestore = async () => {
    try {
      setIsLoading(true)
      const isConfigured = isFirebaseConfigured()
      
      if (!isConfigured) {
        console.error("Firebase não está configurado. Verifique as variáveis de ambiente.")
        ValidationLogger.log(
          "error",
          "contracts",
          "load",
          { valid: false, errors: [{ field: "firebase", message: "Firebase não configurado" }], warnings: [] },
          "Firebase não está configurado",
          undefined,
          { configured: false }
        )
        setIsLoading(false)
        return
      }

      const firebaseContracts = await getAllDocuments<any>(COLLECTIONS.CONTRACTS)
      console.log(`Contratos carregados do Firebase: ${firebaseContracts.length}`, firebaseContracts)
      
      const transformedContracts = firebaseContracts.map(transformFirebaseContract)
      console.log(`Contratos transformados: ${transformedContracts.length}`, transformedContracts)
      
      // Log detalhado de cada contrato com seus items
      transformedContracts.forEach((contract) => {
        console.log(`[${contract.number}] Items carregados: ${contract.items.length}`, contract.items)
      })
      
      setContracts(transformedContracts)
      ValidationLogger.log(
        "info",
        "contracts",
        "load",
        { valid: true, errors: [], warnings: [] },
        `${transformedContracts.length} contratos carregados e transformados do Firebase`,
        undefined,
        { count: transformedContracts.length, source: "firebase" }
      )
    } catch (error) {
      console.error("Erro ao carregar contratos:", error)
      ValidationLogger.log(
        "error",
        "contracts",
        "load",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao carregar contratos",
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setIsLoading(false)
    }
  }

  const addContract = async (contract: Omit<Contract, "id" | "usedValue" | "usedPercentage">): Promise<boolean> => {
    try {
      const localId = `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const newContract: Contract = {
        ...contract,
        id: localId,
        usedValue: 0,
        usedPercentage: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const validation = validateObject(newContract, contractSchema)
      if (!validation.valid) {
        ValidationLogger.log(
          "error",
          "contracts",
          "create",
          { valid: false, errors: validation.errors, warnings: [] },
          "Validação falhou ao criar contrato",
          undefined,
          { errors: validation.errors }
        )
        return false
      }

      // Save to Firebase if configured
      if (isFirebaseConfigured()) {
        const { id, ...contractData } = newContract
        // Remove undefined fields to prevent Firebase errors
        const cleanedData = Object.fromEntries(
          Object.entries(contractData).filter(([, value]) => value !== undefined)
        )
        const firebaseId = await addDocument(COLLECTIONS.CONTRACTS, cleanedData)
        if (firebaseId) {
          newContract.id = firebaseId
        } else {
          // Firebase save failed
          ValidationLogger.log(
            "error",
            "contracts",
            "create",
            { valid: false, errors: [{ field: "firebase", message: "Falha ao salvar contrato no Firebase" }], warnings: [] },
            "Falha ao salvar contrato no Firebase",
            undefined,
            { number: newContract.number }
          )
          return false
        }
      }

      setContracts((prev) => [...prev, newContract])

      ValidationLogger.log(
        "info",
        "contracts",
        "create",
        { valid: true, errors: [], warnings: [] },
        `Contrato "${newContract.number}" criado com sucesso`,
        undefined,
        { id: newContract.id, number: newContract.number, firebase: isFirebaseConfigured() }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "create",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao criar contrato",
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      )
      return false
    }
  }

  const updateContract = async (id: string, contractUpdate: Partial<Contract>): Promise<boolean> => {
    try {
      const index = contracts.findIndex((c) => c.id === id)
      if (index === -1) {
        ValidationLogger.log(
          "error",
          "contracts",
          "update",
          { valid: false, errors: [{ field: "", message: "Contrato não encontrado" }], warnings: [] },
          "Contrato não encontrado",
          undefined,
          { id }
        )
        return false
      }

      const updatedContract = { 
        ...contracts[index], 
        ...contractUpdate,
        updatedAt: new Date().toISOString(),
      }

      // Update in Firebase if configured
      if (isFirebaseConfigured()) {
        const { id: contractId, ...contractData } = updatedContract
        // Remove undefined fields to prevent Firebase errors
        const cleanedData = Object.fromEntries(
          Object.entries(contractData).filter(([, value]) => value !== undefined)
        )
        const success = await updateDocument(COLLECTIONS.CONTRACTS, id, cleanedData)
        if (!success) {
          ValidationLogger.log(
            "error",
            "contracts",
            "update",
            { valid: false, errors: [{ field: "firebase", message: "Falha ao atualizar contrato no Firebase" }], warnings: [] },
            "Falha ao atualizar contrato no Firebase",
            undefined,
            { id, number: updatedContract.number }
          )
          return false
        }
      }

      setContracts((prev) => prev.map((contract) => (contract.id === id ? updatedContract : contract)))

      ValidationLogger.log(
        "info",
        "contracts",
        "update",
        { valid: true, errors: [], warnings: [] },
        `Contrato "${updatedContract.number}" atualizado com sucesso`,
        undefined,
        { id, number: updatedContract.number, firebase: isFirebaseConfigured() }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "update",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao atualizar contrato",
        undefined,
        { error: error instanceof Error ? error.message : String(error), id }
      )
      return false
    }
  }

  const deleteContract = async (id: string): Promise<boolean> => {
    try {
      const contract = contracts.find((c) => c.id === id)
      if (!contract) {
        ValidationLogger.log(
          "error",
          "contracts",
          "delete",
          { valid: false, errors: [{ field: "", message: "Contrato não encontrado" }], warnings: [] },
          "Contrato não encontrado",
          undefined,
          { id }
        )
        return false
      }

      // Delete from Firebase if configured
      if (isFirebaseConfigured()) {
        const success = await deleteDocument(COLLECTIONS.CONTRACTS, id)
        if (!success) {
          ValidationLogger.log(
            "error",
            "contracts",
            "delete",
            { valid: false, errors: [{ field: "firebase", message: "Falha ao excluir contrato no Firebase" }], warnings: [] },
            "Falha ao excluir contrato no Firebase",
            undefined,
            { id, number: contract.number }
          )
          return false
        }
      }

      setContracts((prev) => prev.filter((c) => c.id !== id))

      ValidationLogger.log(
        "info",
        "contracts",
        "delete",
        { valid: true, errors: [], warnings: [] },
        `Contrato "${contract.number}" excluído com sucesso`,
        undefined,
        { id, number: contract.number, firebase: isFirebaseConfigured() }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "delete",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao excluir contrato",
        undefined,
        { error: error instanceof Error ? error.message : String(error), id }
      )
      return false
    }
  }

  const getContractById = (id: string) => {
    return contracts.find((contract) => contract.id === id)
  }

  const updateContractUsage = (id: string, value: number) => {
    setContracts((prev) =>
      prev.map((contract) => {
        if (contract.id === id) {
          const newUsedValue = contract.usedValue + value
          const newUsedPercentage = contract.value > 0 ? Math.round((newUsedValue / contract.value) * 100) : 0

          // Salvar no Firebase
          if (isFirebaseConfigured()) {
            updateDocument(COLLECTIONS.CONTRACTS, id, {
              valor_utilizado: newUsedValue,
              usedValue: newUsedValue,
            })
          }

          return {
            ...contract,
            usedValue: newUsedValue,
            usedPercentage: newUsedPercentage,
          }
        }
        return contract
      }),
    )
  }

  const updateContractItemUsage = (contractId: string, itemId: string, quantity: number) => {
    setContracts((prev) =>
      prev.map((contract) => {
        if (contract.id === contractId) {
          const updatedItems = contract.items.map((item) => {
            if (item.id === itemId) {
              return {
                ...item,
                usedQuantity: item.usedQuantity + quantity,
              }
            }
            return item
          })

          // Salvar no Firebase
          if (isFirebaseConfigured()) {
            updateDocument(COLLECTIONS.CONTRACTS, contractId, {
              itens: updatedItems,
              items: updatedItems,
            })
          }

          return {
            ...contract,
            items: updatedItems,
          }
        }
        return contract
      }),
    )
  }

  const recalculateContractBalances = (ordersList: any[]) => {
    if (!ordersList || !Array.isArray(ordersList)) return

    setContracts((prevContracts) => {
      let changed = false
      const updated = prevContracts.map((contract) => {
        // Pedidos ativos para o período vigente atual (sem periodId ou com periodId coincidente com activePeriodId)
        const activeOrders = ordersList.filter(
          (o) => o.contractId === contract.id && o.status !== "cancelado" && (!o.periodId || o.periodId === contract.activePeriodId)
        )

        const ordersTotal = activeOrders.reduce((sum, o) => sum + Number(o.totalValue || 0), 0)
        const adjustmentsTotal = (contract.balanceAdjustments || []).reduce((sum, a) => sum + Number(a.amount || 0), 0)
        const realUsedValue = Math.max(0, ordersTotal + adjustmentsTotal)
        const newUsedPercentage = contract.value > 0 ? Math.round((realUsedValue / contract.value) * 100) : 0

        const updatedItems = contract.items.map((item) => {
          const itemUsedQty = activeOrders.reduce((sum, o) => {
            const orderItem = (o.items || []).find((i: any) => i.contractItemId === item.id || i.id === item.id)
            return sum + (orderItem ? Number(orderItem.quantity) || 0 : 0)
          }, 0)

          return {
            ...item,
            usedQuantity: itemUsedQty,
          }
        })

        // Recalcular períodos anteriores se existirem
        let updatedPreviousPeriods = contract.previousPeriods
        if (contract.previousPeriods && contract.previousPeriods.length > 0) {
          updatedPreviousPeriods = contract.previousPeriods.map((period) => {
            const periodOrders = ordersList.filter(
              (o) => o.contractId === contract.id && o.status !== "cancelado" && o.periodId === period.id
            )
            const periodOrdersTotal = periodOrders.reduce((sum, o) => sum + Number(o.totalValue || 0), 0)
            const periodUsedPercentage = period.value > 0 ? Math.round((periodOrdersTotal / period.value) * 100) : 0
            const periodItems = period.items.map((pItem) => {
              const pItemUsedQty = periodOrders.reduce((sum, o) => {
                const orderItem = (o.items || []).find((i: any) => i.contractItemId === pItem.id || i.id === pItem.id)
                return sum + (orderItem ? Number(orderItem.quantity) || 0 : 0)
              }, 0)
              return { ...pItem, usedQuantity: pItemUsedQty }
            })
            return {
              ...period,
              usedValue: periodOrdersTotal,
              usedPercentage: periodUsedPercentage,
              items: periodItems,
            }
          })
        }

        const hasValueChanged = contract.usedValue !== realUsedValue || contract.usedPercentage !== newUsedPercentage
        const hasItemsChanged = contract.items.some((item, idx) => item.usedQuantity !== updatedItems[idx]?.usedQuantity)
        const hasPeriodsChanged = JSON.stringify(contract.previousPeriods) !== JSON.stringify(updatedPreviousPeriods)

        if (!hasValueChanged && !hasItemsChanged && !hasPeriodsChanged) {
          return contract
        }

        changed = true
        const updatedContract = {
          ...contract,
          usedValue: realUsedValue,
          usedPercentage: newUsedPercentage,
          items: updatedItems,
          previousPeriods: updatedPreviousPeriods,
        }

        if (isFirebaseConfigured()) {
          updateDocument(COLLECTIONS.CONTRACTS, contract.id, {
            valor_utilizado: realUsedValue,
            usedValue: realUsedValue,
            itens: updatedItems,
            items: updatedItems,
            ...(updatedPreviousPeriods && { previousPeriods: updatedPreviousPeriods }),
          })
        }

        return updatedContract
      })

      return changed ? updated : prevContracts
    })
  }

  const addBalanceAdjustment = async (
    contractId: string,
    adjustment: Omit<BalanceAdjustment, "id" | "createdAt">
  ): Promise<boolean> => {
    try {
      const contract = contracts.find((c) => c.id === contractId)
      if (!contract) {
        ValidationLogger.log(
          "error",
          "contracts",
          "addBalanceAdjustment",
          { valid: false, errors: [{ field: "", message: "Contrato não encontrado" }], warnings: [] },
          "Contrato não encontrado",
          undefined,
          { contractId }
        )
        return false
      }

      // Salva ajuste como subcoleção no Firebase
      if (isFirebaseConfigured()) {
        await addContractAdjustment(contractId, adjustment)
      }

      const newAdjustment: BalanceAdjustment = {
        ...adjustment,
        id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
      }

      const updatedBalanceAdjustments = [...(contract.balanceAdjustments || []), newAdjustment]
      const newUsedValue = contract.usedValue + adjustment.amount
      const newUsedPercentage = Math.round((newUsedValue / contract.value) * 100)

      const updatedContract = {
        ...contract,
        balanceAdjustments: updatedBalanceAdjustments,
        usedValue: newUsedValue,
        usedPercentage: newUsedPercentage,
      }

      // Atualiza saldo do contrato no documento principal
      if (isFirebaseConfigured()) {
        await updateDocument(COLLECTIONS.CONTRACTS, contractId, {
          valor_utilizado: newUsedValue,
          usedValue: newUsedValue,
        })
      }

      setContracts((prev) =>
        prev.map((c) => (c.id === contractId ? updatedContract : c))
      )

      ValidationLogger.log(
        "info",
        "contracts",
        "addBalanceAdjustment",
        { valid: true, errors: [], warnings: [] },
        `Ajuste de saldo adicionado ao contrato "${contract.number}"`,
        undefined,
        { contractId, amount: adjustment.amount, description: adjustment.description }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "addBalanceAdjustment",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao adicionar ajuste de saldo",
        undefined,
        { error: error instanceof Error ? error.message : String(error), contractId }
      )
      return false
    }
  }

  const addAddendum = async (
    contractId: string,
    addendum: Omit<ContractAddendum, "id" | "createdAt">
  ): Promise<boolean> => {
    try {
      const contract = contracts.find((c) => c.id === contractId)
      if (!contract) {
        ValidationLogger.log(
          "error",
          "contracts",
          "addAddendum",
          { valid: false, errors: [{ field: "", message: "Contrato não encontrado" }], warnings: [] },
          "Contrato não encontrado",
          undefined,
          { contractId }
        )
        return false
      }

      const newAddendum: ContractAddendum = {
        ...addendum,
        id: `adit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
      }

      const updatedAddendums = [...(contract.addendums || []), newAddendum]
      
      const shouldResetBalance = Boolean(addendum.resetBalance)
      let updatedPreviousPeriods = contract.previousPeriods ? [...contract.previousPeriods] : []
      let updatedItems = [...(contract.items || [])]
      let updatedValue = contract.value
      let updatedUsedValue = contract.usedValue
      let updatedUsedPercentage = contract.usedPercentage
      let newExpirationDate = contract.expirationDate
      let activePeriodId = contract.activePeriodId

      if (shouldResetBalance) {
        const closedPeriodId = `period_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const periodCount = (contract.previousPeriods?.length || 0) + 1
        
        const closedPeriod: ContractPeriod = {
          id: closedPeriodId,
          addendumId: newAddendum.id,
          addendumNumber: newAddendum.number,
          name: periodCount === 1 ? `Vigência Inicial (até ${new Date(contract.expirationDate).toLocaleDateString('pt-BR')})` : `${periodCount - 1}ª Vigência Aditivada`,
          startDate: contract.startDate,
          expirationDate: contract.expirationDate,
          value: contract.value,
          usedValue: contract.usedValue,
          usedPercentage: contract.usedPercentage,
          items: contract.items.map((i) => ({ ...i })),
          createdAt: new Date().toISOString(),
          description: addendum.description,
        }

        updatedPreviousPeriods.push(closedPeriod)
        updatedUsedValue = 0
        updatedUsedPercentage = 0
        activePeriodId = `active_${Date.now()}`
      }

      if (addendum.type === "vencimento" && addendum.newValue) {
        newExpirationDate = addendum.newValue
      } else if (addendum.type === "valor" && addendum.newValue) {
        const newValue = typeof addendum.newValue === "string" ? parseFloat(addendum.newValue) : addendum.newValue
        updatedValue = newValue
      } else if (addendum.type === "produto" && Array.isArray(addendum.newValue)) {
        updatedItems = [...updatedItems, ...addendum.newValue]
      }

      // Tratar Reequilíbrio de Preço se informado no aditivo
      if (addendum.updatedItems && Array.isArray(addendum.updatedItems)) {
        updatedItems = addendum.updatedItems.map((item) => ({
          ...item,
          usedQuantity: shouldResetBalance ? 0 : item.usedQuantity,
        }))
        updatedValue = updatedItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
      } else if (addendum.rebalancePercent && addendum.rebalancePercent > 0) {
        const factor = 1 + addendum.rebalancePercent / 100
        updatedItems = updatedItems.map((item) => {
          const newUnitPrice = Number((item.unitPrice * factor).toFixed(2))
          const newTotalPrice = Number((newUnitPrice * item.quantity).toFixed(2))
          return {
            ...item,
            unitPrice: newUnitPrice,
            totalPrice: newTotalPrice,
            usedQuantity: shouldResetBalance ? 0 : item.usedQuantity,
          }
        })
        updatedValue = updatedItems.reduce((sum, item) => sum + item.totalPrice, 0)
      } else if (shouldResetBalance) {
        // Resetar consumos apenas se a flag de reset de saldo foi ativada
        updatedItems = updatedItems.map((item) => ({
          ...item,
          usedQuantity: 0,
        }))
      }

      if (!shouldResetBalance && updatedValue > 0) {
        updatedUsedPercentage = Math.round((updatedUsedValue / updatedValue) * 100)
      }

      const updatedContract: Contract = {
        ...contract,
        addendums: updatedAddendums,
        previousPeriods: updatedPreviousPeriods,
        expirationDate: newExpirationDate,
        value: updatedValue,
        usedValue: updatedUsedValue,
        usedPercentage: updatedUsedPercentage,
        items: updatedItems,
        activePeriodId,
      }

      // Salvar no Firebase
      if (isFirebaseConfigured()) {
        const dataToUpdate = {
          addendums: updatedAddendums,
          previousPeriods: updatedPreviousPeriods,
          activePeriodId,
          data_vencimento: newExpirationDate,
          expirationDate: newExpirationDate,
          valor_total_contrato: updatedValue,
          value: updatedValue,
          valor_utilizado: updatedUsedValue,
          usedValue: updatedUsedValue,
          usedPercentage: updatedUsedPercentage,
          items: updatedItems,
          itens: updatedItems,
        }
        await updateDocument(COLLECTIONS.CONTRACTS, contractId, dataToUpdate)
      }

      setContracts((prev) =>
        prev.map((c) => (c.id === contractId ? updatedContract : c))
      )

      ValidationLogger.log(
        "info",
        "contracts",
        "addAddendum",
        { valid: true, errors: [], warnings: [] },
        `Aditivo de ${addendum.type} adicionado ao contrato "${contract.number}"`,
        undefined,
        { contractId, type: addendum.type, description: addendum.description }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "addAddendum",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao adicionar aditivo",
        undefined,
        { error: error instanceof Error ? error.message : String(error), contractId }
      )
      return false
    }
  }

  const exportData = () => {
    try {
      const dataStr = JSON.stringify(contracts, null, 2)
      const dataBlob = new Blob([dataStr], { type: "application/json" })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = `contratos-${new Date().toISOString().split("T")[0]}.json`
      link.click()
      URL.revokeObjectURL(url)

      ValidationLogger.log(
        "info",
        "contracts",
        "export",
        { valid: true, errors: [], warnings: [] },
        `${contracts.length} contratos exportados com sucesso`,
        undefined,
        { count: contracts.length }
      )
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "export",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao exportar contratos",
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  const importData = async (data: Contract[]): Promise<boolean> => {
    try {
      setContracts(data)

      ValidationLogger.log(
        "info",
        "contracts",
        "import",
        { valid: true, errors: [], warnings: [] },
        `${data.length} contratos importados com sucesso`,
        undefined,
        { count: data.length }
      )

      return true
    } catch (error) {
      ValidationLogger.log(
        "error",
        "contracts",
        "import",
        { valid: false, errors: [{ field: "", message: error instanceof Error ? error.message : String(error) }], warnings: [] },
        "Erro ao importar contratos",
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      )
      return false
    }
  }

  return (
    <ContractsContext.Provider
      value={{
        contracts,
        isLoading,
        addContract,
        updateContract,
        deleteContract,
        getContractById,
        updateContractUsage,
        updateContractItemUsage,
        recalculateContractBalances,
        addBalanceAdjustment,
        addAddendum,
        exportData,
        importData,
      }}
    >
      {children}
    </ContractsContext.Provider>
  )
}

export function useContracts() {
  const context = useContext(ContractsContext)
  if (context === undefined) {
    throw new Error("useContracts deve ser usado dentro de um ContractsProvider")
  }
  return context
}
