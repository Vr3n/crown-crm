import type { InvoiceTotals } from './tax'
import type { JournalLineInput, VoucherType } from '../../shared/contracts/vouchers'

/**
 * Pure ledger builder. The application resolves account ids and stock costs;
 * this module decides which accounts a document touches and on which side.
 */

export interface PostingAccounts {
  sales: number
  salesReturns: number
  purchases: number
  purchaseReturns: number
  outputCgst: number
  outputSgst: number
  outputIgst: number
  inputCgst: number
  inputSgst: number
  inputIgst: number
  roundOff: number
  cogs: number
  inventory: number
  cash: number
  bank: number
  partyDebtor?: number
  partyCreditor?: number
}

export interface LedgerDraft {
  accountId: number
  partyId: number | null
  debitMinor: number
  creditMinor: number
  narration: string | null
}

export interface BuildInput {
  type: VoucherType
  totals: InvoiceTotals
  accounts: PostingAccounts
  partyId?: number | null
  cashAccountId?: number | null
  goodsTaxableMinor?: number
  serviceTaxableMinor?: number
  journalLines?: JournalLineInput[]
  amountMinor?: number
  contraFromAccountId?: number | null
  contraToAccountId?: number | null
}

export function buildLedgerLines(input: BuildInput): LedgerDraft[] {
  const { type, totals, accounts, partyId = null } = input
  const cash = input.cashAccountId ?? accounts.cash
  const lines: LedgerDraft[] = []

  const push = (
    accountId: number,
    debitMinor: number,
    creditMinor: number,
    withParty = false,
    narration: string | null = null
  ): void => {
    if (debitMinor === 0 && creditMinor === 0) return
    lines.push({
      accountId,
      partyId: withParty ? partyId : null,
      debitMinor,
      creditMinor,
      narration
    })
  }

  switch (type) {
    case 'SALES': {
      if (input.cashAccountId) {
        push(cash, totals.totalMinor, 0)
      } else {
        if (!accounts.partyDebtor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
        push(accounts.partyDebtor, totals.totalMinor, 0, true)
      }
      push(accounts.sales, 0, totals.taxableMinor)
      push(accounts.outputCgst, 0, totals.cgstMinor)
      push(accounts.outputSgst, 0, totals.sgstMinor)
      push(accounts.outputIgst, 0, totals.igstMinor)
      if (totals.roundOffMinor > 0) push(accounts.roundOff, 0, totals.roundOffMinor)
      else if (totals.roundOffMinor < 0) push(accounts.roundOff, -totals.roundOffMinor, 0)
      break
    }
    case 'PURCHASE': {
      const goods = input.goodsTaxableMinor ?? totals.taxableMinor
      const services = input.serviceTaxableMinor ?? 0
      push(accounts.inventory, goods, 0)
      push(accounts.purchases, services, 0)
      push(accounts.inputCgst, totals.cgstMinor, 0)
      push(accounts.inputSgst, totals.sgstMinor, 0)
      push(accounts.inputIgst, totals.igstMinor, 0)
      if (totals.roundOffMinor > 0) push(accounts.roundOff, totals.roundOffMinor, 0)
      else if (totals.roundOffMinor < 0) push(accounts.roundOff, 0, -totals.roundOffMinor)
      if (input.cashAccountId) {
        push(cash, 0, totals.totalMinor)
      } else {
        if (!accounts.partyCreditor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
        push(accounts.partyCreditor, 0, totals.totalMinor, true)
      }
      break
    }
    case 'CREDIT_NOTE': {
      push(accounts.salesReturns, totals.taxableMinor, 0)
      push(accounts.outputCgst, totals.cgstMinor, 0)
      push(accounts.outputSgst, totals.sgstMinor, 0)
      push(accounts.outputIgst, totals.igstMinor, 0)
      if (totals.roundOffMinor > 0) push(accounts.roundOff, totals.roundOffMinor, 0)
      else if (totals.roundOffMinor < 0) push(accounts.roundOff, 0, -totals.roundOffMinor)
      if (input.cashAccountId) push(cash, 0, totals.totalMinor)
      else {
        if (!accounts.partyDebtor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
        push(accounts.partyDebtor, 0, totals.totalMinor, true)
      }
      break
    }
    case 'DEBIT_NOTE': {
      if (!accounts.partyCreditor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
      push(accounts.partyCreditor, totals.totalMinor, 0, true)
      const goods = input.goodsTaxableMinor ?? 0
      const services = Math.max(0, totals.taxableMinor - goods)
      push(accounts.inventory, 0, goods)
      push(accounts.purchaseReturns, 0, services)
      push(accounts.inputCgst, 0, totals.cgstMinor)
      push(accounts.inputSgst, 0, totals.sgstMinor)
      push(accounts.inputIgst, 0, totals.igstMinor)
      if (totals.roundOffMinor > 0) push(accounts.roundOff, 0, totals.roundOffMinor)
      else if (totals.roundOffMinor < 0) push(accounts.roundOff, -totals.roundOffMinor, 0)
      break
    }
    case 'RECEIPT': {
      if (!accounts.partyDebtor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
      const amount = input.amountMinor ?? totals.totalMinor
      push(cash, amount, 0)
      push(accounts.partyDebtor, 0, amount, true)
      break
    }
    case 'PAYMENT': {
      if (!accounts.partyCreditor || !partyId) throw new Error('PARTY_NOT_ALLOWED')
      const amount = input.amountMinor ?? totals.totalMinor
      push(accounts.partyCreditor, amount, 0, true)
      push(cash, 0, amount)
      break
    }
    case 'CONTRA': {
      const from = input.contraFromAccountId ?? accounts.cash
      const to = input.contraToAccountId ?? accounts.bank
      const amount = input.amountMinor ?? totals.totalMinor
      push(to, amount, 0)
      push(from, 0, amount)
      break
    }
    case 'JOURNAL': {
      for (const line of input.journalLines ?? []) {
        push(line.accountId, line.debitMinor, line.creditMinor, false, line.narration ?? null)
      }
      break
    }
    default:
      throw new Error(`Unsupported voucher type: ${type}`)
  }

  return lines
}

/** Throws when the document does not balance. The one invariant that matters. */
export function assertBalanced(lines: LedgerDraft[]): void {
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0)
  const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0)
  if (debit !== credit || debit === 0) {
    throw new Error(`VOUCHER_UNBALANCED: debit ${debit}, credit ${credit}`)
  }
}
