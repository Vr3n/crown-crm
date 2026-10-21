/**
 * Stable error-code catalog shared by main, preload and renderer. The renderer
 * branches on `code`, never on `message`. Adding a code is additive; renaming a
 * shipped code is a breaking change.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',

  // Vouchers and posting
  VOUCHER_UNBALANCED: 'VOUCHER_UNBALANCED',
  ACCOUNT_NOT_POSTABLE: 'ACCOUNT_NOT_POSTABLE',
  CROSS_COMPANY_REFERENCE: 'CROSS_COMPANY_REFERENCE',
  PARTY_NOT_ALLOWED: 'PARTY_NOT_ALLOWED',
  PERIOD_LOCKED: 'PERIOD_LOCKED',
  INVALID_LINE_VALUE: 'INVALID_LINE_VALUE',
  ROUND_OFF_TOO_LARGE: 'ROUND_OFF_TOO_LARGE',
  NUMBER_COLLISION: 'NUMBER_COLLISION',

  // Settlement
  ALLOCATION_EXCEEDS_BILL: 'ALLOCATION_EXCEEDS_BILL',
  ALLOCATION_EXCEEDS_PAYMENT: 'ALLOCATION_EXCEEDS_PAYMENT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

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

/** The discriminated envelope every IPC handler resolves to. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/**
 * The Error the preload re-throws after unwrapping an `{ ok: false }` result,
 * carrying the stable machine-readable code.
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
 * operation. Electron clones the preload's `ApiError` into a plain `Error` in
 * the renderer realm, so `instanceof` can fail while `message` survives.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) return err.message
  if (err instanceof Error) return err.message
  return fallback
}
