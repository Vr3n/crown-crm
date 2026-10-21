import { BrowserWindow, shell } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { logger } from '../lib/logger'

/**
 * PDF Renderer service. Uses a hidden BrowserWindow + Chromium's printToPDF
 * to generate PDFs from HTML templates. Zero external dependencies.
 *
 * Flow:
 * 1. Build full HTML document (template + inline CSS)
 * 2. Create hidden BrowserWindow (show: false, offscreen: true)
 * 3. Load HTML via data: URL
 * 4. Wait for fonts + layout
 * 5. Call printToPDF → Buffer
 * 6. Write to Documents/CrownCRM/<subfolder>/
 * 7. Optionally open in system viewer
 */

const PDF_OPTIONS = {
  pageSize: 'A4' as const,
  printBackground: true,
  margins: {
    top: 0.4,
    bottom: 0.4,
    left: 0.4,
    right: 0.4
  },
  displayHeaderFooter: false
} satisfies Electron.PrintToPDFOptions

/** Ensures the output directory exists, creates it if not. */
async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

/**
 * Generates a PDF from an HTML string.
 * Always saves to Documents/CrownCRM/<subfolder>/.
 * If `open` is true, also opens the file in the system PDF viewer.
 */
export async function renderPdf(
  html: string,
  filename: string,
  subfolder: 'Invoices' | 'Receipts' | 'Refunds',
  open = false
): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  try {
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    await win.loadURL(dataUrl)

    // Wait for fonts and layout to settle
    await win.webContents.executeJavaScript('document.fonts.ready')
    // Extra delay for layout reflow
    await new Promise((resolve) => setTimeout(resolve, 200))

    const pdfBuffer = await win.webContents.printToPDF(PDF_OPTIONS)

    // Write to Documents/CrownCRM/<subfolder>/
    const documentsPath = app.getPath('documents')
    const outputDir = join(documentsPath, 'CrownCRM', subfolder)
    await ensureDir(outputDir)

    const outputPath = join(outputDir, filename)
    await writeFile(outputPath, pdfBuffer)

    logger.info(`PDF generated: ${outputPath}`)

    if (open) {
      await shell.openPath(outputPath)
      shell.showItemInFolder(outputPath)
    }

    return outputPath
  } finally {
    win.destroy()
  }
}
