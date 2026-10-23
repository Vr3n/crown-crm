import { currentCompanyId } from '../auth/session'
import { summaryRepo } from '../repositories/summaries'
import type { ItemSummary, PartySummary } from '../../shared/contracts/summaries'

export function partySummary(): PartySummary {
  return summaryRepo.parties(currentCompanyId())
}

export function itemSummary(): ItemSummary {
  return summaryRepo.items(currentCompanyId())
}
