import {
  setupOrganization,
  login,
  createStaffMember,
  updateOrganization,
  getAuthStatus,
  logout,
  checkOrganizationExists
} from '../application/identity'
import { getSession } from '../auth/session'
import type { SessionContext } from '../../shared/contracts/identity'
import {
  createStaffMemberInputSchema,
  loginInputSchema,
  organizationExistenceInputSchema,
  setupOrganizationInputSchema,
  updateOrganizationInputSchema
} from '../../shared/contracts/identity'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerIdentityIpc(): void {
  handle(IPC_CHANNELS.IDENTITY_SETUP, setupOrganizationInputSchema, (input) =>
    setupOrganization(input)
  )

  handle(IPC_CHANNELS.IDENTITY_LOGIN, loginInputSchema, (input) => login(input))

  handle(IPC_CHANNELS.IDENTITY_SESSION, (): SessionContext | null => getSession())

  handle(IPC_CHANNELS.IDENTITY_STATUS, () => getAuthStatus())

  handle(IPC_CHANNELS.IDENTITY_CREATE_STAFF, createStaffMemberInputSchema, (input) =>
    createStaffMember(input)
  )

  handle(IPC_CHANNELS.IDENTITY_CHECK_ORGANIZATION_EXISTS,
    organizationExistenceInputSchema,
    (input) => checkOrganizationExists(input)
  )

  handle(IPC_CHANNELS.IDENTITY_UPDATE_ORGANIZATION, updateOrganizationInputSchema, (input) => {
    const org = updateOrganization(input)
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      legalName: org.legalName,
      billingEmail: org.billingEmail,
      mobileNumber: org.mobileNumber,
      timezone: org.timezone,
      currency: org.currency,
      logo: org.logo,
      status: org.status,
      planTier: org.planTier,
      invoiceTerms: org.invoiceTerms,
      receiptTerms: org.receiptTerms,
      refundTerms: org.refundTerms,
      createdAt: org.createdAt
    }
  })

  handle(IPC_CHANNELS.IDENTITY_LOGOUT, () => {
    logout()
    return true
  })
}
