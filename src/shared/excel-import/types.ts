/**
 * The import domain, independent of React and of the spreadsheet library.
 *
 * A workbook is reduced to a plain matrix of cell values before it reaches this
 * module. Everything below works on that matrix, so the same logic can later
 * run in Rust without changing the shape of a plan.
 */

export type ImportTarget = 'PURCHASE' | 'SALES'

/** A cell as the spreadsheet library returns it. Dates stay dates. */
export type CellValue = string | number | boolean | Date | null

export interface SheetData {
  name: string
  /** Rectangular, row 0 is the first row of the sheet. Trailing blanks trimmed. */
  rows: CellValue[][]
  rowCount: number
  colCount: number
}

export interface WorkbookData {
  fileName: string
  sheets: SheetData[]
}

/** Inclusive, zero-based, absolute to the sheet. */
export interface CellRange {
  sheet: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface Selection {
  range: CellRange
  /** Absolute row index of the column names. Null means the sheet has none. */
  headerRow: number | null
}

export type FieldKey =
  | 'billNo'
  | 'date'
  | 'party'
  | 'partyGstin'
  | 'dueDate'
  | 'placeOfSupply'
  | 'narration'
  | 'item'
  | 'description'
  | 'hsn'
  | 'qty'
  | 'uom'
  | 'rate'
  | 'discount'
  | 'gst'

export type FieldGroup = 'bill' | 'line'

export interface FieldDef {
  key: FieldKey
  label: string
  group: FieldGroup
  required: boolean
  /** One sentence a shopkeeper understands, not a column definition. */
  help: string
  /** Header names and abbreviations seen in real files. */
  aliases: string[]
  example: string
}

/** Field key to absolute column index. A missing key is unmapped. */
export type FieldMapping = Partial<Record<FieldKey, number>>

export interface ImportOptions {
  pricesIncludeTax: boolean
  createMissingParties: boolean
  createMissingItems: boolean
}

export const DEFAULT_OPTIONS: ImportOptions = {
  pricesIncludeTax: false,
  createMissingParties: true,
  createMissingItems: false
}

/** A user decision for one distinct party name. */
export type PartyResolution =
  { kind: 'existing'; partyId: number } | { kind: 'create' } | { kind: 'skip' }

export type PartyResolutionMap = Record<string, PartyResolution>

export type IssueSeverity = 'error' | 'warning'

export interface RowIssue {
  /** 1-based Excel row, so the user can find it. */
  rowNumber: number
  field: FieldKey | 'row'
  severity: IssueSeverity
  code: string
  message: string
  fix: string
}

export interface ParsedRow {
  rowNumber: number
  billNo: string | null
  date: string | null
  partyName: string
  partyGstin: string | null
  dueDate: string | null
  placeOfSupply: string | null
  narration: string | null
  itemName: string | null
  description: string
  hsn: string | null
  qtyE4: number
  uom: string | null
  rateMinor: number
  discountBps: number
  gstRateBps: number
  rateIncludesTax: boolean
  issues: RowIssue[]
}

export interface ImportLine {
  rowNumber: number
  itemId: number | null
  /** Set when the item does not exist and the create option is on. */
  newItemKey: string | null
  description: string
  hsn: string | null
  uom: string | null
  qtyE4: number
  rateMinor: number
  discountBps: number
  gstRateBps: number
  rateIncludesTax: boolean
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  totalMinor: number
}

export type PartyAction = 'matched' | 'create' | 'unresolved'

export interface ImportBill {
  /** Stable within one plan; used for the request id and React keys. */
  key: string
  billNo: string | null
  date: string | null
  dueDate: string | null
  partyName: string
  partyGstin: string | null
  partyId: number | null
  partyAction: PartyAction
  placeOfSupply: string | null
  narration: string | null
  lines: ImportLine[]
  issues: RowIssue[]
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  roundOffMinor: number
  totalMinor: number
  status: 'ready' | 'blocked'
}

export interface NewParty {
  key: string
  name: string
  gstin: string | null
}

export interface NewItem {
  key: string
  name: string
  gstRateBps: number
}

export interface ImportStats {
  bills: number
  lines: number
  totalMinor: number
  errors: number
  warnings: number
  readyBills: number
  blockedBills: number
  newParties: number
  newItems: number
  freeTextLines: number
}

export interface ImportPlan {
  target: ImportTarget
  bills: ImportBill[]
  issues: RowIssue[]
  newParties: NewParty[]
  newItems: NewItem[]
  stats: ImportStats
  canImport: boolean
  blockingReason: string | null
}

export type BillRunStatus = 'queued' | 'posting' | 'posted' | 'failed'

export interface BillRun {
  key: string
  label: string
  rowNumbers: number[]
  status: BillRunStatus
  voucherId?: number
  number?: string
  error?: string
  errorCode?: string
}

export interface PostingState {
  bills: BillRun[]
  startedAt: number
  finishedAt?: number
}

export interface ImportResult {
  id: number
  number: string
}
