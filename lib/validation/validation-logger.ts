export type ValidationLevel = "error" | "warning" | "info"
export type ValidationDataType = "contracts" | "suppliers" | "products" | "orders" | "users" | "costBases"
export type ValidationAction = "create" | "update" | "delete" | "import" | "export" | "load" | "addAddendum" | "editAddendum" | "deleteAddendum"

export interface ValidationError {
  field: string
  message: string
  value?: string
  suggestion?: string
}

export interface ValidationReport {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

export interface ValidationLog {
  id: string
  timestamp: string
  level: ValidationLevel
  dataType: ValidationDataType
  action: ValidationAction
  report: ValidationReport
  message: string
  userId?: string
  metadata?: Record<string, unknown>
}

export class ValidationLogger {
  private static readonly STORAGE_KEY = "validation_logs"
  private static readonly MAX_LOGS = 1000

  static log(
    level: ValidationLevel,
    dataType: ValidationDataType,
    action: ValidationAction,
    report: ValidationReport,
    message: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const log: ValidationLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      dataType,
      action,
      report,
      message,
      userId,
      metadata,
    }

    try {
      const logs = this.getLogs()
      logs.unshift(log)

      // Manter apenas os últimos MAX_LOGS registros
      if (logs.length > this.MAX_LOGS) {
        logs.splice(this.MAX_LOGS)
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs))

      // Log no console em desenvolvimento
      if (process.env.NODE_ENV === "development") {
        const emoji = level === "error" ? "❌" : level === "warning" ? "⚠️" : "ℹ️"
        console.log(`${emoji} [${dataType}] ${action}: ${message}`)
        if (report?.errors?.length > 0) {
          console.error("Erros:", report.errors)
        }
        if (report?.warnings?.length > 0) {
          console.warn("Avisos:", report.warnings)
        }
      }
    } catch (error) {
      console.error("Erro ao salvar log de validação:", error)
    }
  }

  static getLogs(filters?: {
    level?: ValidationLevel
    dataType?: ValidationDataType
    action?: ValidationAction
    startDate?: Date
    endDate?: Date
  }): ValidationLog[] {
    try {
      const logsJson = localStorage.getItem(this.STORAGE_KEY)
      if (!logsJson) return []

      let logs: ValidationLog[] = JSON.parse(logsJson)

      // Aplicar filtros
      if (filters) {
        if (filters.level) {
          logs = logs.filter((log) => log.level === filters.level)
        }
        if (filters.dataType) {
          logs = logs.filter((log) => log.dataType === filters.dataType)
        }
        if (filters.action) {
          logs = logs.filter((log) => log.action === filters.action)
        }
        if (filters.startDate) {
          logs = logs.filter((log) => new Date(log.timestamp) >= filters.startDate!)
        }
        if (filters.endDate) {
          logs = logs.filter((log) => new Date(log.timestamp) <= filters.endDate!)
        }
      }

      return logs
    } catch (error) {
      console.error("Erro ao carregar logs:", error)
      return []
    }
  }

  static clearLogs(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error("Erro ao limpar logs:", error)
    }
  }

  static getLogStats(): {
    total: number
    byLevel: Record<ValidationLevel, number>
    byDataType: Record<ValidationDataType, number>
    byAction: Record<ValidationAction, number>
  } {
    const logs = this.getLogs()

    const stats = {
      total: logs.length,
      byLevel: {} as Record<ValidationLevel, number>,
      byDataType: {} as Record<ValidationDataType, number>,
      byAction: {} as Record<ValidationAction, number>,
    }

    logs.forEach((log) => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1
      stats.byDataType[log.dataType] = (stats.byDataType[log.dataType] || 0) + 1
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1
    })

    return stats
  }

  static exportLogsAsCSV(): string {
    const logs = this.getLogs()
    const headers = ["ID", "Timestamp", "Level", "Data Type", "Action", "Valid", "Errors", "Warnings", "Message"]
    const rows = logs.map((log) => [
      log.id,
      log.timestamp,
      log.level,
      log.dataType,
      log.action,
      log.report.valid ? "Sim" : "Não",
      log.report.errors?.length?.toString() || "0",
      log.report.warnings?.length?.toString() || "0",
      log.message,
    ])

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")

    return csvContent
  }

  static exportLogsAsJSON(): string {
    const logs = this.getLogs()
    return JSON.stringify(logs, null, 2)
  }
}
