import { app, BrowserWindow, Menu, Tray, globalShortcut, shell, nativeImage, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { clipboardMonitor } from './clipboardMonitor'
import { db } from '../shared/database'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

class ClipDeskApp {
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private trayContextMenu: Menu | null = null

  constructor() {
    this.setupApp()
  }

  private setupApp(): void {
    // Handle app events
    app.whenReady().then(() => {
      this.createWindow()
      this.createTray()
      this.registerGlobalShortcuts()
      this.setupIPCHandlers()
      this.startClipboardMonitoring()
    })

    app.on('window-all-closed', () => {
      // On macOS, keep app running even when all windows are closed
      if (process.platform !== 'darwin') {
        this.cleanup()
        app.quit()
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow()
      }
    })

    app.on('before-quit', () => {
      this.cleanup()
    })
  }

  private createWindow(): void {
    // Create the browser window with Things-inspired design
    this.mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 600,
      minHeight: 500,
      titleBarStyle: 'hidden', // Completely hide title bar on macOS
      trafficLightPosition: { x: 20, y: 20 },
      backgroundColor: '#ffffff',
      title: '', // Remove title to clean up the title bar
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.resolve(__dirname, '../preload/index.js'),
      },
    })

    // Load the app
    if (isDev) {
      // In development, load from the dev server or fall back to built files
      this.mainWindow.loadURL('http://localhost:5173').catch(() => {
        console.warn('Dev server not available, loading built files')
        if (this.mainWindow) {
          this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
        }
      })
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })

    // Hide instead of close on macOS
    this.mainWindow.on('close', (event) => {
      if (process.platform === 'darwin') {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    })

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    })
  }

  private createTray(): void {
    // Use a proper path for the tray icon, with fallback
    let trayIcon: Electron.NativeImage
    try {
      trayIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray-icon.png'))
    } catch (error) {
      console.warn('Failed to load tray icon, using default:', error)
      // Create a simple tray without custom icon
      trayIcon = nativeImage.createEmpty()
    }
    
    this.tray = new Tray(trayIcon)
    
    this.trayContextMenu = Menu.buildFromTemplate([
      {
        label: 'Show ClipDesk',
        click: () => {
          this.showWindow()
        }
      },
      {
        label: 'Clipboard History',
        accelerator: 'CommandOrControl+Shift+V',
        click: () => {
          this.showWindow()
        }
      },
      { type: 'separator' },
      {
        label: 'Pause Monitoring',
        id: 'pause-monitoring',
        click: () => {
          this.toggleClipboardMonitoring()
        }
      },
      { type: 'separator' },
      {
        label: 'Preferences',
        accelerator: 'CommandOrControl+,',
        click: () => {
          this.showWindow()
          // TODO: Navigate to preferences
        }
      },
      { type: 'separator' },
      {
        label: 'Quit ClipDesk',
        accelerator: 'CommandOrControl+Q',
        click: () => {
          this.cleanup()
          app.quit()
        }
      }
    ])

    this.tray.setToolTip('ClipDesk - Clipboard Manager')
    this.tray.setContextMenu(this.trayContextMenu)
    
    // Show/hide window on tray click
    this.tray.on('click', () => {
      this.showWindow()
    })
  }

  private showWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    } else {
      this.createWindow()
    }
  }

  private registerGlobalShortcuts(): void {
    // Main ClipDesk shortcut (Cmd/Ctrl + Shift + V)
    globalShortcut.register('CommandOrControl+Shift+V', () => {
      this.showWindow()
    })
  }

  private async startClipboardMonitoring(): Promise<void> {
    try {
      // Start clipboard monitoring
      await clipboardMonitor.start();

      // Listen for clipboard changes
      clipboardMonitor.on('clipboardChanged', async (content) => {
        console.log('📋 Clipboard changed in main:', content.type);
        
        try {
          // Wait a bit for the database to be updated
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get the most recent clipboard item from database
          const recentItems = await db.getClipboardItems(1, 0);
          const latestItem = recentItems[0];
          
          if (latestItem) {
            console.log('📦 Retrieved latest item from DB:', {
              id: latestItem.id,
              type: latestItem.contentType,
              content: latestItem.content.substring(0, 30) + '...'
            });
            
            // Check window state
            if (!this.mainWindow) {
              console.error('❌ Main window is null');
              return;
            }
            
            if (this.mainWindow.isDestroyed()) {
              console.error('❌ Main window is destroyed');
              return;
            }
            
            console.log('🚀 Sending IPC event to renderer...');
            
            // Additional webContents checks
            if (!this.mainWindow.webContents) {
              console.error('❌ Main window webContents is null');
              return;
            }
            
            if (this.mainWindow.webContents.isDestroyed()) {
              console.error('❌ Main window webContents is destroyed');
              return;
            }
            
            // Check if webContents is ready
            if (!this.mainWindow.webContents.isLoading()) {
              console.log('✅ WebContents is ready, sending event...');
              
              // Notify renderer process with the complete item data
              this.mainWindow.webContents.send('clipboard-changed', latestItem);
              
              console.log('✅ Sent clipboard item to renderer:', latestItem.contentType, latestItem.sourceApp, latestItem.content.substring(0, 50) + '...');
            } else {
              console.log('⏳ WebContents is still loading, queueing event...');
              
              // Wait for the page to finish loading then send
              this.mainWindow.webContents.once('did-finish-load', () => {
                console.log('✅ WebContents loaded, sending queued event...');
                this.mainWindow!.webContents.send('clipboard-changed', latestItem);
                console.log('✅ Sent queued clipboard item to renderer:', latestItem.contentType);
              });
            }
          } else {
            console.log('⚠️ No recent items found in database');
          }
        } catch (error) {
          console.error('❌ Error sending clipboard change to renderer:', error);
        }
      });

      console.log('Clipboard monitoring started successfully');
    } catch (error) {
      console.error('Failed to start clipboard monitoring:', error);
    }
  }

  private toggleClipboardMonitoring(): void {
    if (clipboardMonitor.isRunning()) {
      clipboardMonitor.stop()
      this.updateTrayMenu('Resume Monitoring')
    } else {
      clipboardMonitor.start()
      this.updateTrayMenu('Pause Monitoring')
    }
  }

  private updateTrayMenu(pauseLabel: string): void {
    if (this.trayContextMenu) {
      const pauseItem = this.trayContextMenu.getMenuItemById('pause-monitoring')
      if (pauseItem) {
        pauseItem.label = pauseLabel
        // Update the tray menu
        if (this.tray) {
          this.tray.setContextMenu(this.trayContextMenu)
        }
      }
    }
  }

  private setupIPCHandlers(): void {
    // Clipboard operations
    ipcMain.handle('clipboard-get-items', async (event, options = {}) => {
      try {
        const { limit = 50, offset = 0, contentType, searchQuery } = options
        return await db.getClipboardItems(limit, offset, contentType, searchQuery)
      } catch (error) {
        console.error('Error getting clipboard items:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-toggle-favorite', async (event, id: string) => {
      try {
        return await db.toggleFavorite(id)
      } catch (error) {
        console.error('Error toggling favorite:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-delete-item', async (event, id: string) => {
      try {
        await db.deleteClipboardItem(id)
        return { success: true }
      } catch (error) {
        console.error('Error deleting clipboard item:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-clear-history', async () => {
      try {
        await db.clearHistory()
        return { success: true }
      } catch (error) {
        console.error('Error clearing history:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-copy-item', async (event, content: string) => {
      try {
        const { clipboard } = require('electron')
        clipboard.writeText(content)
        return { success: true }
      } catch (error) {
        console.error('Error copying to clipboard:', error)
        throw error
      }
    })

    // Tags operations
    ipcMain.handle('tags-get-all', async () => {
      try {
        return await db.getTags()
      } catch (error) {
        console.error('Error getting tags:', error)
        throw error
      }
    })

    ipcMain.handle('tags-create', async (event, name: string, color?: string) => {
      try {
        return await db.addTag(name, color)
      } catch (error) {
        console.error('Error creating tag:', error)
        throw error
      }
    })

    ipcMain.handle('tags-add-to-item', async (event, itemId: string, tagId: string) => {
      try {
        await db.addTagToItem(itemId, tagId)
        return { success: true }
      } catch (error) {
        console.error('Error adding tag to item:', error)
        throw error
      }
    })

    // Snippets operations
    ipcMain.handle('snippets-get-all', async () => {
      try {
        return await db.getSnippets()
      } catch (error) {
        console.error('Error getting snippets:', error)
        throw error
      }
    })

    ipcMain.handle('snippets-create', async (event, snippet) => {
      try {
        const { name, content, shortcut, variables } = snippet
        return await db.createSnippet(name, content, shortcut, variables)
      } catch (error) {
        console.error('Error creating snippet:', error)
        throw error
      }
    })

    // Settings operations
    ipcMain.handle('settings-get', async (event, key: string) => {
      try {
        return await db.getSetting(key)
      } catch (error) {
        console.error('Error getting setting:', error)
        throw error
      }
    })

    ipcMain.handle('settings-set', async (event, key: string, value: string) => {
      try {
        await db.setSetting(key, value)
        return { success: true }
      } catch (error) {
        console.error('Error setting value:', error)
        throw error
      }
    })

    // Monitor controls
    ipcMain.handle('monitor-toggle', async () => {
      try {
        this.toggleClipboardMonitoring()
        return { success: true, isRunning: clipboardMonitor.isRunning() }
      } catch (error) {
        console.error('Error toggling monitor:', error)
        throw error
      }
    })

    ipcMain.handle('monitor-status', async () => {
      try {
        return { isRunning: clipboardMonitor.isRunning() }
      } catch (error) {
        console.error('Error getting monitor status:', error)
        throw error
      }
    })

    // App controls
    ipcMain.handle('app-show-window', async () => {
      this.showWindow()
      return { success: true }
    })

    ipcMain.handle('app-hide-window', async () => {
      if (this.mainWindow) {
        this.mainWindow.hide()
      }
      return { success: true }
    })

    ipcMain.handle('app-quit', async () => {
      this.cleanup()
      app.quit()
      return { success: true }
    })
  }

  private cleanup(): void {
    try {
      // Stop clipboard monitoring
      if (clipboardMonitor.isRunning()) {
        clipboardMonitor.stop()
      }

      // Unregister global shortcuts
      globalShortcut.unregisterAll()

      // Close database connection
      db.close()

      console.log('App cleanup completed')
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }
}

// Initialize the app
const clipDeskApp = new ClipDeskApp()

// Security: Prevent navigation to external websites
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    
    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault()
    }
  })
})

// Clean up shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Handle app startup on different platforms
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true, // Start hidden in system tray
})

// Custom app property to track quit state
declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean
    }
  }
} 