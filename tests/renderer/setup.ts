import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
// Warm the module graphs for LeadsPage's lazily-loaded dialogs. In tests a click
// triggers a dynamic import; pre-loading here absorbs the first-transform cost
// so `React.lazy` resolves immediately instead of timing out the test.
import '@/features/leads/components/bulk-follow-up-dialog'
import '@/features/leads/components/bulk-activity-dialog'
import '@/features/leads/components/edit-lead-dialog'
import type { LeadListResponse, ReferenceData } from '../../src/shared/contracts/sales'
import type { Lead } from '../../src/renderer/src/features/leads/types'

/**
 * Component-test bootstrap for the renderer (React Testing Library on jsdom).
 *
 * jsdom lacks a few browser APIs that shadcn/Radix/TanStack touch, so they are
 * stubbed here once. `window.api` (the preload bridge) is re-mocked before every
 * test with defaults that satisfy the lead dialogs; individual tests override
 * the specific call they care about via `vi.mocked(window.api.leads.*)`.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Radix Select's DismissableLayer calls these pointer-capture methods on item
// selection; jsdom does not implement them, so stub them like the other browser
// APIs above.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}

afterEach(() => {
  cleanup()
})

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList
}

class ResizeObserverStub {
  observe(): void {
    return undefined
  }
  unobserve(): void {
    return undefined
  }
  disconnect(): void {
    return undefined
  }
}

if (!('ResizeObserver' in window)) {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}

export const referenceData: ReferenceData = {
  sources: [
    { id: 1, name: 'Walk-in', active: true },
    { id: 2, name: 'Instagram', active: true },
    { id: 3, name: 'Website', active: true },
    { id: 9, name: 'Other', active: true }
  ],
  stages: [
    {
      id: 1,
      name: 'NEW',
      sortOrder: 1,
      isInitial: true,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 2,
      name: 'CONTACTED',
      sortOrder: 2,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 3,
      name: 'INTERESTED',
      sortOrder: 3,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 4,
      name: 'VISIT_SCHEDULED',
      sortOrder: 4,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 5,
      name: 'VISITED',
      sortOrder: 5,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 6,
      name: 'TRIAL',
      sortOrder: 6,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 7,
      name: 'NEGOTIATION',
      sortOrder: 7,
      isInitial: false,
      isWon: false,
      isLost: false,
      active: true
    },
    {
      id: 8,
      name: 'WON',
      sortOrder: 8,
      isInitial: false,
      isWon: true,
      isLost: false,
      active: true
    },
    {
      id: 9,
      name: 'LOST',
      sortOrder: 9,
      isInitial: false,
      isWon: false,
      isLost: true,
      active: true
    }
  ],
  lostReasons: [
    { id: 1, name: 'Too expensive', active: true },
    { id: 2, name: 'Joined a competitor', active: true },
    { id: 3, name: 'Not interested', active: true },
    { id: 4, name: 'No response', active: true },
    { id: 5, name: 'Moved away', active: true },
    { id: 6, name: 'Medical reason', active: true },
    { id: 7, name: 'Wrong contact details', active: true },
    { id: 8, name: 'Other', active: true }
  ],
  activityTypes: [
    { id: 1, name: 'LEAD_CREATED', active: true },
    { id: 2, name: 'PHONE_CALL', active: true },
    { id: 3, name: 'WALK_IN', active: true },
    { id: 4, name: 'WHATSAPP', active: true },
    { id: 5, name: 'GYM_TOUR', active: true },
    { id: 6, name: 'TRIAL', active: true },
    { id: 7, name: 'NO_SHOW', active: true },
    { id: 8, name: 'PRICE_DISCUSSION', active: true },
    { id: 9, name: 'MEMBERSHIP_PROPOSAL', active: true },
    { id: 10, name: 'OWNER_CHANGE', active: true },
    { id: 11, name: 'STAGE_CHANGE', active: true },
    { id: 12, name: 'FOLLOW_UP_CREATED', active: true },
    { id: 13, name: 'FOLLOW_UP_DONE', active: true },
    { id: 14, name: 'NOTE', active: true },
    { id: 15, name: 'LOST', active: true },
    { id: 16, name: 'WON', active: true }
  ]
}

export const emptyLeadList: LeadListResponse = {
  items: [],
  page: 1,
  limit: 200,
  total: 0,
  hasMore: false
}

export const leadPlans = [
  { id: 101, name: 'Annual Premium' },
  { id: 102, name: 'Monthly Basic' },
  { id: 103, name: 'Couple Plan' }
]
export const leadGoals = ['Weight loss', 'Muscle gain', 'General fitness']

/** A freshly-captured lead in the NEW stage, as the list query would hydrate it. */
export const sampleLead: Lead = {
  id: 1,
  personId: 1,
  name: 'Rahul Mehta',
  phone: '9876501234',
  source: 'WALK_IN',
  sourceId: 1,
  owner: { id: 1, name: 'Priya Verma' },
  stage: 'NEW',
  stageId: 1,
  createdAt: new Date().toISOString(),
  activities: [],
  followUps: [],
  stageHistory: []
}

beforeEach(() => {
  window.api = {
    identity: {
      setup: vi.fn(),
      login: vi.fn(),
      session: vi.fn(),
      status: vi.fn(),
      createStaff: vi.fn(),
      checkOrganizationExists: vi.fn(),
      logout: vi.fn()
    },
    leads: {
      create: vi.fn(),
      editLead: vi.fn(),
      moveStage: vi.fn(),
      deleteLeads: vi.fn(),
      bulkMoveStage: vi.fn().mockResolvedValue({ moved: 0 }),
      bulkScheduleFollowup: vi.fn().mockResolvedValue({ scheduled: 0 }),
      bulkRecordActivity: vi.fn().mockResolvedValue({ recorded: 0 }),
      recordActivity: vi.fn(),
      assign: vi.fn(),
      markLost: vi.fn(),
      scheduleFollowup: vi.fn(),
      updateFollowup: vi.fn(),
      cancelFollowup: vi.fn(),
      completeFollowup: vi.fn(),
      bulkCompleteFollowups: vi.fn().mockResolvedValue({ completed: 0 }),
      getDetails: vi.fn(),
      list: vi.fn().mockResolvedValue(emptyLeadList),
      getTimeline: vi.fn(),
      getNew: vi.fn().mockResolvedValue([]),
      getUncontacted: vi.fn().mockResolvedValue([]),
      getTodaysFollowups: vi.fn().mockResolvedValue([]),
      getOverdueFollowups: vi.fn().mockResolvedValue([]),
      getTrialsEnding: vi.fn().mockResolvedValue([]),
      getRecentlyWon: vi.fn().mockResolvedValue([]),
      getRecentlyLost: vi.fn().mockResolvedValue([]),
      getFunnelCounts: vi.fn(),
      searchPeople: vi.fn().mockResolvedValue([]),
      getReferenceData: vi.fn().mockResolvedValue(referenceData),
      searchSources: vi.fn().mockImplementation(async (query: string) => {
        const q = query.trim().toLocaleLowerCase()
        return referenceData.sources.filter(
          (s) => s.active && s.name.toLocaleLowerCase().includes(q)
        )
      }),
      createSource: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
        id: 99,
        name: name.trim(),
        active: true
      })),
      searchPlanInterests: vi.fn().mockImplementation(async (query: string) => {
        const q = query.trim().toLocaleLowerCase()
        return leadPlans.filter((p) => p.name.toLocaleLowerCase().includes(q))
      }),
      searchGoals: vi.fn().mockImplementation(async (query: string) => {
        const q = query.trim().toLocaleLowerCase()
        return leadGoals
          .filter((v) => v.toLocaleLowerCase().includes(q))
          .map((id) => ({ id, label: id }))
      })
    },
    catalog: {
      listPlans: vi.fn().mockResolvedValue([]),
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
      deletePlan: vi.fn(),
      listOffers: vi.fn().mockResolvedValue([]),
      getOffer: vi.fn(),
      createOffer: vi.fn(),
      updateOffer: vi.fn(),
      deactivateOffer: vi.fn(),
      listPlanVersions: vi.fn().mockResolvedValue([]),
      listOfferVersions: vi.fn().mockResolvedValue([]),
      listPolicyLookups: vi.fn().mockResolvedValue({
        freezePolicies: [],
        prorationPolicies: [],
        cancellationPolicies: []
      }),
      createFreezePolicy: vi.fn(),
      updateFreezePolicy: vi.fn(),
      createProrationPolicy: vi.fn(),
      updateProrationPolicy: vi.fn(),
      createCancellationPolicy: vi.fn(),
      updateCancellationPolicy: vi.fn()
    }
  }
})

/**
 * Render with a fresh QueryClient that never retries (a rejected query in one
 * test must not bleed into another). The shared cache is reset per test too.
 */
export function renderWithClient(
  ui: React.ReactElement,
  client?: QueryClient
): ReturnType<typeof render> {
  const qc =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
  return render(React.createElement(QueryClientProvider, { client: qc }, ui))
}
