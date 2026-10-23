import { currentCompanyId, hasPermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { SEARCH_GROUP_LABELS, searchRepo } from '../repositories/search'
import type { SearchGroup, SearchInput, SearchOutput } from '../../shared/contracts/search'

/**
 * Searches only the families the signed-in role may view. A Billing Clerk
 * without `party.view` never sees a party name leak through the palette.
 */
export function search(input: SearchInput): SearchOutput {
  const companyId = currentCompanyId()
  const query = input.query.trim()
  const groups: SearchGroup[] = []

  if (hasPermission(PERMISSIONS.PARTY_VIEW)) {
    groups.push({
      kind: 'PARTY',
      label: SEARCH_GROUP_LABELS.PARTY,
      items: searchRepo.parties(companyId, query)
    })
  }
  if (hasPermission(PERMISSIONS.ITEM_VIEW)) {
    groups.push({
      kind: 'ITEM',
      label: SEARCH_GROUP_LABELS.ITEM,
      items: searchRepo.items(companyId, query)
    })
  }
  if (hasPermission(PERMISSIONS.VOUCHER_VIEW)) {
    groups.push({
      kind: 'VOUCHER',
      label: SEARCH_GROUP_LABELS.VOUCHER,
      items: searchRepo.vouchers(companyId, query)
    })
  }
  if (hasPermission(PERMISSIONS.COMPANY_VIEW)) {
    groups.push({
      kind: 'ACCOUNT',
      label: SEARCH_GROUP_LABELS.ACCOUNT,
      items: searchRepo.accounts(companyId, query)
    })
  }

  const populated = groups.filter((group) => group.items.length > 0)
  return {
    query,
    groups: populated,
    total: populated.reduce((sum, group) => sum + group.items.length, 0)
  }
}
