import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PhoneCall, CheckCircle2 } from 'lucide-react'
import { Timeline, type TimelineEntry } from '../../src/renderer/src/components/timeline'

const sampleEntries: TimelineEntry[] = [
  {
    id: '1',
    label: 'Phone call',
    date: '2026-08-21T10:30:00Z',
    description: 'Discussed membership options',
    icon: PhoneCall,
    iconTone: 'bg-primary/10 text-primary',
    badge: { label: 'Done', variant: 'success' },
    meta: 'by Priya · 2h ago'
  },
  {
    id: '2',
    label: 'Follow-up done',
    date: '2026-08-20T14:00:00Z',
    icon: CheckCircle2,
    iconTone: 'bg-success/15 text-success'
  },
  {
    id: '3',
    label: 'Lead created',
    date: '2026-08-19T09:00:00Z',
    description: 'Initial lead captured from walk-in'
  }
]

describe('Timeline', () => {
  it('renders all entries', () => {
    render(<Timeline entries={sampleEntries} />)
    expect(screen.getByText('Phone call')).toBeInTheDocument()
    expect(screen.getByText('Follow-up done')).toBeInTheDocument()
    expect(screen.getByText('Lead created')).toBeInTheDocument()
  })

  it('renders nothing for empty entries', () => {
    const { container } = render(<Timeline entries={[]} />)
    expect(container.querySelector('ol')).toBeNull()
  })

  it('marks the first entry as current by default', () => {
    render(<Timeline entries={sampleEntries} />)
    const firstEntry = screen.getByText('Phone call').closest('li')
    expect(firstEntry).toBeInTheDocument()
    // The first entry should have the primary background marker
    const markers = firstEntry!.querySelectorAll('span')
    const primaryMarker = Array.from(markers).find((m) => m.className.includes('bg-primary'))
    expect(primaryMarker).toBeDefined()
  })

  it('does not mark first entry as current when highlightCurrent is false', () => {
    render(<Timeline entries={sampleEntries} highlightCurrent={false} />)
    const firstEntry = screen.getByText('Phone call').closest('li')
    const markers = firstEntry!.querySelectorAll('span')
    // The current marker has ring-primary/20; custom iconTone does not
    const currentMarker = Array.from(markers).find((m) => m.className.includes('ring-primary/20'))
    expect(currentMarker).toBeUndefined()
  })

  it('renders badge when provided', () => {
    render(<Timeline entries={sampleEntries} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<Timeline entries={sampleEntries} />)
    expect(screen.getByText('Discussed membership options')).toBeInTheDocument()
    expect(screen.getByText('Initial lead captured from walk-in')).toBeInTheDocument()
  })

  it('renders meta when provided', () => {
    render(<Timeline entries={sampleEntries} />)
    expect(screen.getByText('by Priya · 2h ago')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Timeline entries={sampleEntries} className="test-class" />)
    expect(container.firstElementChild).toHaveClass('test-class')
  })

  it('renders connector rails between entries (not after last)', () => {
    const { container } = render(<Timeline entries={sampleEntries} />)
    const ol = container.querySelector('ol')
    // Connector rails are spans with w-px bg-border (vertical line), not icon SVGs
    const rails = ol!.querySelectorAll('span.w-px.bg-border')
    // 2 entries have rails (not the last one)
    expect(rails.length).toBe(2)
  })

  it('renders semantic list elements', () => {
    const { container } = render(<Timeline entries={sampleEntries} />)
    const ol = container.querySelector('ol[aria-label="Timeline"]')
    expect(ol).toBeInTheDocument()
    const items = ol!.querySelectorAll('li')
    expect(items.length).toBe(3)
  })
})
