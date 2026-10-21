import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { IpcResult } from '../../../src/shared/contracts/errors'
import { NotFoundError } from '../../../src/main/domain/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { ipcMain } from 'electron'
import { handle } from '../../../src/main/ipc/handle'

type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>

function handlerFor(channel: string): Handler {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`No handler registered for "${channel}"`)
  return call[1] as unknown as Handler
}

beforeEach(() => {
  mockHandle.mockClear()
})

/**
 * Tests the `handle()` wrapper (ADR-0006): every registered handler resolves to
 * the `{ ok, ... }` envelope, domain errors keep their stable code, unknown
 * errors map to INTERNAL_ERROR, and Zod validation rejects malformed input
 * before the application layer runs.
 */
describe('handle', () => {
  it('resolves successful calls to { ok: true, data }', async () => {
    handle('test:double', z.object({ n: z.number() }), (input) => ({ doubled: input.n * 2 }))

    const result = await handlerFor('test:double')({}, { n: 21 })

    expect(result).toEqual({ ok: true, data: { doubled: 42 } })
  })

  it('passes all args through when no schema is supplied', async () => {
    handle('test:raw', (...args: unknown[]) => ({ got: args }))

    const result = await handlerFor('test:raw')({}, 'a', 1, true)

    expect(result).toEqual({ ok: true, data: { got: ['a', 1, true] } })
  })

  it('maps a domain error to its stable code', async () => {
    handle('test:notfound', z.object({}), () => {
      throw new NotFoundError('The resource is gone')
    })

    const result = await handlerFor('test:notfound')({}, {})

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'The resource is gone' }
    })
  })

  it('maps unknown Error instances to INTERNAL_ERROR', async () => {
    handle('test:internal', z.object({}), () => {
      throw new Error('boom')
    })

    const result = await handlerFor('test:internal')({}, {})

    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } })
  })

  it('maps non-Error throws to INTERNAL_ERROR with a generic message', async () => {
    handle('test:nonerror', z.object({}), () => {
      throw 'total failure'
    })

    const result = await handlerFor('test:nonerror')({}, {})

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error. Please try again.' }
    })
  })

  it('rejects malformed input with VALIDATION_ERROR before the handler runs', async () => {
    const fn = vi.fn()
    handle('test:reject', z.object({ n: z.number() }), fn as unknown as () => Promise<unknown>)

    const result = await handlerFor('test:reject')({}, { n: 'x' })

    expect(fn).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })
})
