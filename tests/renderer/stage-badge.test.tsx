import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StageBadge } from '@/features/leads/components/stage-badge'

describe('StageBadge', () => {
  it('renders the stage label', () => {
    render(<StageBadge stage="NEW" />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('shows the blacklist marker only when isBlacklisted is true', () => {
    const { rerender } = render(<StageBadge stage="NEW" />)
    expect(screen.queryByLabelText('Blacklisted')).not.toBeInTheDocument()

    rerender(<StageBadge stage="NEW" isBlacklisted />)
    expect(screen.getByLabelText('Blacklisted')).toBeInTheDocument()
  })
})