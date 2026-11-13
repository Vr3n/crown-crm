import { fieldsFor, requiredFields } from './fields'
import { cellText, normalizeHeader } from './parse'
import type { CellValue, FieldKey, FieldMapping, ImportTarget } from './types'

function scoreAlias(header: string, aliases: string[]): number {
  const normalized = normalizeHeader(header)
  if (!normalized) return 0
  let best = 0
  for (const alias of aliases) {
    const candidate = normalizeHeader(alias)
    if (!candidate) continue
    if (normalized === candidate) best = Math.max(best, 100)
    else if (normalized.startsWith(candidate)) best = Math.max(best, 80)
    else if (normalized.endsWith(candidate)) best = Math.max(best, 70)
    else if (normalized.includes(candidate)) best = Math.max(best, 50)
  }
  return best
}

/** The field order auto-mapping uses when two fields could claim one column. */
const PRIORITY: FieldKey[] = [
  'date',
  'party',
  'item',
  'description',
  'qty',
  'rate',
  'billNo',
  'gst',
  'hsn',
  'uom',
  'discount',
  'partyGstin',
  'dueDate',
  'placeOfSupply',
  'narration'
]

/**
 * Suggest a column for every field. A column is used once. Required fields and
 * the fields with the strongest header match win first.
 */
export function autoMap(
  rows: CellValue[][],
  headerRow: number | null,
  startCol: number,
  endCol: number,
  target: ImportTarget
): FieldMapping {
  const mapping: FieldMapping = {}
  if (headerRow === null) return mapping

  const header = rows[headerRow] ?? []
  const used = new Set<number>()
  const fields = fieldsFor(target)
  const ordered = [...fields].sort((a, b) => {
    const requiredDelta = Number(b.required) - Number(a.required)
    if (requiredDelta !== 0) return requiredDelta
    return PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key)
  })

  for (const field of ordered) {
    let bestCol: number | null = null
    let bestScore = 0
    for (let col = startCol; col <= endCol; col += 1) {
      if (used.has(col)) continue
      const score = scoreAlias(cellText(header[col]), field.aliases)
      if (score > bestScore) {
        bestScore = score
        bestCol = col
      }
    }
    if (bestCol !== null && bestScore >= 50) {
      mapping[field.key] = bestCol
      used.add(bestCol)
    }
  }

  return mapping
}

/** Required fields with no column. */
export function missingRequiredFields(target: ImportTarget, mapping: FieldMapping): FieldKey[] {
  return requiredFields(target).filter((key) => mapping[key] === undefined)
}

/** Columns claimed by more than one field. */
export function duplicateMappingFields(mapping: FieldMapping): FieldKey[] {
  const seen = new Map<number, FieldKey>()
  const duplicates: FieldKey[] = []
  for (const [key, column] of Object.entries(mapping) as [FieldKey, number][]) {
    if (column === undefined) continue
    const previous = seen.get(column)
    if (previous) duplicates.push(key)
    else seen.set(column, key)
  }
  return duplicates
}

/** A line needs an item or a description, and either can be the other. */
export function missingLineIdentity(mapping: FieldMapping): boolean {
  return mapping.item === undefined && mapping.description === undefined
}

export function mappingIsComplete(target: ImportTarget, mapping: FieldMapping): boolean {
  return (
    missingRequiredFields(target, mapping).length === 0 &&
    duplicateMappingFields(mapping).length === 0 &&
    !missingLineIdentity(mapping)
  )
}

/** A short reason for the disabled Continue button, or null when ready. */
export function mappingBlockedReason(target: ImportTarget, mapping: FieldMapping): string | null {
  if (missingLineIdentity(mapping)) return 'Choose a column for Item or Description.'
  const missing = missingRequiredFields(target, mapping)
  if (missing.length > 0) {
    const labels = fieldsFor(target)
      .filter((field) => missing.includes(field.key))
      .map((field) => field.label)
    return `Choose a column for ${labels.join(', ')}.`
  }
  if (duplicateMappingFields(mapping).length > 0)
    return 'A column is used twice. Give each field its own column.'
  return null
}
