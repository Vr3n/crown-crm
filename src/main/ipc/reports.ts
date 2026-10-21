import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { reports } from '../application/reports'
import { handle } from './handle'

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

const asOfSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basis: z.enum(['BILL_DATE', 'DUE_DATE']).default('DUE_DATE')
})

const statementSchema = rangeSchema.extend({ partyId: z.number().int().positive() })

const registerSchema = rangeSchema.extend({ type: z.enum(['SALES', 'PURCHASE']) })

export function registerReportsIpc(): void {
  handle(IPC_CHANNELS.REPORTS_TRIAL_BALANCE, () => reports.trialBalance())
  handle(IPC_CHANNELS.REPORTS_PROFIT_LOSS, rangeSchema, (input) =>
    reports.profitLoss(input.from, input.to)
  )
  handle(IPC_CHANNELS.REPORTS_BALANCE_SHEET, rangeSchema, (input) =>
    reports.balanceSheet(input.from, input.to)
  )
  handle(IPC_CHANNELS.REPORTS_RECEIVABLES, asOfSchema, (input) =>
    reports.aging(input.asOf, input.basis)
  )
  handle(IPC_CHANNELS.REPORTS_PAYABLES, asOfSchema, (input) => reports.payables(input.asOf))
  handle(IPC_CHANNELS.REPORTS_AGEING, asOfSchema, (input) =>
    reports.ageingBuckets(input.asOf, input.basis)
  )
  handle(IPC_CHANNELS.REPORTS_STATEMENT, statementSchema, (input) =>
    reports.statement(input.partyId, input.from, input.to)
  )
  handle(IPC_CHANNELS.REPORTS_REGISTER, registerSchema, (input) =>
    reports.register(input.type, input.from, input.to)
  )
  handle(IPC_CHANNELS.REPORTS_STOCK, () => reports.stockSummary())
}
