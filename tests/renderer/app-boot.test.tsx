import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import App from '@/App'
import type { SessionContext } from '../../src/shared/contracts/identity'

vi.mock('@/features/license/components/license-gate', () => ({
  LicenseGate: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/AppRoutes', () => ({
  AppRoutes: () => <div>Dashboard shell</div>
}))

const SESSION: SessionContext = {
  companyId: 1,
  companySlug: 'acme',
  companyName: 'Acme Distributors',
  userId: 1,
  userFullName: 'Viren Patel',
  userEmail: 'owner@acme.in',
  roleId: 1,
  roleName: 'Owner',
  isSuper: true,
  permissions: []
}

const originalApi = window.api

beforeEach(() => {
  window.api = originalApi
})

afterEach(() => {
  window.api = originalApi
})

function renderApp(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  )
}

describe('App boot', () => {
  it('does not flash the login form while a remembered session loads', async () => {
    let resolveSession: (session: SessionContext) => void = () => undefined
    const pendingSession = new Promise<SessionContext>((resolve) => {
      resolveSession = resolve
    })
    const session = vi.fn(() => pendingSession)

    window.api = {
      identity: {
        status: vi.fn().mockResolvedValue('AUTHENTICATED'),
        session,
        logout: vi.fn().mockResolvedValue(undefined)
      }
    } as unknown as typeof window.api

    renderApp()

    // Status has resolved and the session request is in flight.
    await waitFor(() => expect(session).toHaveBeenCalled())
    expect(screen.queryByText('Open your books')).toBeNull()
    expect(screen.queryByText('Sign in')).toBeNull()

    resolveSession(SESSION)
    expect(await screen.findByText('Dashboard shell')).toBeInTheDocument()
  })

  it('shows the login form once the machine reports LOGIN_REQUIRED', async () => {
    window.api = {
      identity: {
        status: vi.fn().mockResolvedValue('LOGIN_REQUIRED'),
        session: vi.fn().mockResolvedValue(null),
        logout: vi.fn().mockResolvedValue(undefined)
      }
    } as unknown as typeof window.api

    renderApp()

    expect(await screen.findByText('Open your books')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard shell')).toBeNull()
  })
})
