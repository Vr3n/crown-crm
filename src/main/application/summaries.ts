import { currentCompanyId } from '../auth/session'
import { summaryRepo } from '../repositories/summaries'
import type { ItemSummary, PartySummary, VoucherSummary } from '../../shared/contracts/summaries'
import type { VoucherType } from '../../shared/contracts/vouchers'

export function partySummary(): PartySummary {
  return summaryRepo.parties(currentCompanyId())
}

export function itemSummary(): ItemSummary {
  return summaryRepo.items(currentCompanyId())
}

export function voucherSummary(
  type: VoucherType | undefined,
  from: string,
  to: string
): VoucherSummary {
  return summaryRepo.vouchers(currentCompanyId(), type, from, to)
}
