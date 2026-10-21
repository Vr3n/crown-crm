import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { BlacklistedPersonError, NotFoundError, ValidationError } from '../domain/errors'
import { customerRepo } from '../repositories/membership'
import { followupRepo, personRepo } from '../repositories/sales'
import type {
  BlacklistPersonInput,
  BlacklistPersonResult,
  UnblacklistPersonInput
} from '../../shared/contracts/blacklist'

export function blacklistPerson(input: BlacklistPersonInput): BlacklistPersonResult {
  requirePermission(PERMISSIONS.PERSON_BLACKLIST)
  const organizationId = currentOrganizationId()
  const session = requireSession()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (person.isBlacklisted) {
    throw new ValidationError('Person is already blacklisted')
  }

  personRepo.blacklist(organizationId, input.personId, input.reason, session.userId)

  // Cancel all pending follow-ups for this person's leads
  const reason = input.reason?.trim()
    ? `Blacklisted: ${input.reason} — follow-up cancelled`
    : 'Follow-up cancelled — person has been blacklisted'
  const pendingFollowups = followupRepo.listPendingForPerson(organizationId, input.personId)
  for (const fu of pendingFollowups) {
    followupRepo.cancel(organizationId, fu.id, session.userId, reason)
  }

  return { personId: input.personId, isBlacklisted: true }
}

/**
 * Refund-only rule: a blacklisted person may appear in reads and receive
 * refunds, but every other mutating use case must refuse them up front.
 * Resolves the person here so call sites only pass an id plus the action
 * name for the error message (e.g. 'schedule a follow-up').
 */
export function assertPersonAllowed(
  organizationId: number,
  personId: number,
  action: string
): void {
  const person = personRepo.findById(organizationId, personId)
  if (!person) throw new NotFoundError('Person not found')
  if (person.isBlacklisted) {
    throw new BlacklistedPersonError(
      `Cannot ${action}: person "${person.fullName}" is blacklisted (refunds only)`
    )
  }
}

/**
 * Same refund-only rule starting from a customer id: resolves the customer,
 * then delegates to `assertPersonAllowed`. For invoice/payment/membership
 * flows that only carry a customer reference.
 */
export function assertCustomerAllowed(
  organizationId: number,
  customerId: number,
  action: string
): void {
  const customer = customerRepo.getById(organizationId, customerId)
  if (!customer) throw new NotFoundError('Customer not found')
  assertPersonAllowed(organizationId, customer.personId, action)
}

export function unblacklistPerson(input: UnblacklistPersonInput): BlacklistPersonResult {
  requirePermission(PERMISSIONS.PERSON_BLACKLIST)
  const organizationId = currentOrganizationId()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (!person.isBlacklisted) {
    throw new ValidationError('Person is not blacklisted')
  }

  personRepo.unblacklist(organizationId, input.personId)

  return { personId: input.personId, isBlacklisted: false }
}
