import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from '@/components/auth/AuthGate'
import type { SessionContext } from '../../src/shared/contracts/identity'

const SESSION: SessionContext = {
  companyId: 1,
  companySlug: 'acme',
  companyName: 'Acme Distributors',
  userId: 1,
  userFullName: 'John Ant Doe',
  userEmail: 'owner@acme.in',
  roleId: 1,
  roleName: 'Owner',
  isSuper: true,
  permissions: []
}

const originalApi = window.api

function installApi(): {
  setup: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
} {
  const setup = vi.fn().mockResolvedValue(SESSION)
  const login = vi.fn().mockResolvedValue(SESSION)
  window.api = { identity: { setup, login } } as unknown as typeof window.api
  return { setup, login }
}

function renderGate(
  status: 'SETUP_REQUIRED' | 'LOGIN_REQUIRED'
): ReturnType<typeof vi.fn> {
  const onAuthenticated = vi.fn()
  render(<AuthGate status={status} bootPending={false} onAuthenticated={onAuthenticated} />)
  return onAuthenticated
}

beforeEach(() => {
  installApi()
})

afterEach(() => {
  window.api = originalApi
})

describe('AuthGate setup form', () => {
  it('labels the owner field and shows the new placeholder', () => {
    renderGate('SETUP_REQUIRED')

    const owner = screen.getByLabelText(/Owner Full Name/)
    expect(owner).toHaveAttribute('placeholder', 'John Ant Doe')
    expect(screen.queryByText(/Owner name/)).not.toBeInTheDocument()
  })

  it('shows an error under every invalid field and focuses the first', async () => {
    const user = userEvent.setup()
    renderGate('SETUP_REQUIRED')

    await user.click(screen.getByRole('button', { name: 'Create company and sign in' }))

    expect(await screen.findByText('Company name is required')).toBeInTheDocument()
    expect(screen.getByText('Owner full name is required')).toBeInTheDocument()
    expect(screen.getByText('Owner email is required')).toBeInTheDocument()
    expect(screen.getByText('Create a password')).toBeInTheDocument()

    const businessName = screen.getByLabelText(/Business name/)
    expect(businessName).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(businessName).toHaveFocus())
  })

  it('does not mark an optional empty field as invalid', async () => {
    const user = userEvent.setup()
    renderGate('SETUP_REQUIRED')

    await user.click(screen.getByRole('button', { name: 'Create company and sign in' }))

    expect(screen.getByLabelText(/Mobile \(optional\)/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText(/GSTIN \(optional\)/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('Mobile number is required')).not.toBeInTheDocument()
  })

  it('marks a touched valid input as valid', async () => {
    const user = userEvent.setup()
    renderGate('SETUP_REQUIRED')

    const businessName = screen.getByLabelText(/Business name/)
    await user.type(businessName, 'Acme Distributors')
    await user.tab()

    await waitFor(() => expect(businessName).toHaveAttribute('data-valid', 'true'))
    expect(businessName).toHaveAttribute('aria-invalid', 'false')
  })

  it('clears the error and turns green once the field is corrected', async () => {
    const user = userEvent.setup()
    renderGate('SETUP_REQUIRED')

    await user.click(screen.getByRole('button', { name: 'Create company and sign in' }))
    expect(await screen.findByText('Company name is required')).toBeInTheDocument()

    const businessName = screen.getByLabelText(/Business name/)
    await user.type(businessName, 'Acme')

    await waitFor(() => expect(screen.queryByText('Company name is required')).toBeNull())
    expect(businessName).toHaveAttribute('data-valid', 'true')
  })

  it('rejects a partial GSTIN and an incomplete mobile', async () => {
    const user = userEvent.setup()
    renderGate('SETUP_REQUIRED')

    await user.type(screen.getByLabelText(/GSTIN \(optional\)/), '27AABFU')
    await user.type(screen.getByLabelText(/Mobile \(optional\)/), '98765')

    await waitFor(() =>
      expect(screen.getByText('GSTIN must be 15 characters')).toBeInTheDocument()
    )
    expect(screen.getByText('Enter all 10 digits')).toBeInTheDocument()
    expect(screen.getByLabelText(/GSTIN \(optional\)/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Mobile \(optional\)/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('submits the setup payload once every required field is valid', async () => {
    const { setup } = installApi()
    const onAuthenticated = renderGate('SETUP_REQUIRED')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Business name/), 'Acme Distributors')
    await user.type(screen.getByLabelText(/Owner Full Name/), 'John Ant Doe')
    await user.type(screen.getByLabelText(/Owner email/), 'owner@acme.in')
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Create company and sign in' }))

    await waitFor(() => expect(setup).toHaveBeenCalledTimes(1))
    expect(setup).toHaveBeenCalledWith({
      name: 'Acme Distributors',
      ownerFullName: 'John Ant Doe',
      ownerEmail: 'owner@acme.in',
      ownerPassword: 'correct-horse',
      stateCode: '27',
      gstin: undefined,
      phone: undefined,
      booksBeginDate: expect.any(String)
    })
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(SESSION))
  })
})

describe('AuthGate login form', () => {
  it('shows both errors and focuses the email field', async () => {
    const user = userEvent.setup()
    renderGate('LOGIN_REQUIRED')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()

    const email = screen.getByLabelText(/Email/)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(email).toHaveFocus())
  })

  it('marks a valid email green after blur', async () => {
    const user = userEvent.setup()
    renderGate('LOGIN_REQUIRED')

    const email = screen.getByLabelText(/Email/)
    await user.type(email, 'owner@acme.in')
    await user.tab()

    await waitFor(() => expect(email).toHaveAttribute('data-valid', 'true'))
  })

  it('submits the login payload', async () => {
    const { login } = installApi()
    const onAuthenticated = renderGate('LOGIN_REQUIRED')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Email/), 'owner@acme.in')
    await user.type(screen.getByLabelText(/^Password/), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'owner@acme.in',
        password: 'correct-horse'
      })
    )
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(SESSION))
  })

  it('keeps the banner for a failed sign in and does not focus a field', async () => {
    const { login } = installApi()
    login.mockRejectedValueOnce(new Error('That email or password is not right'))
    renderGate('LOGIN_REQUIRED')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/Email/), 'owner@acme.in')
    await user.type(screen.getByLabelText(/^Password/), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email or password is not right'
    )
    const email = screen.getByLabelText(/Email/)
    expect(email).toHaveAttribute('aria-invalid', 'false')
    expect(email).not.toHaveFocus()
  })
})
