import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
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
}
