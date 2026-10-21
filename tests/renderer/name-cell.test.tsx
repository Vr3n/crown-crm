import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NameCell } from '@/features/dashboard/components/name-cell'
import { StageBadge } from '@/features/leads/components/stage-badge'
import { renderWithClient } from './setup'

/**
 * NameCell: the dashboard lead cell shows the name with strongest weight plus
 * an optional context line underneath (the lead's pipeline stage), so a
 * stage change is visible without opening the lead.
 */

describe('NameCell', () => {
  it('renders the name with the stage badge underneath', () => {
    renderWithClient(
      <NameCell name="Giovanni Castrovilli" personId={7} subtext={<StageBadge stage="LOST" />} />
    )

    expect(screen.getByText('Giovanni Castrovilli')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toBeInTheDocument()
  })

  it('renders the subtext without an avatar when there is no personId', () => {
    renderWithClient(<NameCell name="Walk-in" subtext={<StageBadge stage="NEW" />} />)

    expect(screen.getByText('Walk-in')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('layers the blacklist marker on the stage badge', () => {
    renderWithClient(
      <NameCell
        name="Giovanni Castrovilli"
        personId={7}
        subtext={<StageBadge stage="LOST" isBlacklisted />}
      />
    )

    expect(screen.getByLabelText('Blacklisted')).toBeInTheDocument()
  })
})
