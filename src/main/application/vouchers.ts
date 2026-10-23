import { and, eq } from 'drizzle-orm'
import { getDb, getDrizzle, withTransaction } from '../db/connection'
import { accountRepo, godownRepo, itemRepo, partyRepo } from '../repositories/masters'
import { voucherRepo } from '../repositories/vouchers'
import { companyRepo } from '../repositories/identity'
import { auditEvents, items, parties, vouchers } from '../db/schema'
import {
  computeInvoiceTotals,
  computeLineTax,
  isIntraState,
  type LineTaxResult
} from '../domain/tax'
import { assertBalanced, buildLedgerLines, type LedgerDraft } from '../domain/posting'
import { currentCompanyId, getSession, requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import {
  AllocationError,
  ConflictError,
  NotFoundError,
  PartyNotAllowedError,
  UnbalancedVoucherError,
  ValidationError
} from '../domain/errors'
import type {
  OutstandingBill,
  OutstandingInput,
  PostVoucherInput,
  VoucherDetail,
  VoucherType
} from '../../shared/contracts/vouchers'

const ZERO_TOTALS = {
  taxableMinor: 0,
  cgstMinor: 0,
  sgstMinor: 0,
  igstMinor: 0,
  cessMinor: 0,
  discountMinor: 0,
  roundOffMinor: 0,
  totalMinor: 0,
  totalQtyE4: 0
}

const LINE_TYPES: VoucherType[] = ['SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE']

export interface PostedVoucher {
  id: number
  number: string
}

/**
 * Post one document: number it, compute tax, build ledger and stock rows, check
 * allocations, and write everything in one transaction. This is the only write
 * path for money.
 */
export function postVoucher(input: PostVoucherInput): PostedVoucher {
  requirePermission(
    input.type === 'RECEIPT' ? PERMISSIONS.RECEIPT_RECORD : PERMISSIONS.VOUCHER_POST
  )
  const companyId = currentCompanyId()
  const session = getSession()
  const userId = session?.userId ?? null
  const lines = input.lines ?? []
  const journalLines = input.journalLines ?? []

  return withTransaction(() => {
    const duplicate = voucherRepo.findByIdempotencyKey(companyId, input.requestId)
    if (duplicate) {
      const existing = voucherRepo.findById(companyId, duplicate)
      return { id: duplicate, number: existing?.number ?? '' }
    }

    const company = companyRepo.findById(companyId)
    if (!company) throw new NotFoundError('Company not found')

    const keys = accountRepo.systemKeys(companyId)
    const required = [
      'SALES',
      'SALES_RETURNS',
      'PURCHASES',
      'PURCHASE_RETURNS',
      'OUTPUT_CGST',
      'OUTPUT_SGST',
      'OUTPUT_IGST',
      'INPUT_CGST',
      'INPUT_SGST',
      'INPUT_IGST',
      'ROUND_OFF',
      'COGS',
      'INVENTORY',
      'CASH',
      'BANK'
    ]
    for (const key of required) {
      if (!keys[key]) throw new ValidationError(`Chart of accounts is missing ${key}`)
    }

    const party = input.partyId ? partyRepo.findById(companyId, input.partyId) : null
    if (input.partyId && !party) throw new NotFoundError('Party not found')
    const partyAccounts = party ? partyRepo.accountsFor(companyId, party.id) : {}

    const isLineVoucher = LINE_TYPES.includes(input.type)
    if (isLineVoucher && !party) throw new PartyNotAllowedError('Select a party for this voucher')
    if (isLineVoucher && lines.length === 0) {
      throw new ValidationError('Add at least one line')
    }
    if ((input.type === 'RECEIPT' || input.type === 'CREDIT_NOTE') && !partyAccounts.debtor) {
      throw new PartyNotAllowedError('This party is not a customer')
    }
    if ((input.type === 'PAYMENT' || input.type === 'DEBIT_NOTE') && !partyAccounts.creditor) {
      throw new PartyNotAllowedError('This party is not a supplier')
    }

    const placeOfSupply = input.placeOfSupplyStateCode ?? party?.stateCode ?? company.stateCode
    const intraState = isIntraState(company.stateCode, placeOfSupply)

    let computed: LineTaxResult[] = []
    let totals = { ...ZERO_TOTALS }

    if (isLineVoucher) {
      computed = lines.map((line) =>
        computeLineTax(
          {
            qtyE4: line.qtyE4,
            rateMinor: line.rateMinor,
            rateIncludesTax: line.rateIncludesTax,
            discountBps: line.discountBps,
            gstRateBps: line.gstRateBps
          },
          intraState
        )
      )
      totals = computeInvoiceTotals(
        computed,
        company.roundOffMode,
        lines.reduce((sum, line) => sum + line.qtyE4, 0)
      )
      if (totals.totalMinor <= 0)
        throw new ValidationError('Voucher total must be greater than zero')
    }

    let amountMinor = input.amountMinor ?? 0
    if (input.type === 'RECEIPT' || input.type === 'PAYMENT' || input.type === 'CONTRA') {
      if (amountMinor <= 0) throw new ValidationError('Enter an amount greater than zero')
    }
    if (input.type === 'JOURNAL') {
      const debit = journalLines.reduce((sum, line) => sum + line.debitMinor, 0)
      const credit = journalLines.reduce((sum, line) => sum + line.creditMinor, 0)
      if (debit !== credit || debit === 0) {
        throw new UnbalancedVoucherError('Journal debits and credits must match')
      }
      amountMinor = debit
    }

    // Stock and cost of goods sold.
    const stock: Parameters<typeof voucherRepo.insert>[3] = []
    let goodsTaxable = 0
    let serviceTaxable = 0
    let cogsMinor = 0
    const defaultGodown = godownRepo.list(companyId)[0]?.id ?? null

    if (isLineVoucher) {
      lines.forEach((line, index) => {
        const item = line.itemId ? itemRepo.findById(companyId, line.itemId) : null
        const tax = computed[index]
        if (!item || item.isService) {
          serviceTaxable += tax.taxableMinor
          return
        }
        goodsTaxable += tax.taxableMinor
        const godown = line.godownId ?? defaultGodown
        const qty = line.qtyE4

        if (input.type === 'PURCHASE' || input.type === 'CREDIT_NOTE') {
          const unitCost =
            input.type === 'PURCHASE'
              ? Math.round((tax.taxableMinor * 10_000) / qty)
              : itemRepo.averageCost(companyId, item.id)
          stock.push({
            itemId: item.id,
            godownId: godown,
            qtyInE4: qty,
            qtyOutE4: 0,
            unitCostMinor: unitCost,
            movementType: input.type === 'PURCHASE' ? 'PURCHASE' : 'RETURN_IN'
          })
          if (input.type === 'CREDIT_NOTE') {
            cogsMinor -= Math.round((qty * unitCost) / 10_000)
          }
        } else {
          const unitCost = itemRepo.averageCost(companyId, item.id)
          stock.push({
            itemId: item.id,
            godownId: godown,
            qtyInE4: 0,
            qtyOutE4: qty,
            unitCostMinor: unitCost,
            movementType: input.type === 'SALES' ? 'SALE' : 'RETURN_OUT'
          })
          if (input.type === 'SALES') {
            cogsMinor += Math.round((qty * unitCost) / 10_000)
          }
        }
      })
    }

    const ledger: LedgerDraft[] = buildLedgerLines({
      type: input.type,
      totals,
      accounts: {
        sales: keys.SALES,
        salesReturns: keys.SALES_RETURNS,
        purchases: keys.PURCHASES,
        purchaseReturns: keys.PURCHASE_RETURNS,
        outputCgst: keys.OUTPUT_CGST,
        outputSgst: keys.OUTPUT_SGST,
        outputIgst: keys.OUTPUT_IGST,
        inputCgst: keys.INPUT_CGST,
        inputSgst: keys.INPUT_SGST,
        inputIgst: keys.INPUT_IGST,
        roundOff: keys.ROUND_OFF,
        cogs: keys.COGS,
        inventory: keys.INVENTORY,
        cash: keys.CASH,
        bank: keys.BANK,
        partyDebtor: partyAccounts.debtor,
        partyCreditor: partyAccounts.creditor
      },
      partyId: party?.id ?? null,
      cashAccountId: input.cashAccountId ?? null,
      contraFromAccountId: input.contraFromAccountId ?? null,
      contraToAccountId: input.contraToAccountId ?? null,
      goodsTaxableMinor: goodsTaxable,
      serviceTaxableMinor: serviceTaxable,
      journalLines: journalLines,
      amountMinor
    })

    if (input.type === 'SALES' && cogsMinor !== 0) {
      ledger.push({
        accountId: keys.COGS,
        partyId: null,
        debitMinor: cogsMinor,
        creditMinor: 0,
        narration: 'Cost of goods sold'
      })
      ledger.push({
        accountId: keys.INVENTORY,
        partyId: null,
        debitMinor: 0,
        creditMinor: cogsMinor,
        narration: 'Stock issued'
      })
    }
    if (input.type === 'CREDIT_NOTE' && cogsMinor !== 0) {
      ledger.push({
        accountId: keys.INVENTORY,
        partyId: null,
        debitMinor: -cogsMinor,
        creditMinor: 0,
        narration: 'Stock returned'
      })
      ledger.push({
        accountId: keys.COGS,
        partyId: null,
        debitMinor: 0,
        creditMinor: -cogsMinor,
        narration: 'Cost reversed'
      })
    }

    assertBalanced(ledger)

    const allocations = input.allocations ?? []
    if (allocations.length > 0) {
      if (input.type !== 'RECEIPT' && input.type !== 'PAYMENT') {
        throw new ValidationError('Only receipts and payments can be allocated')
      }
      const allocated = allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0)
      if (allocated > amountMinor) {
        throw new AllocationError('Allocated more than the amount received or paid')
      }
      for (const allocation of allocations) {
        const bill = voucherRepo.findById(companyId, allocation.toVoucherId)
        if (!bill) throw new NotFoundError('Bill to allocate against was not found')
        if (bill.partyId !== party?.id) throw new AllocationError('Bill belongs to another party')
        const paid = voucherRepo
          .allocationsFor(companyId, bill.id)
          .reduce((sum, row) => sum + row.amountMinor, 0)
        const open = bill.totalMinor - paid
        if (allocation.amountMinor > open) {
          throw new AllocationError(`${bill.number} is only ${open / 100} open`)
        }
      }
    }

    const { number, fy, series } = voucherRepo.allocateNumber(
      companyId,
      input.type,
      input.date,
      input.manualNumber
    )

    const dueDate =
      input.dueDate ??
      (party && (input.type === 'SALES' || input.type === 'PURCHASE')
        ? addDays(input.date, party.creditDays)
        : null)

    const id = voucherRepo.insert(
      {
        companyId,
        type: input.type,
        fy,
        series,
        number,
        date: input.date,
        dueDate,
        partyId: party?.id ?? null,
        placeOfSupplyStateCode: placeOfSupply,
        narration: input.narration ?? null,
        referenceNo: input.referenceNo ?? null,
        taxableMinor: totals.taxableMinor,
        cgstMinor: totals.cgstMinor,
        sgstMinor: totals.sgstMinor,
        igstMinor: totals.igstMinor,
        cessMinor: totals.cessMinor,
        discountMinor: totals.discountMinor,
        roundOffMinor: totals.roundOffMinor,
        totalMinor:
          input.type === 'RECEIPT' || input.type === 'PAYMENT' || input.type === 'CONTRA'
            ? amountMinor
            : input.type === 'JOURNAL'
              ? journalLines.reduce((sum, line) => sum + line.debitMinor, 0)
              : totals.totalMinor,
        totalQtyE4: totals.totalQtyE4,
        paymentMethodId: input.paymentMethodId ?? null,
        bankAccountId: input.cashAccountId ?? null,
        idempotencyKey: input.requestId,
        createdBy: userId
      },
      lines.map((line, index) => {
        const tax =
          computed[index] ??
          computeLineTax(
            {
              qtyE4: line.qtyE4,
              rateMinor: line.rateMinor,
              rateIncludesTax: line.rateIncludesTax,
              discountBps: line.discountBps,
              gstRateBps: line.gstRateBps
            },
            intraState
          )
        const item = line.itemId ? itemRepo.findById(companyId, line.itemId) : null
        return {
          itemId: line.itemId ?? null,
          description: line.description,
          hsn: line.hsn ?? item?.hsnSac ?? null,
          uom: line.uom ?? item?.uom ?? null,
          qtyE4: line.qtyE4,
          rateMinor: line.rateMinor,
          includesTax: line.rateIncludesTax,
          discountBps: line.discountBps,
          gstRateBps: line.gstRateBps,
          taxableMinor: tax.taxableMinor,
          cgstMinor: tax.cgstMinor,
          sgstMinor: tax.sgstMinor,
          igstMinor: tax.igstMinor,
          cessMinor: tax.cessMinor,
          lineTotalMinor: tax.totalMinor,
          unitCostMinor: null,
          godownId: line.godownId ?? defaultGodown,
          sortOrder: index
        }
      }),
      ledger,
      stock,
      allocations.map((allocation) => ({
        toVoucherId: allocation.toVoucherId,
        amountMinor: allocation.amountMinor,
        allocationType: allocation.type
      })),
      userId
    )

    getDrizzle()
      .insert(auditEvents)
      .values({
        company_id: companyId,
        entity: 'VOUCHER',
        entity_id: id,
        action: 'POST',
        after_json: JSON.stringify({ type: input.type, number }),
        actor_user_id: userId
      })
      .run()

    return { id, number }
  })
}

export function cancelVoucher(companyId: number, id: number, reason: string): void {
  requirePermission(PERMISSIONS.VOUCHER_CANCEL)
  const session = getSession()
  withTransaction(() => {
    const voucher = voucherRepo.findById(companyId, id)
    if (!voucher) throw new NotFoundError('Voucher not found')
    if (voucher.status !== 'POSTED')
      throw new ConflictError('Only a posted voucher can be cancelled')
    if (voucherRepo.hasAllocations(companyId, id)) {
      throw new ConflictError('Reverse the allocations against this voucher before cancelling')
    }
    voucherRepo.cancel(companyId, id, reason, session?.userId ?? null)
    getDrizzle()
      .insert(auditEvents)
      .values({
        company_id: companyId,
        entity: 'VOUCHER',
        entity_id: id,
        action: 'CANCEL',
        before_json: JSON.stringify({ status: 'POSTED' }),
        after_json: JSON.stringify({ status: 'CANCELLED', reason }),
        actor_user_id: session?.userId ?? null
      })
      .run()
  })
}

export function getOutstanding(companyId: number, input: OutstandingInput): OutstandingBill[] {
  return voucherRepo.outstanding(companyId, input)
}

export function getVoucher(companyId: number, id: number): VoucherDetail {
  const voucher = voucherRepo.findById(companyId, id)
  if (!voucher) throw new NotFoundError('Voucher not found')
  return voucher
}

/**
 * Posts the one-time opening voucher from the opening balances stored on
 * parties, accounts and items. Refuses to run twice.
 */
export function postOpeningBalances(date: string): PostedVoucher {
  requirePermission(PERMISSIONS.VOUCHER_POST)
  const companyId = currentCompanyId()
  const session = getSession()

  return withTransaction(() => {
    const existing = getDrizzle()
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(and(eq(vouchers.company_id, companyId), eq(vouchers.voucher_type, 'OPENING')))
      .get()
    if (existing) throw new ConflictError('Opening balances have already been posted')

    const keys = accountRepo.systemKeys(companyId)
    if (!keys.OPENING_DIFF) throw new ValidationError('Opening difference account is missing')

    const db = getDrizzle()
    const partyRows = db
      .select()
      .from(parties)
      .where(eq(parties.company_id, companyId))
      .all()
      .filter((party) => party.opening_balance_minor !== 0)

    const openingAccounts = getDb()
      .prepare(
        `SELECT id, opening_balance_minor AS amount, opening_balance_side AS side
         FROM accounts WHERE company_id = ? AND opening_balance_minor <> 0
           AND id NOT IN (SELECT account_id FROM party_accounts WHERE company_id = ?)`
      )
      .all(companyId, companyId) as { id: number; amount: number; side: string }[]

    const itemRows = db
      .select()
      .from(items)
      .where(eq(items.company_id, companyId))
      .all()
      .filter((item) => item.opening_qty_e4 > 0 && !item.is_service)

    const stock: {
      itemId: number
      godownId: number | null
      qtyInE4: number
      qtyOutE4: number
      unitCostMinor: number
      movementType: string
    }[] = []
    let inventoryValue = 0
    const defaultGodown = godownRepo.list(companyId)[0]?.id ?? null
    for (const item of itemRows) {
      inventoryValue += Math.round((item.opening_qty_e4 * item.opening_rate_minor) / 10_000)
      stock.push({
        itemId: item.id,
        godownId: defaultGodown,
        qtyInE4: item.opening_qty_e4,
        qtyOutE4: 0,
        unitCostMinor: item.opening_rate_minor,
        movementType: 'OPENING'
      })
    }
    const ledger: LedgerDraft[] = []
    let debit = 0
    let credit = 0

    for (const party of partyRows) {
      const accounts = partyRepo.accountsFor(companyId, party.id)
      const amount = Math.abs(party.opening_balance_minor)
      const accountId = party.opening_balance_minor > 0 ? accounts.debtor : accounts.creditor
      if (!accountId) continue
      if (party.opening_balance_minor > 0) {
        ledger.push({
          accountId,
          partyId: party.id,
          debitMinor: amount,
          creditMinor: 0,
          narration: 'Opening balance'
        })
        debit += amount
      } else {
        ledger.push({
          accountId,
          partyId: party.id,
          debitMinor: 0,
          creditMinor: amount,
          narration: 'Opening balance'
        })
        credit += amount
      }
    }

    if (inventoryValue > 0 && keys.INVENTORY) {
      ledger.push({
        accountId: keys.INVENTORY,
        partyId: null,
        debitMinor: inventoryValue,
        creditMinor: 0,
        narration: 'Opening stock'
      })
      debit += inventoryValue
    }

    for (const account of openingAccounts) {
      const amount = Math.abs(account.amount)
      if (account.side === 'DEBIT') {
        ledger.push({
          accountId: account.id,
          partyId: null,
          debitMinor: amount,
          creditMinor: 0,
          narration: 'Opening balance'
        })
        debit += amount
      } else {
        ledger.push({
          accountId: account.id,
          partyId: null,
          debitMinor: 0,
          creditMinor: amount,
          narration: 'Opening balance'
        })
        credit += amount
      }
    }

    const difference = debit - credit
    if (difference > 0) {
      ledger.push({
        accountId: keys.OPENING_DIFF,
        partyId: null,
        debitMinor: 0,
        creditMinor: difference,
        narration: 'Opening difference'
      })
    } else if (difference < 0) {
      ledger.push({
        accountId: keys.OPENING_DIFF,
        partyId: null,
        debitMinor: -difference,
        creditMinor: 0,
        narration: 'Opening difference'
      })
    }

    if (ledger.length === 0) throw new ValidationError('No opening balances to post')
    assertBalanced(ledger)

    const { number, fy, series } = voucherRepo.allocateNumber(companyId, 'OPENING', date)
    const id = voucherRepo.insert(
      {
        companyId,
        type: 'OPENING',
        fy,
        series,
        number,
        date,
        dueDate: null,
        partyId: null,
        placeOfSupplyStateCode: null,
        narration: 'Opening balances',
        referenceNo: null,
        taxableMinor: 0,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        cessMinor: 0,
        discountMinor: 0,
        roundOffMinor: 0,
        totalMinor: 0,
        totalQtyE4: 0,
        paymentMethodId: null,
        bankAccountId: null,
        idempotencyKey: null,
        createdBy: session?.userId ?? null
      },
      [],
      ledger,
      stock,
      [],
      session?.userId ?? null
    )
    return { id, number }
  })
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Small helper for the dashboard and tests: net balance of one party. */
export function partyBalance(companyId: number, partyId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS amount
       FROM ledger_lines l
       JOIN party_accounts pa ON pa.account_id = l.account_id
       JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
       WHERE l.company_id = ? AND pa.party_id = ?`
    )
    .get(companyId, partyId) as { amount: number }
  return row.amount
}
