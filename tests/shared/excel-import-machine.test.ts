import { beforeAll, describe, expect, it } from 'vitest'
import { autoMap } from '../../src/shared/excel-import/automap'
import {
  canContinue,
  createInitialState,
  importReducer,
  nextBlockedReason
} from '../../src/shared/excel-import/machine'
import { detectHeaderRow, suggestTableRange } from '../../src/shared/excel-import/parse'
import { buildPlan } from '../../src/shared/excel-import/plan'
import { DEFAULT_OPTIONS } from '../../src/shared/excel-import/types'
import type { ImportPlan } from '../../src/shared/excel-import/types'
import { createDemoRuntime } from '../../src/renderer/src/features/imports/lib/demo-runtime'
import { sampleWorkbook } from '../../src/renderer/src/features/imports/lib/sample-workbook'
import type { ItemRow, PartyRow } from '../../src/shared/contracts/masters'

let parties: PartyRow[] = []
let items: ItemRow[] = []

beforeAll(async () => {
  const runtime = createDemoRuntime()
  parties = await runtime.listParties()
  items = await runtime.listItems()
})

function purchasePlan(): ImportPlan {
  const sheet = sampleWorkbook().sheets[0]
  const range = suggestTableRange(sheet.rows, sheet.name, 'PURCHASE')
  const headerRow = detectHeaderRow(sheet.rows, range, 'PURCHASE')
  const mapping = autoMap(sheet.rows, headerRow, range.startCol, range.endCol, 'PURCHASE')
  return buildPlan({
    target: 'PURCHASE',
    rows: sheet.rows,
    range,
    headerRow,
    mapping,
    options: DEFAULT_OPTIONS,
    parties,
    items,
    partyResolutions: {},
    companyStateCode: '27',
    roundOffMode: 'INVOICE'
  })
}

describe('import state machine', () => {
  it('walks from a file to a review with the expected guards', () => {
    let state = createInitialState('PURCHASE')
    expect(state.step).toBe('file')
    expect(canContinue(state)).toBe(false)
    expect(nextBlockedReason(state)).toMatch(/Choose an Excel file/)

    state = importReducer(state, { type: 'FILE_LOADED', file: sampleWorkbook() })
    expect(state.step).toBe('range')
    expect(state.headerRow).toBe(3)
    expect(state.selection?.endRow).toBe(14)
    expect(canContinue(state)).toBe(true)

    state = importReducer(state, { type: 'NEXT' })
    expect(state.step).toBe('map')
    expect(state.mapping.billNo).toBe(0)
    expect(canContinue(state)).toBe(true)

    state = importReducer(state, { type: 'NEXT' })
    expect(state.step).toBe('review')
    expect(state.plan).toBeNull()
    expect(canContinue(state)).toBe(false)
    expect(nextBlockedReason(state)).toMatch(/Checking the rows/)

    state = importReducer(state, { type: 'SET_PLAN', plan: purchasePlan() })
    expect(canContinue(state)).toBe(true)

    state = importReducer(state, { type: 'NEXT' })
    expect(state.step).toBe('importing')
    expect(state.posting?.bills).toHaveLength(8)
    expect(state.posting?.bills.every((bill) => bill.status === 'queued')).toBe(true)
  })

  it('blocks a range with no header and a mapping with a missing field', () => {
    let state = importReducer(createInitialState(), {
      type: 'FILE_LOADED',
      file: sampleWorkbook()
    })
    state = importReducer(state, { type: 'SET_HEADER_ROW', headerRow: null })
    expect(canContinue(state)).toBe(false)
    expect(nextBlockedReason(state)).toMatch(/column names/)

    state = importReducer(state, { type: 'SET_HEADER_ROW', headerRow: 3 })
    state = importReducer(state, { type: 'NEXT' })
    state = importReducer(state, { type: 'SET_MAPPING', field: 'date', column: 0 })
    expect(state.mapping.billNo).toBeUndefined()
    expect(state.mapping.date).toBe(0)
  })

  it('keeps a hand-made mapping when the range is not changed', () => {
    let state = importReducer(createInitialState(), {
      type: 'FILE_LOADED',
      file: sampleWorkbook()
    })
    state = importReducer(state, { type: 'NEXT' })
    state = importReducer(state, { type: 'SET_MAPPING', field: 'narration', column: 1 })
    expect(state.mapping.narration).toBe(1)

    state = importReducer(state, { type: 'BACK' })
    state = importReducer(state, { type: 'NEXT' })
    expect(state.mapping.narration).toBe(1)
  })

  it('keeps earlier choices when going back, and resets downstream on a target change', () => {
    let state = importReducer(createInitialState(), {
      type: 'FILE_LOADED',
      file: sampleWorkbook()
    })
    state = importReducer(state, { type: 'NEXT' })
    state = importReducer(state, { type: 'NEXT' })
    expect(state.step).toBe('review')

    state = importReducer(state, { type: 'BACK' })
    expect(state.step).toBe('map')
    expect(state.mapping.billNo).toBe(0)

    state = importReducer(state, { type: 'SET_TARGET', target: 'SALES' })
    expect(state.target).toBe('SALES')
    expect(state.step).toBe('range')
    expect(state.file).not.toBeNull()
    expect(state.mapping).toEqual({})
  })

  it('finishes a run and retries only the failed bills', () => {
    let state = importReducer(createInitialState(), {
      type: 'FILE_LOADED',
      file: sampleWorkbook()
    })
    state = importReducer(state, { type: 'NEXT' })
    state = importReducer(state, { type: 'NEXT' })
    state = importReducer(state, { type: 'SET_PLAN', plan: purchasePlan() })
    state = importReducer(state, { type: 'NEXT' })

    const first = state.posting?.bills[0]
    const second = state.posting?.bills[1]
    if (!first || !second) throw new Error('Expected queued bills')
    state = importReducer(state, {
      type: 'BILL_PROGRESS',
      key: first.key,
      patch: { status: 'posted', voucherId: 1, number: 'PUR/0001' }
    })
    state = importReducer(state, {
      type: 'BILL_PROGRESS',
      key: second.key,
      patch: { status: 'failed', error: 'Duplicate supplier bill.' }
    })
    state = importReducer(state, { type: 'FINISHED' })
    expect(state.step).toBe('done')

    state = importReducer(state, { type: 'RETRY_FAILED' })
    expect(state.step).toBe('importing')
    const retried = state.posting?.bills.find((bill) => bill.key === second.key)
    const kept = state.posting?.bills.find((bill) => bill.key === first.key)
    expect(retried?.status).toBe('queued')
    expect(retried?.error).toBeUndefined()
    expect(kept?.status).toBe('posted')
  })
})
