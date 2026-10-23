import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb, getDrizzle } from '../db/connection'
import {
  billAllocations,
  ledgerLines,
  parties,
  stockMovements,
  voucherItemLines,
  voucherSequences,
  vouchers
} from '../db/schema'
import { financialYearLabel } from '../domain/fy'
import { formatVoucherNumber, nextSequenceValue } from '../domain/numbering'
import { ValidationError } from '../domain/errors'
import { numberingRepo, sequenceYear } from './numbering'
import type {
  ListVouchersInput,
  OutstandingBill,
  OutstandingInput,
  VoucherDetail,
  VoucherListRow,
  VoucherType
} from '../../shared/contracts/vouchers'

export interface VoucherHeaderInput {
  companyId: number
  type: VoucherType
  fy: string
  series: string
  number: string
  date: string
  dueDate: string | null
  partyId: number | null
  placeOfSupplyStateCode: string | null
  narration: string | null
  referenceNo: string | null
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  discountMinor: number
  roundOffMinor: number
  totalMinor: number
  totalQtyE4: number
  paymentMethodId: number | null
  bankAccountId: number | null
  idempotencyKey: string | null
  createdBy: number | null
}

export interface VoucherLineInsert {
  itemId: number | null
  description: string
  hsn: string | null
  uom: string | null
  qtyE4: number
  rateMinor: number
  includesTax: boolean
  discountBps: number
  gstRateBps: number
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  lineTotalMinor: number
  unitCostMinor: number | null
  godownId: number | null
  sortOrder: number
}

export interface LedgerInsert {
  accountId: number
  partyId: number | null
  debitMinor: number
  creditMinor: number
  narration: string | null
}

export interface StockInsert {
  itemId: number
  godownId: number | null
  qtyInE4: number
  qtyOutE4: number
  unitCostMinor: number
  movementType: string
}

export interface AllocationInsert {
  toVoucherId: number
  amountMinor: number
  allocationType: string
}

export const voucherRepo = {
  allocateNumber(
    companyId: number,
    type: VoucherType,
    date: string,
    manualNumber?: number | null
  ): { number: string; fy: string; series: string } {
    const setting = numberingRepo.get(companyId, type)
    const company = getDb()
      .prepare('SELECT fy_start_month FROM companies WHERE id = ?')
      .get(companyId) as { fy_start_month: number } | undefined
    const fy = financialYearLabel(date, company?.fy_start_month ?? 4)
    const key = sequenceYear(fy, setting.restartYearly)
    const db = getDrizzle()

    const findSequence = (): typeof voucherSequences.$inferSelect | undefined =>
      db
        .select()
        .from(voucherSequences)
        .where(
          and(
            eq(voucherSequences.company_id, companyId),
            eq(voucherSequences.voucher_type, type),
            eq(voucherSequences.series, setting.series),
            eq(voucherSequences.fy, key)
          )
        )
        .get()

    let sequence = findSequence()

    if (!sequence) {
      db.insert(voucherSequences)
        .values({
          company_id: companyId,
          voucher_type: type,
          series: setting.series,
          fy: key,
          prefix: setting.prefix,
          suffix: setting.suffix,
          padding: setting.padding,
          last_value: Math.max(0, setting.startNumber - 1)
        })
        .run()
      sequence = findSequence()
    }

    const lastValue = sequence?.last_value ?? 0
    let next = nextSequenceValue(lastValue, setting.startNumber)

    if (manualNumber !== undefined && manualNumber !== null) {
      if (!setting.manualOverride) {
        throw new ValidationError('Manual voucher numbers are turned off for this series')
      }
      if (!Number.isInteger(manualNumber) || manualNumber < setting.startNumber) {
        throw new ValidationError(`Voucher number must be ${setting.startNumber} or higher`)
      }
      if (manualNumber <= lastValue) {
        throw new ValidationError(`Voucher number must be greater than ${lastValue}`)
      }
      next = manualNumber
    }

    db.update(voucherSequences)
      .set({
        last_value: next,
        prefix: setting.prefix,
        suffix: setting.suffix,
        padding: setting.padding
      })
      .where(eq(voucherSequences.id, sequence!.id))
      .run()

    return {
      number: formatVoucherNumber(setting.prefix, next, setting.padding, setting.suffix),
      fy,
      series: setting.series
    }
  },

  insert(
    header: VoucherHeaderInput,
    lines: VoucherLineInsert[],
    ledger: LedgerInsert[],
    stock: StockInsert[],
    allocations: AllocationInsert[],
    actorId: number | null
  ): number {
    const db = getDrizzle()
    const voucher = db
      .insert(vouchers)
      .values({
        company_id: header.companyId,
        voucher_type: header.type,
        series: header.series,
        number: header.number,
        fy: header.fy,
        voucher_date: header.date,
        due_date: header.dueDate,
        party_id: header.partyId,
        place_of_supply_state_code: header.placeOfSupplyStateCode,
        narration: header.narration,
        reference_no: header.referenceNo,
        status: 'POSTED',
        taxable_minor: header.taxableMinor,
        cgst_minor: header.cgstMinor,
        sgst_minor: header.sgstMinor,
        igst_minor: header.igstMinor,
        cess_minor: header.cessMinor,
        discount_minor: header.discountMinor,
        round_off_minor: header.roundOffMinor,
        total_minor: header.totalMinor,
        total_qty_e4: header.totalQtyE4,
        payment_method_id: header.paymentMethodId,
        bank_account_id: header.bankAccountId,
        idempotency_key: header.idempotencyKey,
        created_by: header.createdBy,
        posted_at: sql`(datetime('now'))`,
        posted_by: header.createdBy
      })
      .returning({ id: vouchers.id })
      .get()

    const voucherId = voucher.id

    lines.forEach((line, index) => {
      db.insert(voucherItemLines)
        .values({
          company_id: header.companyId,
          voucher_id: voucherId,
          item_id: line.itemId,
          description_snapshot: line.description,
          hsn_snapshot: line.hsn,
          uom_snapshot: line.uom,
          qty_e4: line.qtyE4,
          entered_rate_minor: line.rateMinor,
          rate_includes_tax: line.includesTax,
          discount_bps: line.discountBps,
          gst_rate_bps: line.gstRateBps,
          taxable_value_minor: line.taxableMinor,
          cgst_minor: line.cgstMinor,
          sgst_minor: line.sgstMinor,
          igst_minor: line.igstMinor,
          cess_minor: line.cessMinor,
          line_total_minor: line.lineTotalMinor,
          unit_cost_minor: line.unitCostMinor,
          godown_id: line.godownId,
          sort_order: index
        })
        .run()
    })

    ledger.forEach((line, index) => {
      db.insert(ledgerLines)
        .values({
          company_id: header.companyId,
          voucher_id: voucherId,
          account_id: line.accountId,
          party_id: line.partyId,
          debit_minor: line.debitMinor,
          credit_minor: line.creditMinor,
          narration: line.narration,
          sort_order: index
        })
        .run()
    })

    for (const movement of stock) {
      db.insert(stockMovements)
        .values({
          company_id: header.companyId,
          voucher_id: voucherId,
          item_id: movement.itemId,
          godown_id: movement.godownId,
          qty_in_e4: movement.qtyInE4,
          qty_out_e4: movement.qtyOutE4,
          unit_cost_minor: movement.unitCostMinor,
          movement_type: movement.movementType
        })
        .run()
    }

    for (const allocation of allocations) {
      db.insert(billAllocations)
        .values({
          company_id: header.companyId,
          from_voucher_id: voucherId,
          to_voucher_id: allocation.toVoucherId,
          amount_minor: allocation.amountMinor,
          allocation_type: allocation.allocationType,
          created_by: actorId
        })
        .run()
    }

    return voucherId
  },

  findById(companyId: number, id: number): VoucherDetail | null {
    const db = getDrizzle()
    const header = db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.company_id, companyId), eq(vouchers.id, id)))
      .get()
    if (!header) return null

    const party = header.party_id
      ? db.select().from(parties).where(eq(parties.id, header.party_id)).get()
      : null

    const lines = db
      .select()
      .from(voucherItemLines)
      .where(eq(voucherItemLines.voucher_id, id))
      .orderBy(voucherItemLines.sort_order)
      .all()

    const allocations = db
      .select({
        toVoucherId: billAllocations.to_voucher_id,
        amountMinor: billAllocations.amount_minor,
        toNumber: vouchers.number
      })
      .from(billAllocations)
      .innerJoin(vouchers, eq(vouchers.id, billAllocations.to_voucher_id))
      .where(eq(billAllocations.from_voucher_id, id))
      .all()

    return {
      id: header.id,
      type: header.voucher_type as VoucherType,
      number: header.number,
      date: header.voucher_date,
      dueDate: header.due_date,
      partyId: header.party_id,
      partyName: party?.name ?? null,
      partyGstin: party?.gstin ?? null,
      narration: header.narration,
      referenceNo: header.reference_no,
      status: header.status as VoucherDetail['status'],
      taxableMinor: header.taxable_minor,
      cgstMinor: header.cgst_minor,
      sgstMinor: header.sgst_minor,
      igstMinor: header.igst_minor,
      roundOffMinor: header.round_off_minor,
      totalMinor: header.total_minor,
      lines: lines.map((line) => ({
        id: line.id,
        description: line.description_snapshot,
        hsn: line.hsn_snapshot,
        uom: line.uom_snapshot,
        qtyE4: line.qty_e4,
        rateMinor: line.entered_rate_minor,
        discountBps: line.discount_bps,
        gstRateBps: line.gst_rate_bps,
        taxableMinor: line.taxable_value_minor,
        taxMinor: line.cgst_minor + line.sgst_minor + line.igst_minor + line.cess_minor,
        totalMinor: line.line_total_minor
      })),
      allocations: allocations.map((a) => ({
        toVoucherId: a.toVoucherId,
        toNumber: a.toNumber,
        amountMinor: a.amountMinor
      }))
    }
  },

  list(companyId: number, input: ListVouchersInput): VoucherListRow[] {
    const clauses = [eq(vouchers.company_id, companyId)]
    if (input.type) clauses.push(eq(vouchers.voucher_type, input.type))
    if (input.from) clauses.push(gte(vouchers.voucher_date, input.from))
    if (input.to) clauses.push(lte(vouchers.voucher_date, input.to))
    if (input.partyId) clauses.push(eq(vouchers.party_id, input.partyId))

    const rows = getDrizzle()
      .select({
        id: vouchers.id,
        type: vouchers.voucher_type,
        number: vouchers.number,
        date: vouchers.voucher_date,
        totalMinor: vouchers.total_minor,
        status: vouchers.status,
        createdAt: vouchers.created_at,
        partyName: parties.name,
        narration: vouchers.narration
      })
      .from(vouchers)
      .leftJoin(parties, eq(parties.id, vouchers.party_id))
      .where(and(...clauses))
      .orderBy(desc(vouchers.voucher_date), desc(vouchers.id))
      .limit(input.limit)
      .offset(input.offset)
      .all()

    const filtered = input.query
      ? rows.filter(
          (row) =>
            row.number.toLowerCase().includes(input.query!.toLowerCase()) ||
            (row.partyName ?? '').toLowerCase().includes(input.query!.toLowerCase())
        )
      : rows

    return filtered.map((row) => ({
      id: row.id,
      type: row.type as VoucherType,
      number: row.number,
      date: row.date,
      partyName: row.partyName ?? null,
      narration: row.narration ?? null,
      totalMinor: row.totalMinor,
      status: row.status as VoucherListRow['status'],
      createdAt: row.createdAt
    }))
  },

  outstanding(companyId: number, input: OutstandingInput): OutstandingBill[] {
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10)
    const type = input.basis === 'DUE_DATE' ? 'DUE_DATE' : 'BILL_DATE'
    const kind = input.kind ?? 'RECEIVABLE'
    const typeFilter =
      kind === 'ALL'
        ? "v.voucher_type IN ('SALES','PURCHASE')"
        : kind === 'PAYABLE'
          ? "v.voucher_type = 'PURCHASE'"
          : "v.voucher_type = 'SALES'"
    const rows = getDb()
      .prepare(
        `SELECT v.id, v.number, v.voucher_date, v.due_date, v.party_id, p.name AS party_name,
                v.total_minor,
                COALESCE((SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id), 0) AS paid_minor,
                CAST(julianday(?) - julianday(COALESCE(CASE WHEN ? = 'DUE_DATE' THEN v.due_date END, v.voucher_date)) AS INTEGER) AS days
         FROM vouchers v JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ? AND v.status = 'POSTED'
           AND ${typeFilter}
           AND v.total_minor > 0
           AND v.voucher_date <= ?
           ${input.partyId ? 'AND v.party_id = ?' : ''}
         ORDER BY v.voucher_date, v.id`
      )
      .all(...[asOf, type, companyId, asOf, ...(input.partyId ? [input.partyId] : [])]) as Array<{
      id: number
      number: string
      voucher_date: string
      due_date: string | null
      party_id: number
      party_name: string
      total_minor: number
      paid_minor: number
      days: number
    }>

    return rows
      .map((row) => ({
        id: row.id,
        number: row.number,
        date: row.voucher_date,
        dueDate: row.due_date,
        partyId: row.party_id,
        partyName: row.party_name,
        totalMinor: row.total_minor,
        paidMinor: row.paid_minor,
        outstandingMinor: row.total_minor - row.paid_minor,
        daysOverdue: Math.max(0, Number(row.days ?? 0))
      }))
      .filter((row) => row.outstandingMinor > 0)
  },

  allocationsFor(
    companyId: number,
    voucherId: number
  ): { toVoucherId: number; amountMinor: number }[] {
    return getDrizzle()
      .select({
        toVoucherId: billAllocations.to_voucher_id,
        amountMinor: billAllocations.amount_minor
      })
      .from(billAllocations)
      .where(
        and(
          eq(billAllocations.company_id, companyId),
          eq(billAllocations.from_voucher_id, voucherId)
        )
      )
      .all()
  },

  hasAllocations(companyId: number, voucherId: number): boolean {
    const row = getDrizzle()
      .select({ id: billAllocations.id })
      .from(billAllocations)
      .where(
        and(
          eq(billAllocations.company_id, companyId),
          sql`(${billAllocations.from_voucher_id} = ${voucherId} OR ${billAllocations.to_voucher_id} = ${voucherId})`
        )
      )
      .get()
    return Boolean(row)
  },

  cancel(companyId: number, id: number, reason: string, actorId: number | null): void {
    getDrizzle()
      .update(vouchers)
      .set({
        status: 'CANCELLED',
        cancelled_at: sql`(datetime('now'))`,
        cancelled_by: actorId,
        cancel_reason: reason
      })
      .where(and(eq(vouchers.company_id, companyId), eq(vouchers.id, id)))
      .run()
  },

  findByIdempotencyKey(companyId: number, key: string): number | null {
    const row = getDrizzle()
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(and(eq(vouchers.company_id, companyId), eq(vouchers.idempotency_key, key)))
      .get()
    return row?.id ?? null
  }
}
