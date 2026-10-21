import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcResult } from '../../../src/shared/contracts/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { registerSalesIpc } from '../../../src/main/ipc/sales'
import { createLead } from '../../../src/main/application/leads'
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
  registerSalesIpc()
})

function sourceId(): number {
  return (getDb().prepare('SELECT id FROM lead_sources LIMIT 1').get() as { id: number }).id
}

function planId(): number {
  return (
    getDb()
      .prepare('SELECT id FROM membership_plans WHERE name = ? ORDER BY id LIMIT 1')
      .get('Annual') as { id: number }
  ).id
}

/**
 * End-to-end-ish check that the sales IPC layer wires every channel to the
 * application use cases through the { ok, ... } envelope, enforcing session
 * permission gates and input validation.
 */
describe('registerSalesIpc', () => {
  it('creates a lead over IPC and returns { ok: true, data }', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      {
        fullName: 'Ravi Kumar',
        phone: '+91 98123 45678',
        sourceId: sourceId(),
        planId: planId(),
        goal: 'Weight loss',
        notes: 'Asked about family plan'
      }
    )) as { ok: true; data: { leadId: number } }
    expect(result.ok).toBe(true)
    expect(result.data.leadId).toBeGreaterThan(0)
    const stored = getDb()
      .prepare('SELECT plan_id, goal, notes FROM leads WHERE id = ?')
      .get(result.data.leadId) as {
      plan_id: number | null
      goal: string | null
      notes: string | null
    }
    expect(stored).toEqual({
      plan_id: planId(),
      goal: 'Weight loss',
      notes: 'Asked about family plan'
    })
  })

  it('returns the permission error envelope without lead.create', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      { fullName: 'Ravi', phone: '9812345678', sourceId: sourceId() }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('rejects malformed input with VALIDATION_ERROR before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      { fullName: 'Ravi', phone: 'not-a-number' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('edits a lead over IPC and returns { ok: true }', async () => {
    seedOrgWithSession()
    const { leadId } = createLead({
      fullName: 'Ravi Kumar',
      phone: '9812345678',
      sourceId: sourceId()
    })
    const result = (await handlerFor(IPC_CHANNELS.LEADS_EDIT)(
      {},
      {
        leadId,
        fullName: 'Ravi Kumar Shukla',
        phone: '9812345678',
        sourceId: sourceId(),
        planId: planId(),
        goal: 'Toning',
        notes: 'Asked about locker'
      }
    )) as { ok: true; data: undefined }
    expect(result.ok).toBe(true)
    const stored = getDb()
      .prepare('SELECT plan_id, goal, notes FROM leads WHERE id = ?')
      .get(leadId) as { plan_id: number | null; goal: string | null; notes: string | null }
    expect(stored).toEqual({
      plan_id: planId(),
      goal: 'Toning',
      notes: 'Asked about locker'
    })
  })

  it('returns the permission error envelope without lead.edit', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_EDIT)(
      {},
      { leadId: 1, fullName: 'Ravi', phone: '9812345678', sourceId: sourceId() }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('rejects malformed edit input with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_EDIT)({}, { leadId: 1 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('exposes funnel counts over IPC', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS)({})) as {
      ok: true
      data: Array<{ stageName: string; count: number }>
    }
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('lists leads over IPC with paging and nested arrays', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_LIST)({}, { page: 1, limit: 50 })) as {
      ok: true
      data: { items: Array<{ personName: string; activities: unknown[] }>; total: number }
    }
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data.items)).toBe(true)
    expect(typeof result.data.total).toBe('number')
  })

  it('rejects an invalid list request with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_LIST)({}, { page: 0, limit: 999 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('searches sources over IPC, returning active matches only', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_SOURCES)({}, { query: 'walk' })) as {
      ok: true
      data: Array<{ id: number; name: string; active: boolean }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: expect.any(Number), name: 'Walk-in', active: true }])
  })

  it('rejects a malformed source search before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_SOURCES)({}, { query: 42 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a source over IPC for an owner', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE_SOURCE)(
      {},
      { name: 'Podcast' }
    )) as { ok: true; data: { id: number; name: string; active: boolean } }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ id: expect.any(Number), name: 'Podcast', active: true })
    const stored = getDb()
      .prepare('SELECT name, active FROM lead_sources WHERE id = ?')
      .get(result.data.id) as { name: string; active: number }
    expect(stored).toEqual({ name: 'Podcast', active: 1 })
  })

  it('denies source creation over IPC without settings.manage', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE_SOURCE)(
      {},
      { name: 'Podcast' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('searches catalog plans over IPC', async () => {
    seedOrgWithSession()

    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS)(
      {},
      { query: 'annual' }
    )) as { ok: true; data: Array<{ id: number; name: string }> }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: planId(), name: 'Annual' }])
  })

  it('rejects a malformed plan search before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS)(
      {},
      { query: 42 }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('searches goals over IPC', async () => {
    seedOrgWithSession()
    createLead({
      fullName: 'Asha Rao',
      phone: '9876543210',
      sourceId: sourceId(),
      goal: 'Weight loss'
    })

    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_GOALS)({}, { query: 'weight' })) as {
      ok: true
      data: Array<{ id: string; label: string }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: 'Weight loss', label: 'Weight loss' }])
  })

  it('moves selected leads to a stage over IPC', async () => {
    seedOrgWithSession()
    const first = createLead({ fullName: 'Asha Rao', phone: '9876543210', sourceId: sourceId() })
    const second = createLead({ fullName: 'Bina Sen', phone: '9876500011', sourceId: sourceId() })
    const target = (
      getDb()
        .prepare("SELECT id FROM lead_stages WHERE organization_id = 1 AND name = 'CONTACTED'")
        .get() as { id: number }
    ).id

    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE)(
      {},
      { leadIds: [first.leadId, second.leadId], targetStageId: target }
    )) as { ok: true; data: { moved: number } }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ moved: 2 })
  })

  it('rejects a malformed bulk move before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE)(
      {},
      { leadIds: [], targetStageId: 'not-a-number' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('denies bulk move over IPC without lead.update_stage', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE)(
      {},
      { leadIds: [1], targetStageId: 1 }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('deletes selected leads over IPC', async () => {
    seedOrgWithSession()
    const { leadId } = createLead({
      fullName: 'Asha Rao',
      phone: '9876543210',
      sourceId: sourceId()
    })

    const result = (await handlerFor(IPC_CHANNELS.LEADS_DELETE)({}, { leadIds: [leadId] })) as {
      ok: true
      data: Record<string, never>
    }
    expect(result.ok).toBe(true)
    expect(
      (
        getDb().prepare('SELECT COUNT(*) AS n FROM leads WHERE id = ?').get(leadId) as {
          n: number
        }
      ).n
    ).toBe(0)
  })

  it('rejects a malformed delete request before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_DELETE)({}, { leadIds: [] })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('denies lead deletion over IPC without lead.delete', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_DELETE)({}, { leadIds: [1] })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('schedules a follow-up for each selected lead over IPC', async () => {
    seedOrgWithSession()
    const first = createLead({ fullName: 'Asha Rao', phone: '9876543210', sourceId: sourceId() })
    const second = createLead({ fullName: 'Bina Sen', phone: '9876500011', sourceId: sourceId() })

    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP)(
      {},
      {
        leadIds: [first.leadId, second.leadId],
        title: 'Re-call',
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    )) as { ok: true; data: { scheduled: number } }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ scheduled: 2 })
    const stored = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_followups WHERE lead_id IN (?, ?) AND title = ?')
      .get(first.leadId, second.leadId, 'Re-call') as { n: number }
    expect(stored.n).toBe(2)
  })

  it('rejects a malformed bulk follow-up before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP)(
      {},
      { leadIds: [], title: '', dueAt: 'not-a-date' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('denies bulk follow-up over IPC without followup.create', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP)(
      {},
      { leadIds: [1], title: 'x', dueAt: new Date(Date.now() + 86_400_000).toISOString() }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('logs an activity for each selected lead over IPC', async () => {
    seedOrgWithSession()
    const first = createLead({ fullName: 'Asha Rao', phone: '9876543210', sourceId: sourceId() })
    const second = createLead({ fullName: 'Bina Sen', phone: '9876500011', sourceId: sourceId() })
    const typeId = (
      getDb().prepare("SELECT id FROM lead_activity_types WHERE name = 'PHONE_CALL'").get() as {
        id: number
      }
    ).id

    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY)(
      {},
      {
        leadIds: [first.leadId, second.leadId],
        typeId,
        note: 'Called to confirm trial',
        occurredAt: new Date().toISOString()
      }
    )) as { ok: true; data: { recorded: number } }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ recorded: 2 })
    const stored = getDb()
      .prepare('SELECT COUNT(*) AS n FROM lead_activities WHERE lead_id IN (?, ?)')
      .get(first.leadId, second.leadId) as { n: number }
    expect(stored.n).toBe(2)
  })

  it('rejects a malformed bulk activity before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY)(
      {},
      { leadIds: [], typeId: 'not-a-number', occurredAt: '' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('denies bulk activity over IPC without lead.record_activity', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY)(
      {},
      { leadIds: [1], typeId: 1, note: 'x', occurredAt: new Date().toISOString() }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })
})
