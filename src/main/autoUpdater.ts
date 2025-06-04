import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog, shell } from 'electron'
import log from 'electron-log'

// Configure logging
autoUpdater.logger = log
if (autoUpdater.logger && typeof autoUpdater.logger === 'object' && 'transports' in autoUpdater.logger) {
  (autoUpdater.logger as any).transports.file.level = 'info'
}

class AutoUpdaterManager {
  private mainWindow: BrowserWindow | null = null
  private updateAvailable = false
  private updateDownloaded = false

  constructor() {
    this.setupAutoUpdater()
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  private setupAutoUpdater(): void {
    // Configure auto updater
    autoUpdater.autoDownload = false // Don't auto-download, let user choose
    autoUpdater.autoInstallOnAppQuit = true

    // Set update server URL (GitHub releases)
    if (!app.isPackaged) {
      // In development, skip auto-updates
      console.log('🔧 Development mode - auto-updater disabled')
      return
    }

    // Check for updates on startup (after 3 seconds)
    setTimeout(() => {
      this.checkForUpdates()
    }, 3000)

    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 Checking for updates...')
      this.sendStatusToWindow('Checking for updates...')
    })

    autoUpdater.on('update-available', (info) => {
      console.log('✅ Update available:', info.version)
      this.updateAvailable = true
      this.sendStatusToWindow(`Update available: v${info.version}`)
      this.showUpdateAvailableDialog(info)
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('✅ Update not available. Current version:', info.version)
      this.sendStatusToWindow('App is up to date')
    })

    autoUpdater.on('error', (err) => {
      console.error('❌ Auto-updater error:', err)
      this.sendStatusToWindow(`Update error: ${err.message}`)
    })

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`
      console.log('📥 Download progress:', message)
      this.sendStatusToWindow(message)
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Update downloaded:', info.version)
      this.updateDownloaded = true
      this.sendStatusToWindow('Update downloaded')
      this.showUpdateDownloadedDialog(info)
    })
  }

  private sendStatusToWindow(message: string): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('update-status', message)
    }
  }

  private async showUpdateAvailableDialog(info: any): Promise<void> {
    if (!this.mainWindow) return

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `ClipDesk v${info.version} is available`,
      detail: `Current version: ${app.getVersion()}\nNew version: ${info.version}\n\n${info.releaseNotes || 'No release notes available.'}`,
      buttons: ['Download Update', 'View Release Notes', 'Skip This Version', 'Remind Me Later'],
      defaultId: 0,
      cancelId: 3
    })

    switch (result.response) {
      case 0: // Download Update
        this.downloadUpdate()
        break
      case 1: // View Release Notes
        if (info.releaseNotes) {
          shell.openExternal(`https://github.com/clipdesk/clipdesk/releases/tag/v${info.version}`)
        }
        break
      case 2: // Skip This Version
        // Could implement skip logic here
        break
      case 3: // Remind Me Later
      default:
        // Do nothing
        break
    }
  }

  private async showUpdateDownloadedDialog(info: any): Promise<void> {
    if (!this.mainWindow) return

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `ClipDesk v${info.version} has been downloaded`,
      detail: 'The update will be installed when you restart the application.',
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      // Restart now
      autoUpdater.quitAndInstall()
    }
  }

  public async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      console.log('🔧 Development mode - skipping update check')
      return
    }

    try {
      console.log('🔍 Manually checking for updates...')
      await autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('❌ Error checking for updates:', error)
    }
  }

  public async downloadUpdate(): Promise<void> {
    if (!this.updateAvailable) {
      console.log('⚠️ No update available to download')
      return
    }

    try {
      console.log('📥 Starting update download...')
      await autoUpdater.downloadUpdate()
    } catch (error) {
      console.error('❌ Error downloading update:', error)
    }
  }

  public quitAndInstall(): void {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall()
    }
  }

  public getUpdateStatus(): { available: boolean; downloaded: boolean } {
    return {
      available: this.updateAvailable,
      downloaded: this.updateDownloaded
    }
  }
}

export const autoUpdaterManager = new AutoUpdaterManager() 