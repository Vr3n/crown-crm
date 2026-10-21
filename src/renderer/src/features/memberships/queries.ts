import { useCustomers } from '@/features/customers/queries'
import type { Customer } from '@/features/customers/types'

/**
 * Read model for the memberships page. Shares the customers query, so the two
 * features stay on one source of truth; the flattened entitlement list is built
 * in the page with a render-pure `now` so statuses stay current.
 */
export function useMemberships(): { customers: Customer[]; isLoading: boolean } {
  const { data, isLoading } = useCustomers()
  return { customers: data ?? [], isLoading }
}
