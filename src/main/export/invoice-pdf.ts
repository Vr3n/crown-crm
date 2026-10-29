import { BrowserWindow, dialog } from 'electron'
import { is } from '@electron-toolkit/utils'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { ExportResult } from '../../shared/contracts/export'
import type { InvoiceDocument } from '../../shared/contracts/invoice'
import { buildInvoiceFilename } from './invoice-filename'
import { revealSavedFile } from './reveal'

/**
 * Prints one invoice document from a hidden renderer window.
 *
 * The visible window never changes route and never shows a flash of paper: a
 * second BrowserWindow loads the print route, waits for the document to say it
 * has finished rendering (fonts loaded, images decoded), prints it to a real
 * vector PDF with the CSS page size, and is destroyed in `finally`.
 */

const LOAD_TIMEOUT_MS = 20_000
const RENDER_TIMEOUT_MS = 20_000

interface PrintState {
  ready: boolean
  error?: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function printRouteHash(id: number): string {
  return `#/print/vouchers/${id}`
}

function createPrintWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    skipTaskbar: true,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      zoomFactor: 1,
      backgroundThrottling: false
    }
  })
}

async function loadPrintRoute(window: BrowserWindow, id: number): Promise<void> {
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const loaded = new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      contents.removeListener('did-finish-load', onFinish)
      contents.removeListener('did-fail-load', onFail)
    }
    const onFinish = (): void => {
      cleanup()
      resolve()
    }
    const onFail = (
      _event: Electron.Event,
      code: number,
      description: string,
      _url: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return
      cleanup()
      reject(new Error(`Could not load the invoice page (${description || code})`))
    }
    contents.once('did-finish-load', onFinish)
    contents.once('did-fail-load', onFail)
  })
  // The navigation promise rejects for the same failures `did-fail-load`
  // reports; keep it from becoming an unhandled rejection when both fire.
  loaded.catch(() => undefined)

  const navigation =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${printRouteHash(id)}`)
      : window.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: `/print/vouchers/${id}`
        })
  void navigation.catch(() => undefined)

  await withTimeout(loaded, LOAD_TIMEOUT_MS, 'The invoice page did not finish loading')
}

/**
 * The renderer marks `window.__invoicePrintState` after its query resolved and
 * after fonts and images settled. Polling that flag avoids printing a skeleton
 * or an empty table.
 */
async function waitForInvoiceRender(contents: WebContents): Promise<void> {
  const deadline = Date.now() + RENDER_TIMEOUT_MS
  let state: PrintState | null = null

  while (Date.now() < deadline) {
    if (contents.isDestroyed()) {
      throw new Error('The print window closed before the invoice rendered')
    }
    state = (await contents.executeJavaScript(
      'window.__invoicePrintState ?? null'
    )) as PrintState | null
    if (state) break
    await delay(100)
  }

  if (!state) {
    throw new Error('The invoice took too long to render. Try again.')
  }
  if (!state.ready) {
    throw new Error(state.error || 'The invoice could not be prepared for printing')
  }

  // Belt and braces: the renderer already awaited these, but a font or image
  // that loads after the flag must still be in the PDF.
  await contents.executeJavaScript(`(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images).map((image) =>
        typeof image.decode === 'function' ? image.decode().catch(() => undefined) : undefined
      )
    )
    return true
  })()`)
}

export interface ExportInvoicePdfOptions {
  document: InvoiceDocument
  /** The window that should own the save dialog, if there is one. */
  parent: BrowserWindow | null
  now?: Date
}

/**
 * Resolves `{ saved: false }` when the user cancels the save dialog. Throws when
 * the print route cannot load or render, so the caller can surface the reason.
 */
export async function exportInvoicePdf(options: ExportInvoicePdfOptions): Promise<ExportResult> {
  const window = createPrintWindow()
  try {
    await loadPrintRoute(window, options.document.id)
    await waitForInvoiceRender(window.webContents)

    if (window.isDestroyed()) {
      throw new Error('The print window closed before the invoice was printed')
    }

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true
    })

    const filename = buildInvoiceFilename({
      partyName: options.document.party?.name ?? null,
      type: options.document.type,
      number: options.document.number,
      at: options.now ?? new Date()
    })

    const target = await dialog.showSaveDialog(options.parent ?? window, {
      title: 'Save invoice PDF',
      defaultPath: filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (target.canceled || !target.filePath) return { saved: false }

    await writeFile(target.filePath, pdf)
    revealSavedFile(target.filePath)
    return { saved: true, filePath: target.filePath }
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
