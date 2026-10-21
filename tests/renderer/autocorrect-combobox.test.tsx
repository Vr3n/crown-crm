import { useState } from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  AutocorrectCombobox,
  type AutocorrectOption,
  type CreateOption,
  type SearchOptions
} from '@/components/autocorrect-combobox'
import { renderWithClient } from './setup'

const customers: AutocorrectOption<string>[] = [
  { id: 'acme', label: 'Acme' },
  { id: 'globex', label: 'Globex' },
  { id: 'initech', label: 'Initech' }
]

const defaultSearch: SearchOptions<string> = async (query) => {
  const normalized = query.trim().toLocaleLowerCase()
  return customers.filter((c) => c.label.toLocaleLowerCase().includes(normalized))
}

const defaultCreate: CreateOption<string> = async (label) => ({
  id: `new-${label}`,
  label,
  description: 'Created just now'
})

interface HarnessProps {
  search?: SearchOptions<string>
  create?: CreateOption<string>
  onChange?: (value: string | null) => void
  onBlur?: () => void
  onSubmit?: () => void
  minSearchLength?: number
  debounceMs?: number
  disabled?: boolean
  canCreate?: boolean
  onCreated?: (option: AutocorrectOption<string>) => void
}

/**
 * Mimics the TanStack Form contract the combobox adapts to: the field stores
 * only the backend ID, onChange re-validates (empty value ⇒ error), and blur
 * marks the field touched. Wrapped in a `<form>` so Enter-submission behaviour
 * can be asserted.
 */
function Harness({
  search,
  create,
  onChange,
  onBlur,
  onSubmit,
  minSearchLength = 2,
  debounceMs,
  disabled,
  canCreate,
  onCreated
}: HarnessProps): React.JSX.Element {
  const [state, setState] = useState<{
    value: string | null
    isTouched: boolean
    errors: unknown[]
  }>({ value: null, isTouched: false, errors: [] })

  const field = {
    name: 'customerId',
    state: {
      value: state.value,
      meta: {
        isTouched: state.isTouched,
        isValid: state.errors.length === 0,
        errors: state.errors
      }
    },
    handleChange: (next: string | null) => {
      onChange?.(next)
      setState((s) => ({
        ...s,
        value: next,
        errors: next ? [] : ['Please select a customer.']
      }))
    },
    handleBlur: () => {
      onBlur?.()
      setState((s) => ({
        ...s,
        isTouched: true,
        errors: s.value ? [] : ['Please select a customer.']
      }))
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSubmit?.()
      }}
    >
      <AutocorrectCombobox
        field={field}
        search={search ?? defaultSearch}
        create={create ?? defaultCreate}
        label="Customer"
        description="Pick an existing customer or add a new one"
        placeholder="Select a customer"
        minSearchLength={minSearchLength}
        debounceMs={debounceMs}
        disabled={disabled}
        canCreate={canCreate}
        onCreated={onCreated}
      />
    </form>
  )
}

const trigger = (): HTMLElement => screen.getByRole('combobox')
const searchInput = (): HTMLElement => screen.getByPlaceholderText('Type to search…')

async function openAndType(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.click(trigger())
  await user.type(searchInput(), text)
}

describe('AutocorrectCombobox', () => {
  it('renders the labelled trigger with the placeholder and does not search while closed', () => {
    const search = vi.fn(defaultSearch)
    renderWithClient(<Harness search={search} />)

    expect(screen.getByLabelText('Customer')).toBe(trigger())
    expect(trigger()).toHaveTextContent('Select a customer')
    expect(trigger()).toHaveAttribute('role', 'combobox')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-controls')
    expect(search).not.toHaveBeenCalled()
  })

  it('debounces the search and fires it once with the final query', async () => {
    const search = vi.fn(defaultSearch)
    renderWithClient(<Harness search={search} debounceMs={30} />)
    const user = userEvent.setup()

    await openAndType(user, 'acme')

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    expect(search).toHaveBeenCalledWith('acme', expect.any(AbortSignal))
  })

  it('does not search below the minimum query length', async () => {
    const search = vi.fn(defaultSearch)
    renderWithClient(<Harness search={search} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'ab')
    await waitFor(() => expect(search).toHaveBeenCalledWith('ab', expect.anything()))

    await user.clear(searchInput())
    await user.type(searchInput(), 'a')
    await waitFor(() => expect(searchInput()).toHaveValue('a'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(search).not.toHaveBeenCalledWith('a', expect.anything())
    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument()
  })

  it('shows a loading state and announces it while the request is pending', async () => {
    let resolve!: (options: AutocorrectOption<string>[]) => void
    const search = vi.fn(
      () =>
        new Promise<AutocorrectOption<string>[]>((res) => {
          resolve = res
        })
    )
    renderWithClient(<Harness search={search} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'ac')

    expect(await screen.findByText('Searching…')).toBeInTheDocument()
    expect(screen.getByText('Searching for ac')).toBeInTheDocument()

    resolve([{ id: 'acme', label: 'Acme' }])
    await waitFor(() => expect(screen.getByRole('option', { name: 'Acme' })).toBeInTheDocument())
  })

  it('selects an existing option and stores only its backend ID in the field', async () => {
    const search = vi.fn(defaultSearch)
    const onChange = vi.fn()
    renderWithClient(<Harness search={search} onChange={onChange} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'globex')

    await user.click(await screen.findByRole('option', { name: 'Globex' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('globex'))
    expect(onChange).not.toHaveBeenCalledWith('Globex')
    expect(trigger()).toHaveTextContent('Globex')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows an add option for a query without an exact match, creates it, and auto-selects the returned ID', async () => {
    const search = vi.fn(defaultSearch)
    const create = vi.fn(defaultCreate)
    const onChange = vi.fn()
    renderWithClient(<Harness search={search} create={create} onChange={onChange} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')

    await user.click(await screen.findByRole('option', { name: 'Add vitality' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith('vitality', undefined))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('new-vitality'))
    await waitFor(() => expect(trigger()).toHaveTextContent('vitality'))
    expect(screen.queryByPlaceholderText('Type to search…')).not.toBeInTheDocument()
  })

  it('hides the add option for an exact case-insensitive match', async () => {
    const search = vi.fn(defaultSearch)
    renderWithClient(<Harness search={search} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'GLOBEX')

    await waitFor(() => expect(search).toHaveBeenCalledWith('GLOBEX', expect.anything()))
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Globex')
    expect(options[0]).not.toHaveTextContent('Add')
  })

  it('keeps the popover open and the query intact when creation fails', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('backend boom'))
    renderWithClient(<Harness create={create} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')
    await user.click(await screen.findByRole('option', { name: 'Add vitality' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not create it. Please try again.')
    )
    expect(searchInput()).toHaveValue('vitality')
    expect(screen.getByRole('option', { name: 'Add vitality' })).toBeInTheDocument()
  })

  it('renders an accessible error with retry when the search fails', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([customers[0]])
    renderWithClient(<Harness search={search} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'ac')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not search. Please try again.')
    )

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Acme' })).toBeInTheDocument())
  })

  it('shows the validation error once the field is blurred without a value', async () => {
    const onBlur = vi.fn()
    renderWithClient(<Harness onBlur={onBlur} debounceMs={0} />)
    const user = userEvent.setup()

    await user.click(trigger())
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.getByText('Please select a customer.')).toBeInTheDocument())
    expect(trigger()).toHaveAttribute('aria-invalid', 'true')
    expect(onBlur).toHaveBeenCalled()
  })

  it('clears the field value from the trigger and shows the placeholder again', async () => {
    const search = vi.fn(defaultSearch)
    const onChange = vi.fn()
    renderWithClient(<Harness search={search} onChange={onChange} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'globex')
    await user.click(await screen.findByRole('option', { name: 'Globex' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('globex'))

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(trigger()).toHaveTextContent('Select a customer')
  })

  it('selects the highlighted option with Enter without submitting the form', async () => {
    const search = vi.fn(defaultSearch)
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    renderWithClient(
      <Harness search={search} onChange={onChange} onSubmit={onSubmit} debounceMs={0} />
    )
    const user = userEvent.setup()

    await openAndType(user, 'globex')
    const option = await screen.findByRole('option', { name: 'Globex' })
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'))

    await user.keyboard('{Enter}')

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('globex'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('supports arrow-key navigation and Enter selection', async () => {
    const search = vi.fn(defaultSearch)
    const onChange = vi.fn()
    renderWithClient(
      <Harness search={search} onChange={onChange} minSearchLength={1} debounceMs={0} />
    )
    const user = userEvent.setup()

    await openAndType(user, 'e')

    const options = await screen.findAllByRole('option')
    await waitFor(() => expect(options[0]).toHaveAttribute('aria-selected', 'true'))
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('initech'))
  })

  it('does not fire the create mutation more than once while pending', async () => {
    let resolve!: (option: AutocorrectOption<string>) => void
    const create = vi.fn(
      () =>
        new Promise<AutocorrectOption<string>>((res) => {
          resolve = res
        })
    )
    renderWithClient(<Harness create={create} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')
    const addOption = await screen.findByRole('option', { name: 'Add vitality' })
    await user.click(addOption)
    await user.click(addOption)

    expect(create).toHaveBeenCalledTimes(1)

    resolve({ id: 'new-vitality', label: 'vitality' })
  })

  it('announces the creation and keeps the status region present', async () => {
    const create = vi.fn(defaultCreate)
    renderWithClient(<Harness create={create} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')
    await user.click(await screen.findByRole('option', { name: 'Add vitality' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('hides the add option and shows the empty message when creation is not allowed', async () => {
    renderWithClient(<Harness canCreate={false} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')

    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: 'Add vitality' })).not.toBeInTheDocument()
  })

  it('still shows the add option for exact-match queries when creation is allowed', async () => {
    const search = vi.fn(defaultSearch)
    renderWithClient(<Harness search={search} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'acme')

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Acme')
    expect(options[0]).not.toHaveTextContent('Add')
  })

  it('invokes onCreated with the created option after selection', async () => {
    const create = vi.fn(defaultCreate)
    const onCreated = vi.fn()
    renderWithClient(<Harness create={create} onCreated={onCreated} debounceMs={0} />)
    const user = userEvent.setup()

    await openAndType(user, 'vitality')
    await user.click(await screen.findByRole('option', { name: 'Add vitality' }))

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-vitality', label: 'vitality' })
      )
    )
  })
})
