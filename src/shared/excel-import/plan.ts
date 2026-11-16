import type { ItemRow, PartyRow } from '../contracts/masters'
import type { PostVoucherInput } from '../contracts/vouchers'
import { applyBps, roundHalfUpDiv, splitInclusivePrice } from '../price'
import { autoMap } from './automap'
import {
  cellText,
  isBlankRow,
  normalizePartyName,
  parseDateCell,
  parseMoneyMinor,
  parsePercentCell,
  parseQuantityE4,
  parseStateCode
} from './parse'
import type {
  CellRange,
  CellValue,
  FieldKey,
  FieldMapping,
  ImportBill,
  ImportLine,
  ImportOptions,
  ImportPlan,
  ImportStats,
  ImportTarget,
  NewItem,
  NewParty,
  ParsedRow,
  PartyResolutionMap,
  RowIssue
} from './types'

export interface BuildPlanInput {
  target: ImportTarget
  rows: CellValue[][]
  range: CellRange
  headerRow: number | null
  mapping: FieldMapping
  options: ImportOptions
  parties: PartyRow[]
  items: ItemRow[]
  partyResolutions: PartyResolutionMap
  companyStateCode: string
  roundOffMode: string
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/

function todayIso(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function stateFromGstin(gstin: string | null): string | null {
  if (!gstin) return null
  const match = gstin.match(/^(\d{2})/)
  return match ? match[1] : null
}

/** Matches `normalize_supplier_bill_number` in the Rust numbering module. */
function normalizeBillNo(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s/.-]/g, '')
}

function itemKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function partyKey(name: string, gstin: string | null): string {
  const normalized = normalizePartyName(name)
  if (normalized) return normalized
  return gstin ? `gstin:${gstin.toUpperCase()}` : 'unknown-party'
}

function eligibleFor(party: PartyRow, target: ImportTarget): boolean {
  return target === 'PURCHASE' ? party.isSupplier : party.isCustomer
}

function findParty(
  parties: PartyRow[],
  name: string,
  gstin: string | null,
  target: ImportTarget
): PartyRow | null {
  const eligible = parties.filter((party) => eligibleFor(party, target))
  if (gstin) {
    const byGstin = eligible.find(
      (party) => party.gstin && party.gstin.toUpperCase() === gstin.toUpperCase()
    )
    if (byGstin) return byGstin
  }
  const normalized = normalizePartyName(name)
  if (!normalized) return null
  return eligible.find((party) => normalizePartyName(party.name) === normalized) ?? null
}

function buildItemIndex(items: ItemRow[]): Map<string, ItemRow> {
  const index = new Map<string, ItemRow>()
  for (const item of items) {
    const name = itemKey(item.name)
    if (name && !index.has(name)) index.set(name, item)
    if (item.sku) {
      const sku = itemKey(item.sku)
      if (sku && !index.has(sku)) index.set(sku, item)
    }
  }
  return index
}

function findItem(index: Map<string, ItemRow>, name: string): ItemRow | null {
  const key = itemKey(name)
  if (!key) return null
  return index.get(key) ?? null
}

function read(row: CellValue[], mapping: FieldMapping, key: FieldKey): CellValue {
  const column = mapping[key]
  if (column === undefined) return null
  return row[column] ?? null
}

function addIssue(issues: RowIssue[], issue: RowIssue): void {
  const duplicate = issues.some(
    (existing) =>
      existing.rowNumber === issue.rowNumber &&
      existing.field === issue.field &&
      existing.code === issue.code
  )
  if (!duplicate) issues.push(issue)
}

function parseRows(input: BuildPlanInput, itemIndex: Map<string, ItemRow>): ParsedRow[] {
  const { rows, range, headerRow, mapping, target } = input
  const start = headerRow === null ? range.startRow : headerRow + 1
  const parsed: ParsedRow[] = []
  const today = todayIso()

  for (let rowIndex = start; rowIndex <= range.endRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    if (isBlankRow(row.slice(range.startCol, range.endCol + 1))) continue

    const rowNumber = rowIndex + 1
    const issues: RowIssue[] = []

    const billNoRaw = cellText(read(row, mapping, 'billNo'))
    const date = parseDateCell(read(row, mapping, 'date'))
    const partyName = cellText(read(row, mapping, 'party'))
    const partyGstinRaw = cellText(read(row, mapping, 'partyGstin'))
      .toUpperCase()
      .replace(/\s+/g, '')
    const partyGstin = partyGstinRaw || null
    const dueDate = parseDateCell(read(row, mapping, 'dueDate'))
    const placeOfSupply = parseStateCode(read(row, mapping, 'placeOfSupply'))
    const narration = cellText(read(row, mapping, 'narration')) || null
    const itemName = cellText(read(row, mapping, 'item')) || null
    const description = cellText(read(row, mapping, 'description')) || itemName || ''
    const hsn = cellText(read(row, mapping, 'hsn')) || null
    const uom = cellText(read(row, mapping, 'uom')) || null
    if (hsn && hsn.length > 20) {
      addIssue(issues, {
        rowNumber,
        field: 'hsn',
        severity: 'error',
        code: 'HSN_TOO_LONG',
        message: 'The HSN or SAC is longer than 20 characters.',
        fix: 'Shorten the HSN or SAC in the file.'
      })
    }
    if (uom && uom.length > 20) {
      addIssue(issues, {
        rowNumber,
        field: 'uom',
        severity: 'error',
        code: 'UOM_TOO_LONG',
        message: 'The unit is longer than 20 characters.',
        fix: 'Shorten the unit in the file.'
      })
    }
    const matchedItem = itemName ? findItem(itemIndex, itemName) : null

    if (mapping.date !== undefined && !date) {
      const raw = cellText(read(row, mapping, 'date'))
      addIssue(issues, {
        rowNumber,
        field: 'date',
        severity: 'error',
        code: 'DATE_INVALID',
        message: raw ? `"${raw}" is not a valid date.` : 'The date is blank.',
        fix: 'Use a date like 13-05-2026, or a real Excel date cell.'
      })
    } else if (date && date > today) {
      addIssue(issues, {
        rowNumber,
        field: 'date',
        severity: 'warning',
        code: 'DATE_FUTURE',
        message: `The date ${date} is in the future.`,
        fix: 'Check the year before importing.'
      })
    }

    if (!partyName) {
      addIssue(issues, {
        rowNumber,
        field: 'party',
        severity: 'error',
        code: 'PARTY_MISSING',
        message: 'The party name is blank.',
        fix: `Fill the ${target === 'PURCHASE' ? 'supplier' : 'customer'} column.`
      })
    }

    if (partyGstin && partyGstin.length > 15) {
      addIssue(issues, {
        rowNumber,
        field: 'partyGstin',
        severity: 'error',
        code: 'GSTIN_TOO_LONG',
        message: `"${partyGstin}" is longer than a 15 character GSTIN.`,
        fix: 'Shorten the GSTIN to 15 characters, or clear it and match the party by name.'
      })
    } else if (partyGstin && !GSTIN_PATTERN.test(partyGstin)) {
      addIssue(issues, {
        rowNumber,
        field: 'partyGstin',
        severity: 'warning',
        code: 'GSTIN_INVALID',
        message: `"${partyGstin}" does not look like a 15 character GSTIN.`,
        fix: 'Check the GSTIN, or clear it and match the party by name.'
      })
    }

    if (cellText(read(row, mapping, 'dueDate')) && !dueDate) {
      addIssue(issues, {
        rowNumber,
        field: 'dueDate',
        severity: 'warning',
        code: 'DUE_DATE_INVALID',
        message: 'The due date is not a valid date.',
        fix: 'Use a date like 05-05-2026, or clear the cell.'
      })
    }

    if (cellText(read(row, mapping, 'placeOfSupply')) && !placeOfSupply) {
      addIssue(issues, {
        rowNumber,
        field: 'placeOfSupply',
        severity: 'warning',
        code: 'PLACE_INVALID',
        message: 'The place of supply is not a two digit state code.',
        fix: 'Use a code like 27 for Maharashtra, or clear the cell.'
      })
    }

    if (mapping.billNo !== undefined && !billNoRaw) {
      addIssue(issues, {
        rowNumber,
        field: 'billNo',
        severity: 'warning',
        code: 'BILL_NO_BLANK',
        message: 'The bill number is blank. This row becomes its own bill.',
        fix: 'Fill the bill number to group this row with the rest of its bill.'
      })
    }

    const billNoLimit = target === 'PURCHASE' ? 32 : 80
    if (billNoRaw.length > billNoLimit) {
      addIssue(issues, {
        rowNumber,
        field: 'billNo',
        severity: 'error',
        code: 'BILL_NO_TOO_LONG',
        message: `The bill number is longer than ${billNoLimit} characters.`,
        fix: 'Shorten the bill number, or split it into a shorter reference.'
      })
    }

    if (partyName.length > 200) {
      addIssue(issues, {
        rowNumber,
        field: 'party',
        severity: 'error',
        code: 'PARTY_TOO_LONG',
        message: 'The party name is longer than 200 characters.',
        fix: 'Shorten the name in the file.'
      })
    }

    if (description.length > 300) {
      addIssue(issues, {
        rowNumber,
        field: 'description',
        severity: 'error',
        code: 'DESCRIPTION_TOO_LONG',
        message: 'The description is longer than 300 characters.',
        fix: 'Shorten the description in the file.'
      })
    }

    if (!description) {
      addIssue(issues, {
        rowNumber,
        field: 'description',
        severity: 'error',
        code: 'DESCRIPTION_MISSING',
        message: 'The item description is blank.',
        fix: 'Fill the item or description column.'
      })
    }

    const qtyRaw = read(row, mapping, 'qty')
    const qtyE4 = parseQuantityE4(qtyRaw)
    if (qtyE4 === null || qtyE4 <= 0) {
      addIssue(issues, {
        rowNumber,
        field: 'qty',
        severity: 'error',
        code: 'QTY_INVALID',
        message:
          qtyE4 === null ? 'The quantity is blank or not a number.' : 'The quantity is zero.',
        fix: 'Enter a quantity greater than zero.'
      })
    }

    const rateRaw = read(row, mapping, 'rate')
    const rateMinor = parseMoneyMinor(rateRaw)
    if (rateMinor === null || rateMinor < 0) {
      addIssue(issues, {
        rowNumber,
        field: 'rate',
        severity: 'error',
        code: 'RATE_INVALID',
        message:
          rateMinor === null ? 'The rate is blank or not a number.' : 'The rate is negative.',
        fix: 'Enter a rate of zero or more.'
      })
    }

    const discountRaw = read(row, mapping, 'discount')
    let discountBps = parsePercentCell(discountRaw) ?? 0
    if (discountBps < 0 || discountBps > 10_000) {
      addIssue(issues, {
        rowNumber,
        field: 'discount',
        severity: 'error',
        code: 'DISCOUNT_RANGE',
        message: 'The discount must be between 0 and 100 percent.',
        fix: 'Correct the discount column.'
      })
      discountBps = Math.min(10_000, Math.max(0, discountBps))
    }

    const gstRaw = read(row, mapping, 'gst')
    const gstParsed = parsePercentCell(gstRaw)
    let gstRateBps = gstParsed ?? matchedItem?.gstRateBps ?? 0
    if (mapping.gst !== undefined && !cellText(gstRaw) && !matchedItem) {
      addIssue(issues, {
        rowNumber,
        field: 'gst',
        severity: 'warning',
        code: 'GST_BLANK',
        message: 'The GST cell is blank and the item is not in your master. This line posts at 0%.',
        fix: 'Fill the GST cell, or map the item so its GST rate can be used.'
      })
    }
    if (gstParsed === null && cellText(gstRaw)) {
      addIssue(issues, {
        rowNumber,
        field: 'gst',
        severity: 'error',
        code: 'GST_INVALID',
        message: 'The GST rate is not a number.',
        fix: 'Enter a GST rate like 18, or clear the cell.'
      })
    }
    if (gstRateBps < 0 || gstRateBps > 5_000) {
      addIssue(issues, {
        rowNumber,
        field: 'gst',
        severity: 'error',
        code: 'GST_RANGE',
        message: `The GST rate is ${Math.round(gstRateBps) / 100}%.`,
        fix: 'Enter a GST rate between 0 and 50.'
      })
      gstRateBps = Math.min(5_000, Math.max(0, gstRateBps))
    }

    parsed.push({
      rowNumber,
      billNo: billNoRaw || null,
      date,
      partyName,
      partyGstin,
      dueDate,
      placeOfSupply,
      narration,
      itemName,
      description,
      hsn: hsn ?? matchedItem?.hsnSac ?? null,
      qtyE4: qtyE4 ?? 0,
      uom: uom ?? matchedItem?.uom ?? null,
      rateMinor: rateMinor ?? 0,
      discountBps,
      gstRateBps,
      rateIncludesTax: input.options.pricesIncludeTax,
      issues
    })
  }

  return parsed
}

function computeLine(
  row: ParsedRow,
  matchedItem: ItemRow | null,
  newItem: string | null,
  intraState: boolean
): ImportLine {
  const gross = roundHalfUpDiv(row.qtyE4 * row.rateMinor, 10_000)
  const discount = applyBps(gross, row.discountBps)
  const net = gross - discount
  let taxableMinor: number
  let cgstMinor = 0
  let sgstMinor = 0
  let igstMinor = 0
  let totalMinor: number

  if (row.rateIncludesTax) {
    // The typed rate is what the customer pays. Extract the taxable value and
    // the GST, then split the GST the way `compute_line_tax` does.
    const split = splitInclusivePrice(net, row.gstRateBps)
    taxableMinor = split.taxableMinor
    totalMinor = split.grossMinor
    if (intraState) {
      cgstMinor = Math.floor(split.gstMinor / 2)
      sgstMinor = split.gstMinor - cgstMinor
    } else {
      igstMinor = split.gstMinor
    }
  } else {
    // Exclusive: round each tax head on the taxable value. Splitting the total
    // GST instead can differ by one paisa from the server.
    taxableMinor = net
    if (intraState) {
      const half = Math.floor(row.gstRateBps / 2)
      cgstMinor = applyBps(taxableMinor, half)
      sgstMinor = applyBps(taxableMinor, row.gstRateBps - half)
    } else {
      igstMinor = applyBps(taxableMinor, row.gstRateBps)
    }
    totalMinor = taxableMinor + cgstMinor + sgstMinor + igstMinor
  }

  return {
    rowNumber: row.rowNumber,
    itemId: matchedItem?.id ?? null,
    newItemKey: newItem,
    description: row.description,
    hsn: row.hsn,
    uom: row.uom,
    qtyE4: row.qtyE4,
    rateMinor: row.rateMinor,
    discountBps: row.discountBps,
    gstRateBps: row.gstRateBps,
    rateIncludesTax: row.rateIncludesTax,
    taxableMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalMinor
  }
}

/**
 * Turn parsed rows into the bills the user will review and post.
 *
 * Grouping is by bill number. A blank or unmapped bill number makes each row its
 * own bill, which is honest: without the supplier's number there is no safe way
 * to know which lines belong together.
 */
export function buildPlan(input: BuildPlanInput): ImportPlan {
  const {
    target,
    mapping,
    options,
    parties,
    items,
    partyResolutions,
    companyStateCode,
    roundOffMode
  } = input
  const itemIndex = buildItemIndex(items)
  const rows = parseRows(input, itemIndex)
  const planIssues: RowIssue[] = []
  const newParties = new Map<string, NewParty>()
  const newItems = new Map<string, NewItem>()
  let freeTextLines = 0
  let unmatchedItemLines = 0

  if (mapping.gst === undefined) {
    planIssues.push({
      rowNumber: 0,
      field: 'gst',
      severity: 'warning',
      code: 'GST_MISSING',
      message:
        'The GST column is not mapped. Every line will post at 0% unless the item has a rate.',
      fix: 'Map the GST column if the file has one.'
    })
  }

  if (mapping.billNo === undefined) {
    planIssues.push({
      rowNumber: 0,
      field: 'billNo',
      severity: 'warning',
      code: 'BILL_NO_MISSING',
      message: 'The bill number is not mapped. Each row becomes its own bill.',
      fix: 'Map the bill number column to group item lines into one bill.'
    })
  }

  const groups = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    const key = row.billNo ? `bill:${normalizeBillNo(row.billNo)}` : `row:${row.rowNumber}`
    const existing = groups.get(key)
    if (existing) existing.push(row)
    else groups.set(key, [row])
  }

  const bills: ImportBill[] = []

  for (const [key, groupRows] of groups) {
    const first = groupRows[0]
    const billIssues: RowIssue[] = []
    groupRows.forEach((row) => row.issues.forEach((issue) => addIssue(billIssues, issue)))

    const groupGstin = groupRows.find((row) => row.partyGstin)?.partyGstin ?? null
    const distinctParties = new Set(
      groupRows
        .map(
          (row) =>
            `${partyKey(row.partyName, row.partyGstin)}|${row.partyGstin ?? groupGstin ?? ''}`
        )
        .filter(Boolean)
    )
    if (distinctParties.size > 1) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'party',
        severity: 'error',
        code: 'PARTY_CONFLICT',
        message: `Bill ${first.billNo ?? first.rowNumber} has more than one party name.`,
        fix: 'Split the rows into separate bill numbers, one per party.'
      })
    }

    const rawBillNumbers = new Set(groupRows.map((row) => row.billNo).filter(Boolean))
    if (rawBillNumbers.size > 1) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'billNo',
        severity: 'warning',
        code: 'BILL_NO_VARIANTS',
        message:
          'The same bill number is written in more than one way. The rows are grouped as one bill.',
        fix: 'Use one spelling of the bill number in the file.'
      })
    }

    const distinctDueDates = new Set(groupRows.map((row) => row.dueDate).filter(Boolean))
    if (distinctDueDates.size > 1) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'dueDate',
        severity: 'warning',
        code: 'DUE_DATE_CONFLICT',
        message: 'The bill has more than one due date. The first is used.',
        fix: 'Use one due date for the bill.'
      })
    }

    const distinctNarrations = new Set(groupRows.map((row) => row.narration).filter(Boolean))
    if (distinctNarrations.size > 1) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'narration',
        severity: 'warning',
        code: 'NARRATION_CONFLICT',
        message: 'The bill has more than one narration. The first is used.',
        fix: 'Use one narration for the bill.'
      })
    }

    const distinctDates = new Set(groupRows.map((row) => row.date).filter(Boolean))
    if (distinctDates.size > 1) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'date',
        severity: 'warning',
        code: 'DATE_CONFLICT',
        message: `Bill ${first.billNo ?? first.rowNumber} has more than one date. The first date is used.`,
        fix: 'Check the bill date column.'
      })
    }

    const partyName = first.partyName
    const partyGstin = groupGstin
    const keyForParty = partyKey(partyName, partyGstin)
    let party = findParty(parties, partyName, partyGstin, target)
    let partyAction: ImportBill['partyAction'] = party ? 'matched' : 'unresolved'
    const override = partyResolutions[keyForParty]

    if (override) {
      if (override.kind === 'existing') {
        const chosen = parties.find((row) => row.id === override.partyId) ?? null
        if (chosen && eligibleFor(chosen, target)) {
          party = chosen
          partyAction = 'matched'
        } else {
          party = null
          partyAction = 'unresolved'
        }
      } else if (override.kind === 'create' && partyName) {
        party = null
        partyAction = 'create'
      } else {
        party = null
        partyAction = 'unresolved'
      }
    } else if (!party && options.createMissingParties && partyName) {
      partyAction = 'create'
    }

    if (partyAction === 'unresolved') {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'party',
        severity: 'error',
        code: 'PARTY_UNRESOLVED',
        message: `"${partyName || 'This party'}" is not in your parties.`,
        fix:
          target === 'PURCHASE'
            ? 'Match it to an existing supplier, or create a new supplier.'
            : 'Match it to an existing customer, or create a new customer.'
      })
    } else if (partyAction === 'create') {
      const existing = newParties.get(keyForParty)
      if (!existing) {
        newParties.set(keyForParty, { key: keyForParty, name: partyName, gstin: partyGstin })
      }
    }

    const gstinState = stateFromGstin(groupGstin)
    const mappedPlace = groupRows.find((row) => row.placeOfSupply)?.placeOfSupply ?? null
    const placeOfSupply = mappedPlace ?? gstinState ?? party?.stateCode ?? companyStateCode
    const intraState = placeOfSupply === companyStateCode
    if (!mappedPlace && !gstinState && !party?.stateCode) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'placeOfSupply',
        severity: 'warning',
        code: 'STATE_ASSUMED',
        message: 'No GSTIN or place of supply. The bill is treated as intra-state.',
        fix: 'Add a GSTIN or place of supply column if the party is in another state.'
      })
    }
    const creditDays = party && party.creditDays > 0 ? party.creditDays : 30
    const dueDate = first.dueDate ?? (first.date ? addDays(first.date, creditDays) : null)

    const lines: ImportLine[] = groupRows.map((row) => {
      const matchedItem = row.itemName ? findItem(itemIndex, row.itemName) : null
      let newItem: string | null = null
      if (row.itemName && !matchedItem) {
        if (options.createMissingItems) {
          newItem = itemKey(row.itemName)
          if (!newItems.has(newItem)) {
            newItems.set(newItem, {
              key: newItem,
              name: row.itemName,
              gstRateBps: row.gstRateBps
            })
          }
        } else {
          unmatchedItemLines += 1
        }
      }
      if (!matchedItem && !newItem) freeTextLines += 1
      return computeLine(row, matchedItem, newItem, intraState)
    })

    const taxableMinor = lines.reduce((sum, line) => sum + line.taxableMinor, 0)
    const cgstMinor = lines.reduce((sum, line) => sum + line.cgstMinor, 0)
    const sgstMinor = lines.reduce((sum, line) => sum + line.sgstMinor, 0)
    const igstMinor = lines.reduce((sum, line) => sum + line.igstMinor, 0)
    const preRound = taxableMinor + cgstMinor + sgstMinor + igstMinor
    const totalMinor = roundOffMode === 'INVOICE' ? roundHalfUpDiv(preRound, 100) * 100 : preRound
    if (totalMinor <= 0) {
      addIssue(billIssues, {
        rowNumber: first.rowNumber,
        field: 'row',
        severity: 'error',
        code: 'TOTAL_ZERO',
        message: 'The bill total is zero.',
        fix: 'Check the rate and discount. A voucher must be greater than zero.'
      })
    }

    const blocked = billIssues.some((issue) => issue.severity === 'error') || lines.length === 0
    bills.push({
      key,
      billNo: first.billNo,
      date: first.date,
      dueDate,
      partyName,
      partyGstin,
      partyId: party?.id ?? null,
      partyAction,
      placeOfSupply,
      narration: first.narration,
      lines,
      issues: billIssues,
      taxableMinor,
      cgstMinor,
      sgstMinor,
      igstMinor,
      roundOffMinor: totalMinor - preRound,
      totalMinor,
      status: blocked ? 'blocked' : 'ready'
    })
  }

  if (unmatchedItemLines > 0) {
    planIssues.push({
      rowNumber: 0,
      field: 'item',
      severity: 'warning',
      code: 'ITEM_FREE_TEXT',
      message: `${unmatchedItemLines} item line${unmatchedItemLines === 1 ? '' : 's'} ${unmatchedItemLines === 1 ? 'does' : 'do'} not match an item in your master.`,
      fix: 'They will post as free-text lines and will not move stock. Turn on "Create items that do not exist" to create them.'
    })
  }

  const issues = [...planIssues, ...bills.flatMap((bill) => bill.issues)]
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
    return a.rowNumber - b.rowNumber
  })

  const stats: ImportStats = {
    bills: bills.length,
    lines: bills.reduce((sum, bill) => sum + bill.lines.length, 0),
    totalMinor: bills.reduce((sum, bill) => sum + bill.totalMinor, 0),
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    readyBills: bills.filter((bill) => bill.status === 'ready').length,
    blockedBills: bills.filter((bill) => bill.status === 'blocked').length,
    newParties: newParties.size,
    newItems: newItems.size,
    freeTextLines
  }

  const canImport = bills.length > 0 && stats.blockedBills === 0
  const firstError = issues.find((issue) => issue.severity === 'error')
  const blockingReason = canImport
    ? null
    : bills.length === 0
      ? 'No rows to import. Check the selected range.'
      : firstError
        ? `Fix ${stats.blockedBills} bill${stats.blockedBills === 1 ? '' : 's'} before importing. ${firstError.message}`
        : 'No bill is ready to import.'

  return {
    target,
    bills,
    issues,
    newParties: [...newParties.values()],
    newItems: [...newItems.values()],
    stats,
    canImport,
    blockingReason
  }
}

/** A mapping that is already complete, for tests and the sample flow. */
export function initialMapping(
  rows: CellValue[][],
  range: CellRange,
  headerRow: number | null,
  target: ImportTarget
): FieldMapping {
  return autoMap(rows, headerRow, range.startCol, range.endCol, target)
}

/**
 * A stable request id for one bill. The bill key can be longer than the
 * backend's 80 character limit, so it is hashed instead of truncated: two long
 * invoice numbers must not collapse into the same idempotency key.
 */
export function requestIdFor(sessionId: string, billKey: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < billKey.length; index += 1) {
    hash ^= billKey.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `${sessionId}:${(hash >>> 0).toString(36)}`
}

/** The post payload for one bill. Party and item ids are resolved by the caller. */
export function buildVoucherInput(
  plan: ImportPlan,
  bill: ImportBill,
  requestId: string,
  partyId: number,
  itemIdByKey: Record<string, number>
): PostVoucherInput {
  if (!bill.date) throw new Error(`Bill ${bill.billNo ?? bill.key} has no date`)
  const purchase = plan.target === 'PURCHASE'
  const narration = (
    bill.narration ? `Imported from Excel. ${bill.narration}` : 'Imported from Excel.'
  ).slice(0, 1000)

  return {
    requestId,
    type: plan.target,
    date: bill.date,
    dueDate: bill.dueDate,
    partyId,
    placeOfSupplyStateCode: bill.placeOfSupply,
    referenceNo: purchase ? null : (bill.billNo?.slice(0, 80) ?? null),
    supplierBillNo: purchase ? (bill.billNo?.slice(0, 32) ?? null) : null,
    supplierBillMissing: purchase ? !bill.billNo : false,
    narration,
    lines: bill.lines.map((line) => ({
      itemId: line.itemId ?? (line.newItemKey ? (itemIdByKey[line.newItemKey] ?? null) : null),
      description: line.description,
      hsn: line.hsn,
      uom: line.uom,
      qtyE4: line.qtyE4,
      rateMinor: line.rateMinor,
      rateIncludesTax: line.rateIncludesTax,
      discountBps: line.discountBps,
      gstRateBps: line.gstRateBps
    })),
    journalLines: [],
    allocations: []
  }
}
