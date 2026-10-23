import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import { openDatabase } from './db/connection'
import { runMigrations } from './db/migrations'
import { seedPermissions } from './db/seed'
import { logger } from './lib/logger'
import { registerIdentityIpc } from './ipc/identity'
import { registerIdentityReadIpc } from './ipc/identity-read'
import { registerAccessIpc } from './ipc/access'
import { registerDashboardIpc } from './ipc/dashboard'
import { registerExportIpc } from './ipc/export'
import { registerNumberingIpc } from './ipc/numbering'
import { registerSummariesIpc } from './ipc/summaries'
import { registerMastersIpc } from './ipc/masters'
import { registerSearchIpc } from './ipc/search'
import { registerVouchersIpc } from './ipc/vouchers'
import { registerReportsIpc } from './ipc/reports'
import { registerBackupIpc } from './ipc/backup'
import { registerLicenseIpc } from './ipc/license'
import { restoreRememberedLogin } from './application/identity'
import { ensureInstallLock } from './licensing/ensure'
import { generateInstallLock, getInstallDir } from './licensing/install-lock'

// End-to-end runs point at a throwaway data directory. Set before app is ready
// so every app.getPath('userData') consumer sees the same folder.
if (process.env.CROWN_BOOKS_USER_DATA) {
  app.setPath('userData', process.env.CROWN_BOOKS_USER_DATA)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F6F4EF',
    ...(process.platform === 'win32' ? { icon } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Start at 1 so a persisted zoom cannot shrink the UI. Chromium still
      // applies the Windows display scale to CSS pixels.
      zoomFactor: 1
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.crownbooks.app')

  // Install-time machine binding, unchanged from the previous product.
  if (process.argv.includes('--generate-binding')) {
    try {
      generateInstallLock(getInstallDir())
      console.log('Install lock written.')
    } catch (err) {
      console.error('Failed to write install lock:', err)
      process.exitCode = 1
    }
    app.quit()
    return
  }

  ensureInstallLock()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Database foundation: connection -> migrations -> permission catalog
  logger.info('main process started', {
    logLevel: process.env.CROWN_BOOKS_LOG_LEVEL ?? 'info',
    database: join(app.getPath('userData'), 'crown-books.db')
  })
  openDatabase(join(app.getPath('userData'), 'crown-books.db'))
  runMigrations()
  seedPermissions()

  // Restore a remembered login before the window loads, so the renderer's first
  // status call does not flash the login screen.
  await restoreRememberedLogin()

  registerIdentityIpc()
  registerIdentityReadIpc()
  registerAccessIpc()
  registerMastersIpc()
  registerSearchIpc()
  registerVouchersIpc()
  registerReportsIpc()
  registerBackupIpc()
  registerDashboardIpc()
  registerNumberingIpc()
  registerSummariesIpc()
  registerExportIpc()
  registerLicenseIpc()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
