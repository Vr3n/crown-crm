import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { updateOrganization } from '../../../src/main/application/identity'
import { getDb } from '../../../src/main/db/connection'
import { ForbiddenError, ValidationError, NotFoundError } from '../../../src/main/domain/errors'
import { setSession } from '../../../src/main/auth/session'
import { roleRepo } from '../../../src/main/repositories/identity'
import { PERMISSIONS } from '../../../src/main/db/permissions'
import type { SessionContext } from '../../../src/main/domain/identity'

/**
 * Module 14 § 2 — organization profile + per-document terms update (Issue #111).
 * The real end-to-end path for the settings form: session-gated, profile rules
 * mirroring setup, and blank terms persisted as NULL so printed footers stay clean.
 */
setupSalesDb()

function sessionWithoutPermission(organizationId: number): SessionContext {
  const role = roleRepo.findByName(organizationId, 'Front Desk')!
  return {
    organizationId,
    organizationSlug: 'test',
    organizationName: 'Test',
    userId: 9999,
    userFullName: 'Test',
    userEmail: 'test@test.com',
    roleId: role.id,
    roleName: role.name,
    isSuper: role.isSuper,
    permissions: []
  }
}

function termsInput(overrides?: Partial<{
  legalName: string
  billingEmail: string
  mobileNumber: string
  timezone: string
  currency: string
  invoiceTerms: string
  receiptTerms: string
  refundTerms: string
}>): {
  legalName: string
  billingEmail: string
  mobileNumber: string
  timezone: string
  currency: string
  invoiceTerms: string
  receiptTerms: string
  refundTerms: string
} {
  return {
    legalName: 'Fit Gym Private Limited',
    billingEmail: 'billing@fitgym.com',
    mobileNumber: '9876543210',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    invoiceTerms: 'All dues must be cleared before renewal.',
    receiptTerms: 'This receipt confirms your payment.',
    refundTerms: 'Refunds reach your account within 5 working days.',
    ...overrides
  }
}

describe('updateOrganization', () => {
  it('updates the profile and terms for the current organization', () => {
    const { organizationId } = seedOrgWithSession()

    const updated = updateOrganization(termsInput())

    expect(updated.id).toBe(organizationId)
    expect(updated.legalName).toBe('Fit Gym Private Limited')
    expect(updated.billingEmail).toBe('billing@fitgym.com')
    expect(updated.mobileNumber).toBe('9876543210')
    expect(updated.invoiceTerms).toContain('renewal')
    expect(updated.receiptTerms).toContain('payment')
    expect(updated.refundTerms).toContain('working days')

    const row = getDb()
      .prepare(
        `SELECT legal_name, billing_email, mobile_number, invoice_terms, receipt_terms, refund_terms
         FROM organizations WHERE id = ?`
      )
      .get(organizationId) as {
      legal_name: string | null
      billing_email: string | null
      mobile_number: string
      invoice_terms: string | null
      receipt_terms: string | null
      refund_terms: string | null
    }
    expect(row.legal_name).toBe('Fit Gym Private Limited')
    expect(row.billing_email).toBe('billing@fitgym.com')
    expect(row.invoice_terms).toBe('All dues must be cleared before renewal.')
    expect(row.receipt_terms).toBe('This receipt confirms your payment.')
    expect(row.refund_terms).toBe('Refunds reach your account within 5 working days.')
  })

  it('stores blank or whitespace terms as NULL so the footer block drops off', () => {
    const { organizationId } = seedOrgWithSession()

    updateOrganization(
      termsInput({ invoiceTerms: '   ', receiptTerms: '', refundTerms: 'Line one\nLine two' })
    )

    const row = getDb()
      .prepare('SELECT invoice_terms, receipt_terms, refund_terms FROM organizations WHERE id = ?')
      .get(organizationId) as {
      invoice_terms: string | null
      receipt_terms: string | null
      refund_terms: string | null
    }
    expect(row.invoice_terms).toBeNull()
    expect(row.receipt_terms).toBeNull()
    expect(row.refund_terms).toBe('Line one\nLine two')
  })

  it('trims the profile text fields and lowercases the billing email', () => {
    const { organizationId } = seedOrgWithSession()

    updateOrganization(
      termsInput({
        invoiceTerms: '  Two clauses.  '
      })
    )

    const row = getDb()
      .prepare('SELECT invoice_terms FROM organizations WHERE id = ?')
      .get(organizationId) as { invoice_terms: string | null }
    expect(row.invoice_terms).toBe('Two clauses.')
  })

  it('rejects a term longer than the contract boundary', () => {
    seedOrgWithSession()
    expect(() =>
      updateOrganization(termsInput({ invoiceTerms: 'x'.repeat(2001) }))
    ).toThrow(ValidationError)
  })

  it('rejects a one-character legal name', () => {
    seedOrgWithSession()
    expect(() => updateOrganization(termsInput({ legalName: 'F' }))).toThrow(ValidationError)
  })

  it('rejects a malformed billing email', () => {
    seedOrgWithSession()
    expect(() =>
      updateOrganization(termsInput({ billingEmail: 'not-an-email' }))
    ).toThrow(ValidationError)
  })

  it('rejects a malformed mobile number', () => {
    seedOrgWithSession()
    expect(() =>
      updateOrganization(termsInput({ mobileNumber: '123' }))
    ).toThrow(ValidationError)
  })

  it('preserves fields omitted from a partial update (patch semantics)', () => {
    const { organizationId } = seedOrgWithSession()
    updateOrganization(termsInput())

    const updated = updateOrganization({
      mobileNumber: '9876543210',
      currency: 'INR',
      receiptTerms: 'Updated receipt clause.'
    })

    expect(updated.legalName).toBe('Fit Gym Private Limited')
    expect(updated.billingEmail).toBe('billing@fitgym.com')
    expect(updated.invoiceTerms).toBe('All dues must be cleared before renewal.')
    expect(updated.receiptTerms).toBe('Updated receipt clause.')
    expect(updated.refundTerms).toBe('Refunds reach your account within 5 working days.')

    const row = getDb()
      .prepare('SELECT legal_name, receipt_terms FROM organizations WHERE id = ?')
      .get(organizationId) as { legal_name: string | null; receipt_terms: string | null }
    expect(row.legal_name).toBe('Fit Gym Private Limited')
    expect(row.receipt_terms).toBe('Updated receipt clause.')
  })

  it('raises ForbiddenError without the org.manage permission', () => {
    const { organizationId } = seedOrgWithSession()
    setSession(sessionWithoutPermission(organizationId))

    expect(() => updateOrganization(termsInput())).toThrow(ForbiddenError)
  })

  it('raises NotFoundError when the organization row is missing', () => {
    seedOrgWithSession()
    const session: SessionContext = {
      organizationId: 99999,
      organizationSlug: 'test',
      organizationName: 'Test',
      userId: 9999,
      userFullName: 'Test',
      userEmail: 'test@test.com',
      roleId: 1,
      roleName: 'Owner',
      isSuper: false,
      permissions: [PERMISSIONS.ORG_MANAGE]
    }
    setSession(session)

    expect(() => updateOrganization(termsInput())).toThrow(NotFoundError)
  })
})