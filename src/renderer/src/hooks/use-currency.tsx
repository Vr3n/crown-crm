import type { CurrencyCode } from '../../../shared/contracts/money'
import { useCompanyProfile } from '../lib/company-queries'

/** The active company's currency. Version 1 is INR only, but read it from data. */
export function useCurrency(): CurrencyCode {
  const { data } = useCompanyProfile()
  return (data?.currency ?? 'INR') as CurrencyCode
}
