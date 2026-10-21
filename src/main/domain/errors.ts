import { ErrorCode, ERROR_CODES } from '../../shared/contracts/errors'
import { PermissionCode } from '../db/permissions'

/**
 * Base class for all domain/business failures. Every subclass carries a stable
 * machine-readable `code` from the shared catalog (ADR-0006) so the IPC layer
 * can map it without string-matching on messages. Unknown/non-domain errors map
 * to INTERNAL_ERROR at the boundary.
 */
export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(message: string, code: ErrorCode = ERROR_CODES.INTERNAL_ERROR) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

/** A requested resource does not exist (or is not visible to this session). */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.NOT_FOUND)
    this.name = 'NotFoundError'
  }
}

/** A user-supplied value violates a domain rule. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.VALIDATION_ERROR)
    this.name = 'ValidationError'
  }
}

/**
 * The caller is not authenticated (no valid session). Distinct from
 * `ForbiddenError`: an unauthenticated caller must never be reported as
 * PERMISSION_DENIED (known-gap #5).
 */
export class UnauthenticatedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Credential validation failed (login). Reports UNAUTHENTICATED so the renderer
 * treats "wrong password" and "not signed in" as the same branch.
 */
export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthorizedError'
  }
}

/** The current session is authenticated but lacks the required permission. */
export class ForbiddenError extends DomainError {
  /** The missing permission code, for logging/debugging. */
  readonly permissionCode: PermissionCode

  constructor(permissionCode: PermissionCode) {
    super(`Missing permission: ${permissionCode}`, ERROR_CODES.PERMISSION_DENIED)
    this.name = 'ForbiddenError'
    this.permissionCode = permissionCode
  }
}

/** An operation conflicts with existing state or data. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.CONFLICT)
    this.name = 'ConflictError'
  }
}

/** A state transition that is illegal for the current entity state. */
export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.INVALID_STATE_TRANSITION)
    this.name = 'InvalidStateTransitionError'
  }
}

/** An invoice that has already been finalized cannot be modified. */
export class InvoiceAlreadyFinalizedError extends DomainError {
  constructor(message = 'Invoice is already finalized') {
    super(message, ERROR_CODES.INVOICE_ALREADY_FINALIZED)
    this.name = 'InvoiceAlreadyFinalizedError'
  }
}

/** Cannot finalize an invoice with zero lines. */
export class InvoiceEmptyError extends DomainError {
  constructor(message = 'Invoice must have at least one line to finalize') {
    super(message, ERROR_CODES.INVOICE_EMPTY)
    this.name = 'InvoiceEmptyError'
  }
}

/** Invoice number collision during finalization (atomic counter conflict). */
export class InvoiceNumberCollisionError extends DomainError {
  constructor(message = 'Invoice number collision — please retry') {
    super(message, ERROR_CODES.INVOICE_NUMBER_COLLISION)
    this.name = 'InvoiceNumberCollisionError'
  }
}

/** A payment allocation exceeds the payment amount or invoice outstanding. */
export class PaymentOverAllocatedError extends DomainError {
  constructor(message = 'Payment allocation exceeds allowed amount') {
    super(message, ERROR_CODES.PAYMENT_OVER_ALLOCATED)
    this.name = 'PaymentOverAllocatedError'
  }
}

/** A payment is already fully allocated. */
export class PaymentAlreadyAllocatedError extends DomainError {
  constructor(message = 'Payment is already fully allocated') {
    super(message, ERROR_CODES.PAYMENT_ALREADY_ALLOCATED)
    this.name = 'PaymentAlreadyAllocatedError'
  }
}

/** A refund exceeds the net paid amount. */
export class RefundExceedsPaymentError extends DomainError {
  constructor(message = 'Refund exceeds net paid amount') {
    super(message, ERROR_CODES.REFUND_EXCEEDS_PAYMENT)
    this.name = 'RefundExceedsPaymentError'
  }
}

/** A credit application exceeds the remaining credit balance. */
export class CreditExceedsBalanceError extends DomainError {
  constructor(message = 'Credit application exceeds remaining balance') {
    super(message, ERROR_CODES.CREDIT_EXCEEDS_BALANCE)
    this.name = 'CreditExceedsBalanceError'
  }
}

/** Paid amount exceeds final price and overpayment is not allowed in this flow. */
export class OverpaymentNotAllowedError extends DomainError {
  constructor(message = 'Paid amount exceeds amount due — overpayment is not allowed') {
    super(message, ERROR_CODES.OVERPAYMENT_NOT_ALLOWED)
    this.name = 'OverpaymentNotAllowedError'
  }
}

/** Duplicate transaction key (idempotency). */
export class DuplicateTransactionError extends DomainError {
  constructor(message = 'Duplicate transaction — this sale was already processed') {
    super(message, ERROR_CODES.DUPLICATE_TRANSACTION)
    this.name = 'DuplicateTransactionError'
  }
}

/**
 * The person is blacklisted: reads stay visible and refunds still flow, but no
 * other business operation may touch them. Callers pass a specific message
 * naming the refused action; the default covers the general case.
 */
export class BlacklistedPersonError extends DomainError {
  constructor(message = 'This person is blacklisted (refunds only)') {
    super(message, ERROR_CODES.VALIDATION_ERROR)
    this.name = 'BlacklistedPersonError'
  }
}
