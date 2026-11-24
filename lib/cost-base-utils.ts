import { type Contract } from "./contracts-provider"

/**
 * Remove acentos de uma string e converte para minúsculas
 */
export function removeAccents(str: string): string {
  if (!str) return ""
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Normaliza o nome da base de custo/secretaria para uma chave canônica de agrupamento e comparação.
 * Ex:
 *   "Secretaria de Educação" -> "educacao"
 *   "SECRETARIA MUNICIPAL DE EDUCAÇÃO" -> "educacao"
 *   "Sec. de Educação" -> "educacao"
 *   "Educação" -> "educacao"
 *   "IPREAB" -> "ipreab"
 *   "ipreab" -> "ipreab"
 */
export function normalizeCostBaseKey(raw: string): string {
  if (!raw) return ""
  let clean = removeAccents(raw)

  // Remove caracteres especiais e pontuações
  clean = clean.replace(/[.\-_/\\,;:()]/g, " ")

  // Remove prefixos comuns de órgãos municipais e secretarias
  clean = clean
    .replace(/\b(secretaria municipal de|secretaria de|sec municipal de|sec mun de|sec de|secretaria|sec|departamento de|depto de|depto|fundo municipal de|fundo de|coordenadoria de|coordenadoria)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  // Se após remover os prefixos sobrou algo válido, retorna; senão usa a string completa limpa
  return clean || removeAccents(raw)
}

/**
 * Formata um nome de exibição amigável e consistente para a base de custo
 */
export function formatCostBaseLabel(label: string): string {
  if (!label) return "Não informada"
  const trimmed = label.trim()

  // Siglas curtas (ex: IPREAB, FMS, FMAS, CEMS, PREFEITURA)
  if (!trimmed.includes(" ") && trimmed.length <= 8 && /^[a-zA-Z]+$/.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  // Capitalização limpa das palavras em português
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((word, idx) => {
      if (["de", "da", "do", "das", "dos", "e", "em", "para"].includes(word) && idx > 0) {
        return word
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

export interface CanonicalCostBase {
  key: string
  label: string
  count: number
}

/**
 * Extrai todas as bases de custo únicas e consolidadas a partir dos contratos
 */
export function getCanonicalCostBases(contracts: Contract[]): CanonicalCostBase[] {
  const groups = new Map<string, { label: string; count: number; rawVariants: string[] }>()

  for (const c of contracts) {
    const raw = (c.costBase || "").trim()
    if (!raw) continue

    const key = normalizeCostBaseKey(raw)
    if (!key) continue

    if (!groups.has(key)) {
      groups.set(key, {
        label: raw,
        count: 1,
        rawVariants: [raw],
      })
    } else {
      const g = groups.get(key)!
      g.count++
      g.rawVariants.push(raw)
      // Prioriza variante com acentos ou com grafia mais completa
      if (raw.length > g.label.length || (/[À-Ú]/.test(raw) && !/[À-Ú]/.test(g.label))) {
        g.label = raw
      }
    }
  }

  return Array.from(groups.entries())
    .map(([key, data]) => ({
      key,
      label: formatCostBaseLabel(data.label),
      count: data.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

/**
 * Compara se a base de custo de um contrato corresponde ao filtro selecionado.
 * Faz a correspondência semântica e por aproximação normalizada.
 */
export function matchCostBase(
  contractBase: string | undefined | null,
  filterValue: string | undefined | null
): boolean {
  if (!filterValue || filterValue === "all" || filterValue === "todas") {
    return true
  }
  if (!contractBase) {
    return false
  }

  const contractKey = normalizeCostBaseKey(contractBase)
  const filterKey = normalizeCostBaseKey(filterValue)

  // 1. Chaves normalizadas exatamente iguais (ex: "ipreab" === "ipreab", "educacao" === "educacao")
  if (contractKey === filterKey) {
    return true
  }

  // 2. Chave do contrato contém a chave do filtro ou vice-versa (ex: "educacao" em "secretaria de educacao e cultura")
  if (contractKey && filterKey && (contractKey.includes(filterKey) || filterKey.includes(contractKey))) {
    return true
  }

  // 3. Fallback de correspondência direta sem acentos
  const rawContract = removeAccents(contractBase)
  const rawFilter = removeAccents(filterValue)
  if (rawContract === rawFilter || rawContract.includes(rawFilter) || rawFilter.includes(rawContract)) {
    return true
  }

  return false
}
