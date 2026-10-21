import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/shared/contracts/errors'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import { NewLeadDialog } from '@/features/leads/components/new-lead-dialog'
import { renderWithClient } from './setup'

const ownerSession: SessionContextValue = {
  organizationId: 1,
  organizationSlug: 'demo-gym',
  organizationName: 'Demo Gym',
  userId: 1,
  userFullName: 'Priya Verma',
  userEmail: 'priya@demo.com',
  roleId: 1,
  roleName: 'Owner',
  isSuper: true,
  permissions: ['settings.manage'],
  onSignOut: vi.fn()
}

const salesSession: SessionContextValue = {
  ...ownerSession,
  roleName: 'Sales',
  isSuper: false,
  permissions: ['lead.view']
}

function renderDialog(): ReturnType<typeof renderWithClient> & {
  onOpenChange: ReturnType<typeof vi.fn>
} {
  const onOpenChange = vi.fn()
  const utils = renderWithClient(
    <SessionProvider value={ownerSession} onSignOut={vi.fn()}>
      <NewLeadDialog open onOpenChange={onOpenChange} />
    </SessionProvider>
  )
  return { ...utils, onOpenChange }
}

const createButton = (): HTMLElement => screen.getByRole('button', { name: 'Create lead' })
const nameInput = (): HTMLElement => screen.getByLabelText(/^Name/)
const phoneInput = (): HTMLElement => screen.getByLabelText(/^Phone/)
const sourceTrigger = (): HTMLElement => screen.getByRole('combobox', { name: /^Source/ })
const planTrigger = (): HTMLElement => screen.getByRole('combobox', { name: /Plan interest/ })
const goalTrigger = (): HTMLElement => screen.getByRole('combobox', { name: /^Goal/ })
const sourceSearch = (): HTMLElement => screen.getByPlaceholderText('Search or add a source…')
const planSearch = (): HTMLElement => screen.getByPlaceholderText('Search plans…')
const goalSearch = (): HTMLElement => screen.getByPlaceholderText('Search or add a goal…')

async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: () => HTMLElement,
  search: () => HTMLElement,
  query: string,
  optionName: string
): Promise<void> {
  await user.click(trigger())
  await user.type(search(), query)
  await user.click(await screen.findByRole('option', { name: optionName }, { timeout: 3000 }))
}

async function addOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: () => HTMLElement,
  search: () => HTMLElement,
  query: string
): Promise<void> {
  await user.click(trigger())
  await user.type(search(), query)
  await user.click(await screen.findByRole('option', { name: `Add ${query}` }, { timeout: 3000 }))
}

async function pickSource(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  optionName: string
): Promise<void> {
  await pickOption(user, sourceTrigger, sourceSearch, query, optionName)
}

/** Fill the required fields and pick an existing source so the form can submit. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(nameInput(), 'Rahul Mehta')
  await user.type(phoneInput(), '9876501234')
  await pickSource(user, 'walk', 'Walk-in')
}

// The combobox searches over a real 300ms debounce, so these interactive tests
// need more headroom than the 5s default when the suite runs in parallel.
describe('NewLeadDialog', { timeout: 20000 }, () => {
  it('keeps the submit button disabled until the required fields are valid', async () => {
    renderDialog()
    const user = userEvent.setup()

    expect(createButton()).toBeDisabled()

    await user.type(nameInput(), 'Rahul Mehta')
    await user.type(phoneInput(), '9876501234')

    // No source picked yet — the combobox holds no value, so submit stays gated.
    expect(createButton()).toBeDisabled()

    await pickSource(user, 'walk', 'Walk-in')
    await waitFor(() => expect(createButton()).toBeEnabled())
  })

  it('reacts live: red while a field is incomplete, green once it is valid', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(nameInput(), 'R')

    // completeWhen flips as soon as there is input, so the field evaluates live.
    expect(screen.getByText('Enter the person\u2019s full name')).toBeInTheDocument()
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).not.toHaveAttribute('data-valid')

    await user.type(nameInput(), 'ahul Mehta')

    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(nameInput()).toHaveAttribute('data-valid', 'true')
    expect(screen.queryByText('Enter the person\u2019s full name')).not.toBeInTheDocument()
  })

  it('shows a live phone counter and strips non-digit input', async () => {
    renderDialog()
    const user = userEvent.setup()

    expect(screen.getByText('10 digits remaining')).toBeInTheDocument()

    await user.type(phoneInput(), '98')
    expect(screen.getByText('8 digits remaining')).toBeInTheDocument()

    await user.type(phoneInput(), '76501234')
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).toHaveValue('9876501234')

    // Extra digits beyond the 10-digit cap are dropped.
    await user.type(phoneInput(), '555')
    expect(phoneInput()).toHaveValue('9876501234')
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('explains a too-short phone with a granular error after blur', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '98765012')
    await user.tab()

    expect(screen.getByText('Enter all 10 digits')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createButton()).toBeDisabled()
  })

  it('flags a wrong starting digit immediately, without waiting for 10 digits', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '5')

    expect(screen.getByText('Start with 6-9 (mobile) or 0/2 (landline)')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createButton()).toBeDisabled()
  })

  it('accepts a landline starting with 0 (mobile or landline)', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '0221234567')

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).not.toHaveAttribute('aria-invalid')
    expect(phoneInput()).toHaveAttribute('data-valid', 'true')
  })

  it('accepts a landline starting with 2', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '2212345678')

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('data-valid', 'true')
  })

  it('wires the helper line through aria-describedby', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.click(phoneInput())
    await user.tab()

    const phone = phoneInput()
    expect(phone).toHaveAttribute('aria-describedby', 'phone-error')
    expect(document.getElementById('phone-error')).toHaveTextContent('Mobile number is required')
  })

  it('treats email as optional but validates it granularly once typed', async () => {
    renderDialog()
    const user = userEvent.setup()

    const email = screen.getByLabelText(/^Email/)

    // Optional: an empty email is not an error.
    await user.click(email)
    await user.tab()
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument()

    await user.type(email, 'rahul.example.com')
    await user.tab()
    expect(screen.getByText('Email must contain an @')).toBeInTheDocument()

    await user.type(email, 'rahul@example.com')
    expect(email).toHaveAttribute('data-valid', 'true')
    expect(screen.queryByText('Email must contain an @')).not.toBeInTheDocument()
  })

  it('creates the lead with the full payload, plan/goal/notes included', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)
    await user.type(screen.getByLabelText(/^Email/), 'rahul@example.com')
    await pickOption(user, planTrigger, planSearch, 'annual', 'Annual Premium')
    await pickOption(user, goalTrigger, goalSearch, 'weight', 'Weight loss')
    await user.type(screen.getByLabelText(/^Notes/), 'Wants the morning batch')

    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith({
        fullName: 'Rahul Mehta',
        phone: '9876501234',
        email: 'rahul@example.com',
        sourceId: 1,
        planId: 101,
        goal: 'Weight loss',
        notes: 'Wants the morning batch'
      })
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('surfaces a backend ApiError inline instead of a toast', async () => {
    vi.mocked(window.api.leads.create).mockRejectedValueOnce(
      new ApiError('CONFLICT', 'A lead with this phone already exists')
    )

    renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)
    await user.click(createButton())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A lead with this phone already exists')
    })
    expect(screen.queryByText('Created!')).not.toBeInTheDocument()
  })

  it('does not call create when the form is invalid', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(nameInput(), 'Rahul Mehta')
    await user.type(phoneInput(), '98765012')

    expect(createButton()).toBeDisabled()
    expect(window.api.leads.create).not.toHaveBeenCalled()
  })

  it('searches the backend for the source vocabulary instead of the whole list', async () => {
    renderDialog()
    const user = userEvent.setup()

    // Nothing is seeded — the trigger shows its placeholder and submit is gated.
    expect(sourceTrigger()).toHaveTextContent('Where did they come from?')
    expect(createButton()).toBeDisabled()

    await user.click(sourceTrigger())
    await user.type(sourceSearch(), 'inst')

    await waitFor(() => expect(window.api.leads.searchSources).toHaveBeenCalledWith('inst'))
    await user.click(await screen.findByRole('option', { name: 'Instagram' }))
    expect(sourceTrigger()).toHaveTextContent('Instagram')
  })

  it('searches the backend for plan and goal suggestions', async () => {
    renderDialog()
    const user = userEvent.setup()

    // Nothing is seeded in the plan/goal fields either.
    expect(planTrigger()).toHaveTextContent('e.g. Annual Premium')
    expect(goalTrigger()).toHaveTextContent('e.g. Weight loss')

    await user.click(planTrigger())
    await user.type(planSearch(), 'annual')
    await waitFor(() => expect(window.api.leads.searchPlanInterests).toHaveBeenCalledWith('annual'))
    await user.click(await screen.findByRole('option', { name: 'Annual Premium' }))
    expect(planTrigger()).toHaveTextContent('Annual Premium')

    await user.click(goalTrigger())
    await user.type(goalSearch(), 'weight')
    await waitFor(() => expect(window.api.leads.searchGoals).toHaveBeenCalledWith('weight'))
    await user.click(await screen.findByRole('option', { name: 'Weight loss' }))
    expect(goalTrigger()).toHaveTextContent('Weight loss')
  })

  it('does not offer to create a plan — the catalog picker is pick-only', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.click(planTrigger())
    await user.type(planSearch(), 'strength')
    await waitFor(() =>
      expect(window.api.leads.searchPlanInterests).toHaveBeenCalledWith('strength')
    )
    expect(screen.queryByRole('option', { name: 'Add strength' })).not.toBeInTheDocument()
  })

  it('picks a plan from the catalog but still creates a brand-new goal as free text', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)

    // Plans are real catalog rows — pick an existing one, no free-text creation.
    await pickOption(user, planTrigger, planSearch, 'monthly', 'Monthly Basic')
    await addOption(user, goalTrigger, goalSearch, 'Endurance')
    expect(planTrigger()).toHaveTextContent('Monthly Basic')
    expect(goalTrigger()).toHaveTextContent('Endurance')

    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 102, goal: 'Endurance' })
      )
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('lets the user pick a source and submits it', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)

    await pickSource(user, 'inst', 'Instagram')
    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 2 }))
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('creates a brand-new source on the fly and submits its returned id', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await user.type(nameInput(), 'Rahul Mehta')
    await user.type(phoneInput(), '9876501234')

    await user.click(sourceTrigger())
    await user.type(sourceSearch(), 'corporate')
    await user.click(await screen.findByRole('option', { name: 'Add corporate' }))

    await waitFor(() =>
      expect(window.api.leads.createSource).toHaveBeenCalledWith({ name: 'corporate' })
    )
    expect(sourceTrigger()).toHaveTextContent('corporate')

    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 99 })
      )
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('hides the add-option for a viewer without settings.manage but still searches', async () => {
    const onOpenChange = vi.fn()
    renderWithClient(
      <SessionProvider value={salesSession} onSignOut={vi.fn()}>
        <NewLeadDialog open onOpenChange={onOpenChange} />
      </SessionProvider>
    )
    const user = userEvent.setup()

    await user.click(sourceTrigger())
    await user.type(sourceSearch(), 'corporate')

    await waitFor(() => expect(window.api.leads.searchSources).toHaveBeenCalledWith('corporate'))
    expect(screen.queryByRole('option', { name: 'Add corporate' })).not.toBeInTheDocument()
    expect(await screen.findByText('No results found.')).toBeInTheDocument()
  })

  it('shows the required error and disables submit once a picked source is cleared', async () => {
    renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)
    expect(sourceTrigger()).toHaveTextContent('Walk-in')

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))

    await waitFor(() => expect(screen.getByText('Choose a source')).toBeInTheDocument())
    expect(sourceTrigger()).toHaveAttribute('aria-invalid', 'true')
    expect(sourceTrigger()).toHaveTextContent('Where did they come from?')
    expect(createButton()).toBeDisabled()
  })
})
