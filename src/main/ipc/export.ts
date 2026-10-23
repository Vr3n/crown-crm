import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { exportTableSchema, type ExportResult } from '../../shared/contracts/export'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { buildXlsx } from '../export/xlsx'
import { handle } from './handle'

const exportPdfInputSchema = z.object({
  filename: z.string().min(1).max(120)
})

function safeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export'
  )
}

/**
 * Prints the focused window to PDF using the same print stylesheet the user
 * sees in the preview, then asks where to save it. This is a real PDF, not a
 * screenshot, so text stays selectable and columns stay aligned.
 */
export function registerExportIpc(): void {
  handle(IPC_CHANNELS.EXPORT_PDF, exportPdfInputSchema, async ({ filename }) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!window) return { saved: false as const }

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })

    const target = await dialog.showSaveDialog(window, {
      title: 'Save PDF',
      defaultPath: `${safeFilename(filename)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (target.canceled || !target.filePath) return { saved: false as const }

    await writeFile(target.filePath, pdf)
    return { saved: true as const, filePath: target.filePath }
  })

  /**
   * Builds a spreadsheet in the main process. The renderer never imports
   * ExcelJS and never receives filesystem paths it did not ask to save to.
   */
  handle(IPC_CHANNELS.EXPORT_XLSX, exportTableSchema, async (input): Promise<ExportResult> => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!window) return { saved: false }

    const target = await dialog.showSaveDialog(window, {
      title: 'Save spreadsheet',
      defaultPath: `${safeFilename(input.filename)}.xlsx`,
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (target.canceled || !target.filePath) return { saved: false }

    const workbook = await buildXlsx(input)
    await writeFile(target.filePath, workbook)
    return { saved: true, filePath: target.filePath }
  })
}
