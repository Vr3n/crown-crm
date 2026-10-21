import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcResult } from '../../../src/shared/contracts/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { registerCatalogIpc } from '../../../src/main/ipc/catalog'
import { createLead } from '../../../src/main/application/leads'
import { createOffer, updateOffer, updatePlan } from '../../../src/main/application/catalog'
import { planRepo } from '../../../src/main/repositories/catalog'
import { getDb } from '../../../src/main/db/connection'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc.channels'

setupSalesDb()

type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>

function handlerFor(channel: string): Handler {
  const call = mockHandle.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`No handler registered for "${channel}"`)
  return call[1] as unknown as Handler
}

beforeEach(() => {
  mockHandle.mockClear()
  registerCatalogIpc()
})

const VALID_PLAN = {
  name: 'Strength Bundle',
  description: 'Weights + HIIT zones.',
  duration: 'MONTHLY',
  billingFrequency: 'ONE_TIME',
  basePriceMinor: 220000,
  accessWindow: 'ALL_HOURS',
  startTime: '06:00',
  endTime: '23:00',
  isActive: true
}

const VALID_OFFER = {
  name: 'New Year Offer',
  discountType: 'PERCENTAGE',
  valueMinor: 20,
  applicablePlanIds: [],
  validFrom: '2026-01-01',
  active: true
}

describe('registerCatalogIpc', () => {
  it('lists plans over IPC as { ok: true, data }', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_PLANS)({})) as {
      ok: true
      data: Array<{ name: string }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(3)
    expect(result.data.map((p) => p.name)).toContain('Annual')
  })

  it('creates a plan over IPC', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, VALID_PLAN)) as {
      ok: true
      data: { id: number; name: string }
    }
    expect(result.ok).toBe(true)
    expect(result.data.name).toBe('Strength Bundle')
  })

  it('rejects malformed create input with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, { name: 42 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns the permission error envelope without plan.create', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, VALID_PLAN)) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('updates a plan over IPC', async () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_UPDATE_PLAN)(
      {},
      {
        planId: target.id,
        ...VALID_PLAN,
        name: 'Renamed Bundle'
      }
    )) as { ok: true; data: { name: string } }
    expect(result.ok).toBe(true)
    expect(result.data.name).toBe('Renamed Bundle')
  })

  it('deletes an unreferenced plan over IPC', async () => {
    seedOrgWithSession()
    const created = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)(
      {},
      {
        ...VALID_PLAN,
        name: 'Throwaway'
      }
    )) as { ok: true; data: { id: number } }

    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)(
      {},
      {
        planId: created.data.id
      }
    )) as { ok: true; data: undefined }
    expect(result.ok).toBe(true)
    expect(
      getDb()
        .prepare('SELECT COUNT(*) AS n FROM membership_plans WHERE id = ?')
        .get(created.data.id)
    ).toEqual({ n: 0 })
  })

  it('returns a CONFLICT envelope when deleting a referenced plan', async () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    createLead({
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      sourceId: (getDb().prepare('SELECT id FROM lead_sources LIMIT 1').get() as { id: number }).id,
      planId: target.id
    })
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)(
      {},
      {
        planId: target.id
      }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('CONFLICT')
  })

  it('rejects a malformed delete input with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)({}, { planId: 0 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('lists plan versions over IPC after an edit', async () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    updatePlan({ planId: target.id, ...VALID_PLAN, name: target.name, basePriceMinor: 999999 })

    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_PLAN_VERSIONS)(
      {},
      { planId: target.id }
    )) as {
      ok: true
      data: Array<{ planId: number; basePriceMinor: number }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].planId).toBe(target.id)
  })

  it('creates an offer over IPC with usedCount 0', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_OFFER)({}, VALID_OFFER)) as {
      ok: true
      data: { name: string; active: boolean; usedCount: number }
    }
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ name: 'New Year Offer', active: true, usedCount: 0 })
  })

  it('lists offers over IPC', async () => {
    seedOrgWithSession()
    createOffer(VALID_OFFER)
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_OFFERS)({})) as {
      ok: true
      data: Array<{ name: string }>
    }
    expect(result.ok).toBe(true)
    expect(result.data.map((o) => o.name)).toEqual(['New Year Offer'])
  })

  it('deactivates an offer over IPC', async () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Flash Sale' })
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DEACTIVATE_OFFER)(
      {},
      { offerId: created.id }
    )) as {
      ok: true
      data: undefined
    }
    expect(result.ok).toBe(true)
    const row = getDb().prepare('SELECT active FROM offers WHERE id = ?').get(created.id) as {
      active: number
    }
    expect(row.active).toBe(0)
  })

  it('lists offer versions over IPC after a discount change', async () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Flash Sale' })
    updateOffer({
      offerId: created.id,
      ...VALID_OFFER,
      name: 'Flash Sale',
      discountType: 'FIXED_AMOUNT',
      valueMinor: 50000
    })

    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_OFFER_VERSIONS)(
      {},
      { offerId: created.id }
    )) as {
      ok: true
      data: Array<{ offerId: number; discountType: string; valueMinor: number }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      offerId: created.id,
      discountType: 'PERCENTAGE',
      valueMinor: 20
    })
  })

  it('returns the permission error envelope for offer create as Sales', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_OFFER)({}, VALID_OFFER)) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('returns the permission error envelope for offer deactivate as Sales', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DEACTIVATE_OFFER)(
      {},
      { offerId: 1 }
    )) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('lists the seeded policy lookups over IPC', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_POLICY_LOOKUPS)({})) as {
      ok: true
      data: {
        freezePolicies: unknown[]
        prorationPolicies: unknown[]
        cancellationPolicies: unknown[]
      }
    }
    expect(result.ok).toBe(true)
    expect(result.data.freezePolicies).toHaveLength(3)
    expect(result.data.prorationPolicies).toHaveLength(3)
    expect(result.data.cancellationPolicies).toHaveLength(3)
  })

  it('creates a cancellation policy over IPC with settings.manage', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_CANCELLATION_POLICY)(
      {},
      { name: 'Two Weeks Notice', effectiveRule: 'NOTICE_DAYS', noticeDays: 14 }
    )) as { ok: true; data: { name: string; noticeDays: number } }
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ name: 'Two Weeks Notice', noticeDays: 14 })
  })

  it('rejects a malformed cancellation policy with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_CANCELLATION_POLICY)(
      {},
      { name: 'Bad', effectiveRule: 'NOT_A_RULE' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})
