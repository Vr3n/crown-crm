import { autoMap, mappingBlockedReason } from './automap'
import { detectHeaderRow, suggestTableRange } from './parse'
import type {
  BillRun,
  CellRange,
  FieldKey,
  FieldMapping,
  ImportOptions,
  ImportPlan,
  ImportTarget,
  PartyResolution,
  PartyResolutionMap,
  PostingState,
  SheetData,
  WorkbookData
} from './types'
import { DEFAULT_OPTIONS } from './types'

export type ImportStep = 'file' | 'range' | 'map' | 'review' | 'importing' | 'done'

export const STEP_ORDER: ImportStep[] = ['file', 'range', 'map', 'review', 'importing', 'done']

export interface ImportState {
  step: ImportStep
  target: ImportTarget
  file: WorkbookData | null
  sheetName: string | null
  selection: CellRange | null
  headerRow: number | null
  mapping: FieldMapping
  options: ImportOptions
  plan: ImportPlan | null
  partyResolutions: PartyResolutionMap
  posting: PostingState | null
  error: string | null
  sessionId: string
}

export type ImportEvent =
  | { type: 'SET_TARGET'; target: ImportTarget }
  | { type: 'FILE_LOADED'; file: WorkbookData }
  | { type: 'FILE_FAILED'; message: string }
  | { type: 'SELECT_SHEET'; sheetName: string }
  | { type: 'SET_RANGE'; range: CellRange }
  | { type: 'SET_HEADER_ROW'; headerRow: number | null }
  | { type: 'SET_MAPPING'; field: FieldKey; column: number }
  | { type: 'CLEAR_MAPPING'; field: FieldKey }
  | { type: 'SET_OPTION'; key: keyof ImportOptions; value: boolean }
  | { type: 'SET_PLAN'; plan: ImportPlan }
  | { type: 'SET_PARTY_RESOLUTION'; key: string; resolution: PartyResolution }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'BILL_PROGRESS'; key: string; patch: Partial<BillRun> }
  | { type: 'FINISHED' }
  | { type: 'RETRY_FAILED' }
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' }

function newSessionId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID()
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createInitialState(target: ImportTarget = 'PURCHASE'): ImportState {
  return {
    step: 'file',
    target,
    file: null,
    sheetName: null,
    selection: null,
    headerRow: null,
    mapping: {},
    options: { ...DEFAULT_OPTIONS },
    plan: null,
    partyResolutions: {},
    posting: null,
    error: null,
    sessionId: newSessionId()
  }
}

export function activeSheet(state: ImportState): SheetData | null {
  if (!state.file || !state.sheetName) return null
  return state.file.sheets.find((sheet) => sheet.name === state.sheetName) ?? null
}

/** Number of rows below the header inside the selected range. */
export function dataRowCount(state: ImportState): number {
  if (!state.selection || state.headerRow === null) return 0
  return Math.max(0, state.selection.endRow - state.headerRow)
}

/** The reason Continue is disabled, or null when the step can advance. */
export function nextBlockedReason(state: ImportState): string | null {
  if (state.step === 'file') return state.file ? null : 'Choose an Excel file, or try the sample.'
  if (state.step === 'range') {
    if (!state.selection) return 'Select the cells that hold your table.'
    if (state.headerRow === null) return 'Choose the row that holds your column names.'
    if (dataRowCount(state) < 1) return 'Select at least one row below the column names.'
    return null
  }
  if (state.step === 'map') return mappingBlockedReason(state.target, state.mapping)
  if (state.step === 'review') {
    if (!state.plan) return 'Checking the rows.'
    return state.plan.canImport ? null : state.plan.blockingReason
  }
  if (state.step === 'importing') return 'The import is running.'
  return null
}

export function canContinue(state: ImportState): boolean {
  return nextBlockedReason(state) === null
}

function withSheet(state: ImportState, sheetName: string): ImportState {
  if (state.sheetName === sheetName) return state
  const sheet = state.file?.sheets.find((row) => row.name === sheetName)
  if (!sheet) return state
  const range = suggestTableRange(sheet.rows, sheetName, state.target)
  const headerRow = detectHeaderRow(sheet.rows, range, state.target)
  return {
    ...state,
    sheetName,
    selection: range,
    headerRow,
    mapping: {},
    plan: null,
    partyResolutions: {},
    step: 'range'
  }
}

function initialPosting(plan: ImportPlan): PostingState {
  return {
    bills: plan.bills.map((bill) => ({
      key: bill.key,
      label: bill.billNo ?? `Row ${bill.lines[0]?.rowNumber ?? ''}`,
      rowNumbers: bill.lines.map((line) => line.rowNumber),
      status: bill.status === 'ready' ? 'queued' : 'failed',
      error: bill.status === 'blocked' ? 'This bill has errors.' : undefined
    })),
    startedAt: Date.now()
  }
}

export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'SET_TARGET': {
      if (state.step === 'importing') return state
      if (!state.file || !state.sheetName) {
        return { ...createInitialState(event.target), sessionId: state.sessionId }
      }
      const sheet = state.file.sheets.find((row) => row.name === state.sheetName)
      if (!sheet) return { ...createInitialState(event.target), sessionId: state.sessionId }
      const range = suggestTableRange(sheet.rows, sheet.name, event.target)
      return {
        ...state,
        target: event.target,
        selection: range,
        headerRow: detectHeaderRow(sheet.rows, range, event.target),
        mapping: {},
        plan: null,
        partyResolutions: {},
        posting: null,
        error: null,
        step: 'range'
      }
    }

    case 'FILE_LOADED': {
      const first = event.file.sheets[0]
      if (!first) {
        return { ...state, error: 'This workbook has no sheets.' }
      }
      const range = suggestTableRange(first.rows, first.name, state.target)
      return {
        ...state,
        file: event.file,
        sheetName: first.name,
        selection: range,
        headerRow: detectHeaderRow(first.rows, range, state.target),
        mapping: {},
        plan: null,
        partyResolutions: {},
        posting: null,
        error: null,
        step: 'range'
      }
    }

    case 'FILE_FAILED':
      return { ...state, error: event.message, file: null, step: 'file' }

    case 'SELECT_SHEET':
      return withSheet(state, event.sheetName)

    case 'SET_RANGE': {
      if (!state.selection) return state
      const sameSheet = event.range.sheet === state.selection.sheet
      if (!sameSheet) return state
      if (
        state.selection.startRow === event.range.startRow &&
        state.selection.startCol === event.range.startCol &&
        state.selection.endRow === event.range.endRow &&
        state.selection.endCol === event.range.endCol
      ) {
        return state
      }
      const headerInside =
        state.headerRow !== null &&
        state.headerRow >= event.range.startRow &&
        state.headerRow <= event.range.endRow
      return {
        ...state,
        selection: event.range,
        headerRow: headerInside ? state.headerRow : null,
        mapping: {},
        plan: null
      }
    }

    case 'SET_HEADER_ROW': {
      if (!state.selection) return state
      if (event.headerRow === state.headerRow) return state
      if (event.headerRow !== null) {
        if (
          event.headerRow < state.selection.startRow ||
          event.headerRow > state.selection.endRow
        ) {
          return state
        }
      }
      return { ...state, headerRow: event.headerRow, mapping: {}, plan: null }
    }

    case 'SET_MAPPING': {
      const next: FieldMapping = { ...state.mapping }
      for (const [key, column] of Object.entries(next) as [FieldKey, number][]) {
        if (column === event.column && key !== event.field) delete next[key]
      }
      next[event.field] = event.column
      return { ...state, mapping: next, plan: null }
    }

    case 'CLEAR_MAPPING': {
      const next = { ...state.mapping }
      delete next[event.field]
      return { ...state, mapping: next, plan: null }
    }

    case 'SET_OPTION':
      return {
        ...state,
        options: { ...state.options, [event.key]: event.value },
        plan: null
      }

    case 'SET_PLAN':
      return { ...state, plan: event.plan }

    case 'SET_PARTY_RESOLUTION':
      return {
        ...state,
        partyResolutions: { ...state.partyResolutions, [event.key]: event.resolution },
        plan: null
      }

    case 'NEXT': {
      if (!canContinue(state)) return state
      if (state.step === 'file' && state.file && state.sheetName) {
        const sheet = activeSheet(state)
        if (!sheet) return state
        const range = suggestTableRange(sheet.rows, sheet.name, state.target)
        return {
          ...state,
          selection: range,
          headerRow: detectHeaderRow(sheet.rows, range, state.target),
          mapping: {},
          plan: null,
          step: 'range'
        }
      }
      if (state.step === 'range') {
        const sheet = activeSheet(state)
        if (!sheet || !state.selection) return state
        return {
          ...state,
          mapping:
            Object.keys(state.mapping).length > 0
              ? state.mapping
              : autoMap(
                  sheet.rows,
                  state.headerRow,
                  state.selection.startCol,
                  state.selection.endCol,
                  state.target
                ),
          step: 'map'
        }
      }
      if (state.step === 'map') return { ...state, step: 'review' }
      if (state.step === 'review' && state.plan) {
        return { ...state, step: 'importing', posting: initialPosting(state.plan) }
      }
      return state
    }

    case 'BACK': {
      if (state.step === 'range') return { ...state, step: 'file' }
      if (state.step === 'map') return { ...state, step: 'range' }
      if (state.step === 'review') return { ...state, step: 'map' }
      return state
    }

    case 'BILL_PROGRESS': {
      if (!state.posting) return state
      return {
        ...state,
        posting: {
          ...state.posting,
          bills: state.posting.bills.map((bill) =>
            bill.key === event.key ? { ...bill, ...event.patch } : bill
          )
        }
      }
    }

    case 'FINISHED':
      if (!state.posting) return state
      return {
        ...state,
        step: 'done',
        posting: { ...state.posting, finishedAt: Date.now() }
      }

    case 'RETRY_FAILED': {
      if (!state.posting) return state
      const failed = state.posting.bills.filter((bill) => bill.status === 'failed')
      if (failed.length === 0) return state
      return {
        ...state,
        step: 'importing',
        posting: {
          ...state.posting,
          finishedAt: undefined,
          bills: state.posting.bills.map((bill) =>
            bill.status === 'failed'
              ? { ...bill, status: 'queued', error: undefined, errorCode: undefined }
              : bill
          )
        }
      }
    }

    case 'RESET':
      return createInitialState(state.target)

    case 'DISMISS_ERROR':
      return { ...state, error: null }

    default:
      return state
  }
}

/** The index of a step, for the stepper. */
export function stepIndex(step: ImportStep): number {
  return STEP_ORDER.indexOf(step)
}

/** The label the primary button should carry for the current step. */
export function primaryLabel(state: ImportState): string {
  if (state.step === 'file') return state.file ? 'Continue with this file' : 'Choose a file'
  if (state.step === 'range') return 'Map columns'
  if (state.step === 'map') return 'Check rows'
  if (state.step === 'review' && state.plan) {
    const count = state.plan.stats.bills
    return `Import ${count} ${state.target === 'PURCHASE' ? 'purchase bill' : 'sales invoice'}${count === 1 ? '' : 's'}`
  }
  if (state.step === 'importing') return 'Importing'
  return 'Done'
}
