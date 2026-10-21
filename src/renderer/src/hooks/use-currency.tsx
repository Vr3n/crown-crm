import type { CurrencyCode } from '../../../shared/contracts/money'
import { useOrganization } from '../features/identity/queries'

/**
 * Returns the active organization's currency code, defaulting to `'INR'`
 * while the organization profile is still loading.
 */
export function useCurrency(): CurrencyCode {
  const { data: org } = useOrganization()
  return (org?.currency ?? 'INR') as CurrencyCode
}
