/**
 * The additive error-code catalog shared by main, preload, and renderer
 * (ADR-0006). The renderer branches on `error.code`, never on `message`.
 *
 * Adding a new code here is additive: domain errors carry a stable `code` from
 * this catalog and `handle()` maps them at the IPC boundary. Unknown errors map
 * to INTERNAL_ERROR. Keep codes stable — once a code ships, renaming it is a
 * breaking change for any renderer branch.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  PAYMENT_ALREADY_ALLOCATED: 'PAYMENT_ALREADY_ALLOCATED',
  PAYMENT_OVER_ALLOCATED: 'PAYMENT_OVER_ALLOCATED',
  INVOICE_ALREADY_FINALIZED: 'INVOICE_ALREADY_FINALIZED',
  INVOICE_EMPTY: 'INVOICE_EMPTY',
  INVOICE_NUMBER_COLLISION: 'INVOICE_NUMBER_COLLISION',
  MEMBERSHIP_CANNOT_BE_FROZEN: 'MEMBERSHIP_CANNOT_BE_FROZEN',
  MEMBERSHIP_CANNOT_BE_CANCELLED: 'MEMBERSHIP_CANNOT_BE_CANCELLED',
  REFUND_EXCEEDS_PAYMENT: 'REFUND_EXCEEDS_PAYMENT',
  CREDIT_EXCEEDS_BALANCE: 'CREDIT_EXCEEDS_BALANCE',
  OVERPAYMENT_NOT_ALLOWED: 'OVERPAYMENT_NOT_ALLOWED',
  DUPLICATE: 'DUPLICATE',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** The error payload carried on the wire for every failed IPC operation. */
export interface IpcError {
  code: ErrorCode
  message: string
  details?: unknown
}

/** The discriminated envelope every IPC handler resolves to (ADR-0006). */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/**
 * The Error the preload re-throws after unwrapping an `{ ok: false }` result,
 * carrying the stable machine-readable code. The renderer client keeps its
 * throw-style API and branches on `error.code`.
 */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

/** Narrowing helper for renderer error handlers. */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/**
 * Best-effort human-readable message for an error surfaced from an IPC
 * operation. Electron's contextBridge clones the preload's `ApiError` into a
 * plain `Error` in the renderer realm — `instanceof ApiError` fails and `code`
 * is dropped, but `message` survives (see preload `call`). The fallback is used
 * only for values that are not `Error` objects at all.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) return err.message
  if (err instanceof Error) return err.message
  return fallback
}
