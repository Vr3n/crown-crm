import { ErrorCode, ERROR_CODES } from '../../shared/contracts/errors'
import { PermissionCode } from '../db/permissions'

/** Base class for business failures. Carries a stable machine-readable code. */
export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(message: string, code: ErrorCode = ERROR_CODES.INTERNAL_ERROR) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.NOT_FOUND)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.VALIDATION_ERROR)
    this.name = 'ValidationError'
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthenticatedError'
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends DomainError {
  readonly permissionCode: PermissionCode

  constructor(permissionCode: PermissionCode) {
    super(`Missing permission: ${permissionCode}`, ERROR_CODES.PERMISSION_DENIED)
    this.name = 'ForbiddenError'
    this.permissionCode = permissionCode
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.CONFLICT)
    this.name = 'ConflictError'
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.INVALID_STATE_TRANSITION)
    this.name = 'InvalidStateTransitionError'
  }
}

/** A voucher's debits and credits do not agree, or it has no lines. */
export class UnbalancedVoucherError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.VOUCHER_UNBALANCED)
    this.name = 'UnbalancedVoucherError'
  }
}

/** The account cannot receive postings (parent, inactive, wrong company). */
export class AccountNotPostableError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.ACCOUNT_NOT_POSTABLE)
    this.name = 'AccountNotPostableError'
  }
}

/** A party is required for this voucher type, or is not allowed this type. */
export class PartyNotAllowedError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.PARTY_NOT_ALLOWED)
    this.name = 'PartyNotAllowedError'
  }
}

/** An allocation exceeds the bill or the money received. */
export class AllocationError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.ALLOCATION_EXCEEDS_BILL)
    this.name = 'AllocationError'
  }
}

/** A voucher number could not be allocated without a collision. */
export class NumberCollisionError extends DomainError {
  constructor(message = 'Voucher number collision, try again') {
    super(message, ERROR_CODES.NUMBER_COLLISION)
    this.name = 'NumberCollisionError'
  }
}

/** Duplicate idempotency key with a different payload. */
export class DuplicateTransactionError extends DomainError {
  constructor(message = 'This request was already processed') {
    super(message, ERROR_CODES.IDEMPOTENCY_CONFLICT)
    this.name = 'DuplicateTransactionError'
  }
}
