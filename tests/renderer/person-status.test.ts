import { describe, it, expect } from 'vitest'
import {
  personStatusOf,
  PERSON_STATUS_OPTIONS,
  type PersonStatus
} from '@/features/people/person-status'
import { filterLeads } from '@/features/leads/constants'
import { filterCustomers } from '@/features/customers/filters'
import { filterMemberships } from '@/features/memberships/filters'
import type { Lead, LeadFilters } from '@/features/leads/types'
import type { CustomerFilters, CustomerRow } from '@/features/customers/types'
import type { MembershipFilters, MembershipRow } from '@/features/memberships/types'

describe('personStatusOf', () => {
  it('maps the blacklist flag to a status', () => {
    expect(personStatusOf(false)).toBe('ACTIVE')
    expect(personStatusOf(true)).toBe('BLACKLISTED')
  })

  it('exposes the shared filter options', () => {
    expect(PERSON_STATUS_OPTIONS.map((o) => o.value)).toEqual(['ALL', 'ACTIVE', 'BLACKLISTED'])
  })
})

const baseLead = {
  id: 1,
  createdAt: new Date().toISOString(),
  stage: 'NEW' as const,
  sourceId: 1,
  owner: { id: 1, name: 'Alice' },
  name: 'A',
  phone: '9000000000',
  email: 'a@x.com'
}

function lead(overrides: { isBlacklisted?: boolean; stage?: Lead['stage'] }): Lead {
  return { ...baseLead, isBlacklisted: false, ...overrides } as unknown as Lead
}

function leadFilters(personStatus: 'ALL' | PersonStatus): LeadFilters {
  return { search: '', stage: 'ALL', sourceId: 'ALL', ownerId: 'ALL', personStatus, range: 'all' }
}

describe('filterLeads personStatus', () => {
  const rows = [lead({ isBlacklisted: false }), lead({ isBlacklisted: true }), lead({ isBlacklisted: false })]

  it('returns everything for ALL', () => {
    expect(filterLeads(rows, leadFilters('ALL'))).toHaveLength(3)
  })

  it('returns only active people for ACTIVE', () => {
    expect(filterLeads(rows, leadFilters('ACTIVE')).every((l) => !l.isBlacklisted)).toBe(true)
    expect(filterLeads(rows, leadFilters('ACTIVE'))).toHaveLength(2)
  })

  it('returns only blacklisted people for BLACKLISTED', () => {
    const filtered = filterLeads(rows, leadFilters('BLACKLISTED'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].isBlacklisted).toBe(true)
  })

  it('combines with other filters', () => {
    const stageFiltered = filterLeads(rows, {
      ...leadFilters('BLACKLISTED'),
      stage: 'WON'
    })
    expect(stageFiltered).toHaveLength(0)
  })
})

function customerRow(isBlacklisted: boolean, status: CustomerRow['status'] = 'ACTIVE'): CustomerRow {
  return {
    customer: {
      id: `c-${Math.random()}`,
      name: 'Person',
      phone: '9000000000',
      email: 'p@x.com',
      isBlacklisted,
      memberships: [],
      ownerId: undefined
    },
    status,
    membershipCount: 0
  } as unknown as CustomerRow
}

function customerFilters(personStatus: 'ALL' | PersonStatus): CustomerFilters {
  return { search: '', status: 'ALL', plan: 'ALL', ownerId: 'ALL', personStatus }
}

describe('filterCustomers personStatus', () => {
  const rows = [customerRow(false), customerRow(true), customerRow(false)]

  it('filters by blacklist state', () => {
    expect(filterCustomers(rows, customerFilters('ALL'))).toHaveLength(3)
    expect(filterCustomers(rows, customerFilters('ACTIVE')).every((r) => !r.customer.isBlacklisted)).toBe(true)
    expect(filterCustomers(rows, customerFilters('ACTIVE'))).toHaveLength(2)
    expect(filterCustomers(rows, customerFilters('BLACKLISTED'))).toHaveLength(1)
  })
})

function membershipRow(isBlacklisted: boolean, status: MembershipRow['status'] = 'ACTIVE'): MembershipRow {
  return {
    id: `m-${Math.random()}`,
    customerId: 'c-1',
    customerName: 'Person',
    isBlacklisted,
    plan: 'Monthly',
    priceMinor: 1000,
    discountMinor: 0,
    registrationFeeMinor: 0,
    billingFrequency: 'MONTHLY',
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    status,
    freezeCount: 0
  } as MembershipRow
}

function membershipFilters(personStatus: 'ALL' | PersonStatus): MembershipFilters {
  return { search: '', status: 'ALL', plan: 'ALL', personStatus }
}

describe('filterMemberships personStatus', () => {
  const rows = [membershipRow(false), membershipRow(true), membershipRow(false)]

  it('filters by blacklist state', () => {
    expect(filterMemberships(rows, membershipFilters('ALL'))).toHaveLength(3)
    expect(
      filterMemberships(rows, membershipFilters('ACTIVE')).every((r) => !r.isBlacklisted)
    ).toBe(true)
    expect(filterMemberships(rows, membershipFilters('ACTIVE'))).toHaveLength(2)
    expect(filterMemberships(rows, membershipFilters('BLACKLISTED'))).toHaveLength(1)
  })
})