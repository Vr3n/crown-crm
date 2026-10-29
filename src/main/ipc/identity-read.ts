import { eq } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { companies } from '../db/schema'
import { currentCompanyId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Company profile read model. Staff and role lists live in `access.ts` so the
 * application layer can gate them and keep the SQL out of IPC handlers.
 */

interface CompanyRow {
  id: number
  slug: string
  name: string
  legal_name: string | null
  gstin: string | null
  pan: string | null
  state_code: string
  address: string | null
  city: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  currency: string
  fy_start_month: number
  books_begin_date: string
  logo: string | null
  invoice_terms: string | null
  costing_method: string
  round_off_mode: string
  allow_negative_stock: boolean
  status: string
  numbering_setup_at: string | null
  onboarding_completed_at: string | null
}

export function registerIdentityReadIpc(): void {
  handle(IPC_CHANNELS.IDENTITY_COMPANY, () => {
    const companyId = currentCompanyId()
    const row = getDrizzle().select().from(companies).where(eq(companies.id, companyId)).get() as
      CompanyRow | undefined
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      legalName: row.legal_name,
      gstin: row.gstin,
      pan: row.pan,
      stateCode: row.state_code,
      address: row.address,
      city: row.city,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      currency: row.currency,
      fyStartMonth: row.fy_start_month,
      booksBeginDate: row.books_begin_date,
      logo: row.logo,
      invoiceTerms: row.invoice_terms,
      costingMethod: row.costing_method,
      roundOffMode: row.round_off_mode,
      allowNegativeStock: row.allow_negative_stock,
      status: row.status,
      numberingSetupAt: row.numbering_setup_at,
      onboardingCompletedAt: row.onboarding_completed_at
    }
  })
}
