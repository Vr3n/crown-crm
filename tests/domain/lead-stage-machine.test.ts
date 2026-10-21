import { describe, it, expect } from 'vitest'
import {
  LeadStageMachine,
  deriveLeadStatus,
  localDayUtcRange,
  DEFAULT_TIMEZONE
} from '../../src/main/domain/lead'
import type { LeadStage } from '../../src/main/domain/lead'
import { InvalidStateTransitionError } from '../../src/main/domain/errors'

/**
 * Pure domain tests for the sales stage machine and derived helpers. No SQLite,
 * no Electron — just business rules, per guidelines §23 (domain tests).
 */

function stage(partial: Partial<LeadStage>): LeadStage {
  return {
    id: 1,
    name: 'X',
    sortOrder: 0,
    isInitial: false,
    isWon: false,
    isLost: false,
    suppressFollowups: false,
    active: true,
    ...partial
  }
}

const NEW = stage({ id: 1, name: 'NEW', sortOrder: 0, isInitial: true })
const CONTACTED = stage({ id: 2, name: 'CONTACTED', sortOrder: 1 })
const NEGOTIATION = stage({ id: 4, name: 'NEGOTIATION', sortOrder: 3 })
const WON = stage({ id: 5, name: 'WON', sortOrder: 4, isWon: true })
const LOST = stage({ id: 6, name: 'LOST', sortOrder: 5, isLost: true })

function machine(...stages: LeadStage[]): LeadStageMachine {
  return new LeadStageMachine(stages)
}

describe('LeadStageMachine.initialStage', () => {
  it('returns the active initial stage', () => {
    expect(machine(NEW, CONTACTED).initialStage()).toEqual(NEW)
  })

  it('throws when no stage is flagged initial', () => {
    expect(() => machine(CONTACTED).initialStage()).toThrow(InvalidStateTransitionError)
  })

  it('ignores an initial stage that is inactive', () => {
    expect(() =>
      machine(stage({ id: 9, isInitial: true, active: false }), CONTACTED).initialStage()
    ).toThrow(InvalidStateTransitionError)
  })
})

describe('LeadStageMachine.terminalStage', () => {
  it('finds the active lost stage', () => {
    expect(machine(NEW, LOST).terminalStage('isLost')).toEqual(LOST)
  })

  it('throws when no lost stage is configured', () => {
    expect(() => machine(NEW).terminalStage('isLost')).toThrow(InvalidStateTransitionError)
  })
})

describe('LeadStageMachine.assertMoveAllowed', () => {
  it('allows a forward move with an activity', () => {
    expect(() => machine(NEW, CONTACTED).assertMoveAllowed(NEW, CONTACTED, true)).not.toThrow()
  })

  it('allows a backward move between intermediate stages with an activity', () => {
    expect(() =>
      machine(NEW, CONTACTED, NEGOTIATION).assertMoveAllowed(NEGOTIATION, CONTACTED, true)
    ).not.toThrow()
  })

  it('rejects any move without a recorded activity', () => {
    expect(() => machine(NEW, CONTACTED).assertMoveAllowed(NEW, CONTACTED, false)).toThrow(
      InvalidStateTransitionError
    )
  })

  it('rejects a move targeting a WON stage', () => {
    expect(() => machine(NEW, WON).assertMoveAllowed(NEW, WON, true)).toThrow(
      InvalidStateTransitionError
    )
  })

  it('rejects a move targeting a LOST stage', () => {
    expect(() => machine(NEW, LOST).assertMoveAllowed(NEW, LOST, true)).toThrow(
      InvalidStateTransitionError
    )
  })

  it('rejects a move out of a terminal stage (WON)', () => {
    expect(() => machine(NEW, WON).assertMoveAllowed(WON, NEW, true)).toThrow(
      InvalidStateTransitionError
    )
  })

  it('allows a win-back move out of LOST', () => {
    expect(() => machine(NEW, LOST).assertMoveAllowed(LOST, NEW, true)).not.toThrow()
    expect(() => machine(NEW, CONTACTED, LOST).assertMoveAllowed(LOST, CONTACTED, true)).not.toThrow()
  })

  it('rejects an inactive source stage', () => {
    const inactive = stage({ id: 9, active: false })
    expect(() => machine(inactive, CONTACTED).assertMoveAllowed(inactive, CONTACTED, true)).toThrow(
      InvalidStateTransitionError
    )
  })

  it('rejects an inactive target stage', () => {
    const inactive = stage({ id: 9, active: false })
    expect(() => machine(NEW, inactive).assertMoveAllowed(NEW, inactive, true)).toThrow(
      InvalidStateTransitionError
    )
  })
})

describe('LeadStageMachine.assertCanMarkLost', () => {
  it('allows marking an intermediate lead lost', () => {
    expect(() => machine(NEGOTIATION, LOST).assertCanMarkLost(NEGOTIATION)).not.toThrow()
  })

  it('rejects marking an already-terminal lead lost', () => {
    expect(() => machine(WON).assertCanMarkLost(WON)).toThrow(InvalidStateTransitionError)
    expect(() => machine(LOST).assertCanMarkLost(LOST)).toThrow(InvalidStateTransitionError)
  })
})

describe('deriveLeadStatus', () => {
  it('derives WON/LOST from terminal flags and OPEN otherwise', () => {
    expect(deriveLeadStatus(WON)).toBe('WON')
    expect(deriveLeadStatus(LOST)).toBe('LOST')
    expect(deriveLeadStatus(NEW)).toBe('OPEN')
    expect(deriveLeadStatus(CONTACTED)).toBe('OPEN')
  })
})

describe('suppressFollowups flag', () => {
  const DND = stage({ id: 10, name: 'DO_NOT_DISTURB', suppressFollowups: true })
  const NOT_INTERESTED = stage({ id: 11, name: 'NOT_INTERESTED', suppressFollowups: true })

  it('DND and Not Interested stages are not terminal', () => {
    expect(DND.isWon).toBe(false)
    expect(DND.isLost).toBe(false)
    expect(NOT_INTERESTED.isWon).toBe(false)
    expect(NOT_INTERESTED.isLost).toBe(false)
  })

  it('DND stage has suppressFollowups=true', () => {
    expect(DND.suppressFollowups).toBe(true)
  })

  it('Not Interested stage has suppressFollowups=true', () => {
    expect(NOT_INTERESTED.suppressFollowups).toBe(true)
  })

  it('allows moving TO DND from an intermediate stage', () => {
    expect(() => machine(NEW, DND).assertMoveAllowed(NEW, DND, true)).not.toThrow()
  })

  it('allows moving FROM DND back to an intermediate stage', () => {
    expect(() => machine(DND, CONTACTED).assertMoveAllowed(DND, CONTACTED, true)).not.toThrow()
  })

  it('allows moving TO Not Interested from an intermediate stage', () => {
    expect(() => machine(NEW, NOT_INTERESTED).assertMoveAllowed(NEW, NOT_INTERESTED, true)).not.toThrow()
  })

  it('allows moving FROM Not Interested back to an intermediate stage', () => {
    expect(() => machine(NOT_INTERESTED, CONTACTED).assertMoveAllowed(NOT_INTERESTED, CONTACTED, true)).not.toThrow()
  })

  it('rejects moving from a terminal stage to DND', () => {
    expect(() => machine(WON, DND).assertMoveAllowed(WON, DND, true)).toThrow(InvalidStateTransitionError)
  })

  it('allows a win-back move from LOST to Not Interested', () => {
    expect(() => machine(LOST, NOT_INTERESTED).assertMoveAllowed(LOST, NOT_INTERESTED, true)).not.toThrow()
  })
})

describe('localDayUtcRange', () => {
  it('returns a 24h window in UTC', () => {
    const { start, end } = localDayUtcRange('UTC', new Date('2026-08-17T12:00:00Z'))
    expect(start).toBe('2026-08-17T00:00:00.000Z')
    expect(end).toBe('2026-08-18T00:00:00.000Z')
  })

  it('shifts the window by the IST +05:30 offset', () => {
    const { start, end } = localDayUtcRange('Asia/Kolkata', new Date('2026-08-17T12:00:00Z'))
    expect(start).toBe('2026-08-16T18:30:00.000Z')
    expect(end).toBe('2026-08-17T18:30:00.000Z')
  })

  it('keeps an 11:00 PM IST due date on the correct local calendar day', () => {
    // 2026-08-17 23:00 IST = 17:30 UTC the same day
    const { start, end } = localDayUtcRange('Asia/Kolkata', new Date('2026-08-17T12:00:00Z'))
    expect('2026-08-17T17:30:00.000Z' >= start).toBe(true)
    expect('2026-08-17T17:30:00.000Z' < end).toBe(true)
  })

  it('defaults to a zero offset for an unknown timezone', () => {
    const { start } = localDayUtcRange('Not/AZone', new Date('2026-08-17T12:00:00Z'))
    expect(start).toBe('2026-08-17T00:00:00.000Z')
  })

  it('exports a sane default timezone constant', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Kolkata')
  })
})
