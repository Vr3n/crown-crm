import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { itemSummary, partySummary, voucherSummary } from '../application/summaries'
import { voucherTypeSchema } from '../../shared/contracts/vouchers'
import { handle } from './handle'

const voucherSummaryInputSchema = z.object({
  type: voucherTypeSchema.optional(),
  from: z.string().max(10),
  to: z.string().max(10)
})

export function registerSummariesIpc(): void {
  handle(IPC_CHANNELS.PARTIES_SUMMARY, () => partySummary())
  handle(IPC_CHANNELS.ITEMS_SUMMARY, () => itemSummary())
  handle(IPC_CHANNELS.VOUCHERS_SUMMARY, voucherSummaryInputSchema, (input) =>
    voucherSummary(input.type, input.from, input.to)
  )
}
