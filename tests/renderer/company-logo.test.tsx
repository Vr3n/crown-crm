import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompanyLogoAvatar } from '@/features/company/components/company-logo-avatar'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function renderAvatar(logo: string | null = null): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  render(
    <QueryClientProvider client={client}>
      <CompanyLogoAvatar name="Acme Distributors" logo={logo} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CompanyLogoAvatar', () => {
  it('shows initials when no logo is stored', () => {
    renderAvatar()
    expect(screen.getByText('AD')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove company logo' })).not.toBeInTheDocument()
  })

  it('renders the stored logo with an always-visible, labelled pen button', () => {
    renderAvatar(PNG)

    expect(screen.getByRole('img', { name: 'Acme Distributors logo' })).toHaveAttribute('src', PNG)
    expect(screen.getByRole('button', { name: 'Change company logo' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove company logo' })).toBeVisible()
    expect(screen.queryByText('AD')).not.toBeInTheDocument()
  })

  it('opens the labelled file picker from the pen button', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderAvatar()

    fireEvent.click(screen.getByRole('button', { name: 'Change company logo' }))

    expect(click).toHaveBeenCalledTimes(1)
    const input = screen.getByLabelText('Company logo file')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
  })

  it('asks for confirmation before removing the logo', async () => {
    const updateCompany = vi.fn().mockResolvedValue({})
    vi.stubGlobal('api', { identity: { updateCompany } })
    renderAvatar(PNG)

    fireEvent.click(screen.getByRole('button', { name: 'Remove company logo' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Remove company logo?')).toBeInTheDocument()
    expect(updateCompany).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(updateCompany).not.toHaveBeenCalled()
  })

  it('clears the logo only after the confirmation is accepted', async () => {
    const updateCompany = vi.fn().mockResolvedValue({})
    vi.stubGlobal('api', { identity: { updateCompany } })
    renderAvatar(PNG)

    fireEvent.click(screen.getByRole('button', { name: 'Remove company logo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove logo' }))

    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith({ logo: null }))
  })
})
