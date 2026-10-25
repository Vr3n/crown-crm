import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SetupChecklist } from '@/features/dashboard/components/setup-checklist'
import type { SetupStep } from '../../src/shared/contracts/dashboard'

const steps: SetupStep[] = [
  {
    id: 'parties',
    label: 'Add parties',
    detail: 'Customers, suppliers and their credit terms.',
    href: '/parties?action=new',
    cta: 'Add a party',
    done: false
  },
  {
    id: 'items',
    label: 'Add items',
    detail: 'HSN, unit, GST rate and selling price.',
    href: '/items?action=new',
    cta: 'Add an item',
    done: true
  }
]

function renderChecklist(setup: { done: number; total: number; steps: SetupStep[] }): {
  container: HTMLElement
} {
  return render(
    <MemoryRouter>
      <SetupChecklist setup={setup} />
    </MemoryRouter>
  )
}

describe('SetupChecklist', () => {
  it('disappears completely once every step is done', () => {
    const { container } = renderChecklist({
      done: 2,
      total: 2,
      steps: steps.map((step) => ({ ...step, done: true }))
    })
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Set up the books')).not.toBeInTheDocument()
  })

  it('links an open step at the action, not just the page', () => {
    renderChecklist({ done: 1, total: 2, steps })
    const link = screen.getByRole('link', { name: /Add parties/ })
    expect(link).toHaveAttribute('href', '/parties?action=new')
    expect(screen.getByText('Add a party')).toBeInTheDocument()
  })

  it('does not link a completed step', () => {
    renderChecklist({ done: 1, total: 2, steps })
    expect(screen.queryByRole('link', { name: /Add items/ })).not.toBeInTheDocument()
  })

  it('shows the next step and progress', () => {
    renderChecklist({ done: 1, total: 2, steps })
    expect(screen.getByText('Next: Add parties')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('counts done steps in the summary line', () => {
    renderChecklist({ done: 1, total: 2, steps })
    expect(screen.getByText(/1 of 2 steps done/)).toBeInTheDocument()
  })
})
