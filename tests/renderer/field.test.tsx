import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Field, FormLegend } from '@/components/ui/field'

const HELP = {
  summary: 'The name printed on documents.',
  points: ['Use the legal name.', 'Required.']
}

describe('Field', () => {
  it('marks a required field for sighted and assistive users', () => {
    render(
      <Field id="party-name" label="Name" required>
        <input id="party-name" />
      </Field>
    )

    const label = screen.getByText('Name').closest('label')
    expect(label).toHaveTextContent('*')
    expect(label).toHaveTextContent('(required)')
  })

  it('renders the help affordance with an accessible name and description', () => {
    render(
      <Field id="party-gstin" label="GSTIN" help={HELP}>
        <input id="party-gstin" />
      </Field>
    )

    const help = screen.getByRole('button', { name: 'About GSTIN' })
    expect(help).toHaveAccessibleDescription(/legal name/i)
  })

  it('opens the help text on keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <Field id="party-gstin" label="GSTIN" help={HELP}>
        <input id="party-gstin" />
      </Field>
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'About GSTIN' })).toHaveFocus()
    expect(await screen.findByText('The name printed on documents.')).toBeInTheDocument()
  })

  it('shows the error instead of the hint and links it to the control', () => {
    render(
      <Field id="party-email" label="Email" hint="Optional" error="Enter a valid email">
        <input id="party-email" aria-describedby="party-email-error" />
      </Field>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email')
    expect(screen.queryByText('Optional')).not.toBeInTheDocument()
  })

  it('explains the required marker once per form', () => {
    render(<FormLegend />)
    expect(screen.getByText(/Required fields/)).toBeInTheDocument()
  })
})
