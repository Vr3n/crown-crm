import { ipcMain } from 'electron'
import type { ZodType } from 'zod'
import type { IpcError, IpcResult } from '../../shared/contracts/errors'
import { ERROR_CODES } from '../../shared/contracts/errors'
import { DomainError, ValidationError } from '../domain/errors'
import { logger, short, full } from '../lib/logger'

/**
 * Wraps an `ipcMain.handle` handler so thrown errors never cross the IPC
 * boundary through Electron's default serialization (which would surface the
 * channel name and internal error class, e.g.
 * `Error invoking remote method 'identity:login': DomainError: ...`).
 *
 * Every handler resolves to a discriminated result (ADR-0006):
 * `{ ok: true, data }` on success, or `{ ok: false, error }` on failure where
 * `error.code` is a stable machine-readable `ErrorCode` from the shared catalog.
 * Domain errors carry their own code; anything else maps to INTERNAL_ERROR.
 * The preload layer unwraps the result and re-throws an `Error` carrying the
 * code, so the renderer branches on `error.code`, never on `message`.
 *
 * When a Zod schema is supplied, it validates the (single) input argument at
 * the boundary before the application layer is invoked (guidelines §15); a
 * malformed payload is rejected as VALIDATION_ERROR without reaching the
 * handler.
 */
export function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => Promise<R> | R
): void
export function handle<T, R>(
  channel: string,
  schema: ZodType<T>,
  fn: (input: T) => Promise<R> | R
): void
export function handle<T, R>(
  channel: string,
  schemaOrFn: ZodType<T> | ((...args: unknown[]) => Promise<R> | R),
  maybeFn?: (input: T) => Promise<R> | R
): void {
  const schema = maybeFn ? (schemaOrFn as ZodType<T>) : undefined

  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<R>> => {
    const startedAt = Date.now()
    logger.debug(`ipc ${channel}`, ...args.map((arg) => short(arg)))
    try {
      let data: R
      if (schema) {
        const [parsed] = parseInput(schema, args[0])
        data = await (maybeFn as (input: T) => Promise<R> | R)(parsed)
      } else {
        data = await (schemaOrFn as (...args: unknown[]) => Promise<R> | R)(...args)
      }
      logger.debug(`ipc ${channel} ok`, `${Date.now() - startedAt}ms`)
      return { ok: true, data }
    } catch (err) {
      const error = toIpcError(err)
      logger.warn(
        `ipc ${channel} failed`,
        `${Date.now() - startedAt}ms`,
        error.code,
        full(error.message)
      )
      return { ok: false, error }
    }
  })
}

function parseInput<T>(schema: ZodType<T>, value: unknown): T[] {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const detail = issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input'
    throw new ValidationError(detail)
  }
  return [result.data]
}

function toIpcError(err: unknown): IpcError {
  if (err instanceof DomainError) {
    return { code: err.code, message: err.message }
  }
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
    const fullMsg = causeMsg ? `${err.message} | cause: ${causeMsg}` : err.message
    return { code: ERROR_CODES.INTERNAL_ERROR, message: fullMsg }
  }
  return { code: ERROR_CODES.INTERNAL_ERROR, message: 'Unexpected error. Please try again.' }
}
