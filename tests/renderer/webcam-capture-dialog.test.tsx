import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { WebcamCaptureDialog } from '@/components/person/webcam-capture-dialog'
import { renderWithClient } from './setup'

/**
 * Camera failure must never freeze the app.
 *
 * Regression test for the `window.alert()` bug: when `getUserMedia` rejected,
 * the dialog called the synchronous blocking `alert()` and then closed itself,
 * freezing the Electron renderer (and the parent New Lead form with it).
 * The dialog must instead render an inline, non-blocking error state with
 * Close/Retry actions and keep the parent form interactive.
 */

function mockGetUserMedia(impl: () => Promise<MediaStream>): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
    writable: true
  })
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

beforeEach(() => {
  mockGetUserMedia(async () => fakeStream())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WebcamCaptureDialog camera failure', () => {
  it('renders an inline error (not window.alert) when permission is denied', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onOpenChange = vi.fn()
    mockGetUserMedia(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    })

    renderWithClient(<WebcamCaptureDialog open onOpenChange={onOpenChange} onCapture={vi.fn()} />)

    // Inline, non-blocking error state appears…
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/permission/i)

    // …no blocking alert() was ever called…
    expect(alertSpy).not.toHaveBeenCalled()

    // …and the dialog did NOT auto-close itself (parent form stays alive).
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    // Retry + Close actions are offered; Capture is gone while in error.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    const footer = document.querySelector('[data-slot="dialog-footer"]')
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^capture$/i })).not.toBeInTheDocument()
  })

  it('shows a friendly "no camera" message when no device exists', async () => {
    mockGetUserMedia(async () => {
      throw new DOMException('No device', 'NotFoundError')
    })

    renderWithClient(<WebcamCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no camera/i)
  })

  it('retry re-attempts getUserMedia and recovers on success', async () => {
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce(fakeStream())
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
      writable: true
    })
    const user = userEvent.setup()

    renderWithClient(<WebcamCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />)

    await screen.findByRole('alert')
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    // Capture is back once the camera is active.
    expect(screen.getByRole('button', { name: /^capture$/i })).toBeEnabled()
  })

  it('disables Capture while the camera is starting', () => {
    // Never-resolving getUserMedia keeps the dialog in the loading state.
    mockGetUserMedia(() => new Promise<MediaStream>(() => {}))

    renderWithClient(<WebcamCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^capture$/i })).toBeDisabled()
  })
})
