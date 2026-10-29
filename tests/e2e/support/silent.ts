import type { ElectronApplication } from '@playwright/test'
import type { BrowserWindow } from 'electron'

/**
 * Quietens a launched app for unattended end-to-end runs.
 *
 * Two kinds of noise matter here: exported files popping Explorer open, and
 * application windows appearing on the desktop while the suite drives them.
 * Both are silenced from the test process only - production keeps revealing
 * saved files and showing a normal window.
 *
 * Windows are parked off-screen instead of hidden so Chromium keeps painting
 * the page and screenshots stay faithful. Electron has no headless mode, so
 * this is the closest equivalent.
 */
export async function quietApp(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, BrowserWindow: Window, shell }) => {
    // Exports reveal their file and backups open a folder; neither belongs in
    // an unattended run.
    shell.showItemInFolder = () => undefined
    shell.openPath = async () => ''
    shell.openExternal = async () => undefined

    const park = (window: BrowserWindow): void => {
      window.setSkipTaskbar(true)
      window.setPosition(-32000, -32000)
    }

    // The invoice print window is created later, so every future window is
    // parked as soon as it exists.
    electronApp.on('browser-window-created', (_event, window) => {
      park(window)
    })
    for (const window of Window.getAllWindows()) park(window)
  })
}
