import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ArrowDownLeft } from 'lucide-react'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusPill } from '@/components/ui/status-pill'
import { Balance } from '@/components/ui/balance'
import { InsightList } from '@/components/ui/insight-list'

describe('KpiCard', () => {
  it('shows label, value and context', () => {
    render(
      <KpiCard
        label="Receivables"
        value="₹12,000.00"
        context="3 customers"
        icon={ArrowDownLeft}
        tone="success"
      />
    )
    expect(screen.getByText('Receivables')).toBeInTheDocument()
    expect(screen.getByText('₹12,000.00')).toBeInTheDocument()
    expect(screen.getByText('3 customers')).toBeInTheDocument()
  })
})

describe('StatusPill', () => {
  it('renders its label', () => {
    render(<StatusPill tone="warning">Low</StatusPill>)
    expect(screen.getByText('Low')).toBeInTheDocument()
  })
})

describe('Balance', () => {
  it('marks a positive balance as Dr', () => {
    render(<Balance minor={1250} />)
    expect(screen.getByText(/12\.50/)).toBeInTheDocument()
    expect(screen.getByText('Dr')).toBeInTheDocument()
  })

  it('marks a negative balance as Cr', () => {
    render(<Balance minor={-500} />)
    expect(screen.getByText(/5\.00/)).toBeInTheDocument()
    expect(screen.getByText('Cr')).toBeInTheDocument()
  })

  it('mutes a zero balance', () => {
    render(<Balance minor={0} />)
    expect(screen.getByText(/0\.00/)).toBeInTheDocument()
  })
})

describe('InsightList', () => {
  it('shows an empty message when there are no items', () => {
    render(<InsightList items={[]} emptyText="All clear." />)
    expect(screen.getByText('All clear.')).toBeInTheDocument()
  })

  it('renders each item with a link', () => {
    render(
      <MemoryRouter>
        <InsightList
          items={[
            { id: 'a', tone: 'destructive', title: 'Overdue', href: '/x', icon: ArrowDownLeft }
          ]}
        />
      </MemoryRouter>
    )
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/x')
  })
})
