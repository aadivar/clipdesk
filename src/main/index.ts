import { app, BrowserWindow, Menu, globalShortcut, shell, nativeImage, ipcMain, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { clipboardMonitor } from './clipboardMonitor'
import { db } from '../shared/database'
import { autoUpdaterManager } from './autoUpdater'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
const SCHEME = 'clipdesk'

// Configure electron-log for better logging
log.transports.console.level = isDev ? 'debug' : 'warn'
log.transports.file.level = 'info'

class ClipDeskApp {
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.setupApp()
  }

  private setupApp(): void {
    // Register custom protocol before app is ready - THIS IS CRITICAL
    protocol.registerSchemesAsPrivileged([
      {
        scheme: SCHEME,
        privileges: {
          standard: true,
          secure: true,
          allowServiceWorkers: true,
          supportFetchAPI: true,
          corsEnabled: true
        }
      }
    ])

    // Handle app events
    app.whenReady().then(async () => {
      try {
        // Log environment info for debugging
        log.info('=== CLIPDESK STARTUP DEBUG ===')
        log.info('NODE_ENV:', process.env.NODE_ENV)
        log.info('isDev:', isDev)
        log.info('app.isPackaged:', app.isPackaged)
        log.info('app.getAppPath():', app.getAppPath())
        log.info('__dirname:', __dirname)
        log.info('process.cwd():', process.cwd())
        log.info('============================')

        // FIRST: Set up IPC handlers immediately - this is critical
        log.info('🔧 Setting up IPC handlers...')
        this.setupIPCHandlers()
        log.info('✅ IPC handlers set up successfully')

        // SECOND: Initialize database EARLY - many things depend on it
        try {
          log.info('🔧 Initializing database...')
          await db.initialize()
          log.info('✅ Database initialized successfully')
        } catch (error) {
          log.error('❌ Database initialization failed:', error)
          // Continue with app startup even if database fails
        }

        // Register the protocol handler AFTER app is ready
        log.info('🔧 Registering protocol...')
        this.registerProtocol()
        log.info('✅ Protocol registered successfully')

        // Create window after protocol
        log.info('🔧 Creating window...')
        this.createWindow()
        log.info('✅ Window created successfully')

        // Set main window for auto-updater
        if (this.mainWindow) {
          autoUpdaterManager.setMainWindow(this.mainWindow)
        }

        // Check if app was launched at login and should start hidden
        const wasOpenedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
        if (wasOpenedAtLogin) {
          log.info('🔧 App was launched at login, starting hidden...')
          // Hide from dock immediately for login launch
          if (process.platform === 'darwin') {
            app.dock?.hide();
          }
        } else {
          // For manual launch, also start hidden (true background app)
          log.info('🔧 Manual launch detected, starting in background...')
          
          // Create window but keep it hidden initially
          // User can summon it with Shift+Command+V
          
          // Hide from dock for clean background operation
          if (process.platform === 'darwin') {
            setTimeout(() => {
              app.dock?.hide();
              log.info('✅ App starting in background mode - use Shift+Command+V to access');
            }, 1000); // Brief delay to ensure window is created first
          }
        }

        // Apply initial dock hiding for hybrid mode (unless user wants it always in dock)
        if (process.platform === 'darwin') {
          try {
            // Wait a bit to ensure database is fully ready
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const showInDock = await db.getSetting('showInDock');
            const shouldShowInDock = showInDock === 'true';
            
            if (!shouldShowInDock && !wasOpenedAtLogin) {
              // For manual launch, briefly show in dock then hide after window setup
              log.info('🔧 Hybrid mode detected, will hide from dock after window setup...')
              setTimeout(() => {
                app.dock?.hide();
                log.info('✅ App hidden from dock (hybrid mode)');
              }, 2000); // Give time for window to appear first
            }
          } catch (error) {
            log.warn('Could not check dock setting (database not ready):', error instanceof Error ? error.message : String(error));
            // Default hybrid behavior - hide from dock unless manually launched
            if (wasOpenedAtLogin) {
              setTimeout(() => {
                app.dock?.hide();
                log.info('✅ App hidden from dock (default behavior)');
              }, 1000);
            } else {
              // For manual launch, briefly show then hide
              setTimeout(() => {
                app.dock?.hide();
                log.info('✅ App hidden from dock (fallback behavior)');
              }, 2000);
            }
          }
        }

        // Register shortcuts
        log.info('🔧 Registering shortcuts...')
        this.registerGlobalShortcuts()
        log.info('✅ Shortcuts registered successfully')

        // Check accessibility permissions (non-blocking)
        if (process.platform === 'darwin') {
          try {
            log.info('🔧 Checking accessibility permissions...')
            await this.checkAccessibilityPermissions()
            log.info('✅ Accessibility permissions checked')
          } catch (error) {
            log.error('❌ Accessibility permissions check failed:', error)
            // Continue anyway
          }
        }

        // Start clipboard monitoring (non-blocking)
        try {
          log.info('🔧 Starting clipboard monitoring...')
          await this.startClipboardMonitoring()
          log.info('✅ Clipboard monitoring started successfully')
        } catch (error) {
          log.error('❌ Clipboard monitoring failed to start:', error)
          // Continue with app startup even if clipboard monitoring fails
        }

        // Initialize launch at login setting
        try {
          log.info('🔧 Initializing launch at login setting...')
          await this.initializeLaunchAtLogin()
          log.info('✅ Launch at login setting initialized')
        } catch (error) {
          log.error('❌ Failed to initialize launch at login setting:', error)
        }

        log.info('✅ ClipDesk startup completed successfully')
      } catch (error) {
        log.error('❌ Critical error during app startup:', error)
        // Even if there's a critical error, try to set up basic IPC handlers
        try {
          this.setupIPCHandlers()
        } catch (ipcError) {
          log.error('❌ Failed to set up IPC handlers:', ipcError)
        }
      }
    })

    app.on('window-all-closed', async () => {
      try {
        // Check if "run in menubar" setting is enabled
        const runInMenubar = await db.getSetting('runInMenubar');
        const shouldRunInMenubar = runInMenubar === 'true';

        // Keep app running if on macOS or if menubar mode is enabled
        if (process.platform === 'darwin' || shouldRunInMenubar) {
          // Keep app running in background
          return;
        }

        // Otherwise, quit the app
        await this.cleanup()
        app.quit()
      } catch (error) {
        log.error('Error checking runInMenubar setting in window-all-closed:', error);
        // Fallback behavior: quit on non-macOS, keep running on macOS
        if (process.platform !== 'darwin') {
          await this.cleanup()
          app.quit()
        }
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow()
      }
    })

    app.on('before-quit', async () => {
      await this.cleanup()
    })
  }

  private registerProtocol(): void {
    const mimeTypes: { [key: string]: string } = {
      '.js': 'text/javascript',
      '.mjs': 'text/javascript', 
      '.html': 'text/html',
      '.htm': 'text/html',
      '.json': 'application/json',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.ico': 'image/vnd.microsoft.icon',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'text/plain'
    }

    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url)
      let filePath = url.pathname
      
      // Remove leading slash
      if (filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
      
      // Default to index.html if no file specified
      if (!filePath || filePath === '') {
        filePath = 'index.html'
      }

      // Build the full path to the file
      let fullPath: string
      if (isDev && !app.isPackaged) {
        fullPath = path.join(process.cwd(), 'dist/renderer', filePath)
      } else {
        // In production ASAR, the files are in app.asar/dist/renderer/
        // Use app.getAppPath() which points to the ASAR file itself in production
        const basePath = app.getAppPath()
        fullPath = path.join(basePath, 'dist/renderer', filePath)
        
        // Log for debugging production issues
        log.info('Production mode - App path:', basePath)
        log.info('Production mode - Full path:', fullPath)
      }

      log.info('Protocol request:', request.url)
      log.info('Resolved path:', fullPath)

      return new Promise((resolve, reject) => {
        fs.readFile(fullPath, (err, data) => {
          if (err) {
            log.error('File not found:', fullPath, err)
            reject(err)
            return
          }

          // Determine content type
          const ext = path.extname(filePath).toLowerCase()
          const mimeType = mimeTypes[ext] || 'application/octet-stream'

          log.info('Serving file:', filePath, 'as', mimeType)

          resolve(new Response(data, {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Cache-Control': 'no-cache'
            }
          }))
        })
      })
    })
  }

  private createWindow(): void {
    // Create the browser window with Things-inspired design
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      titleBarStyle: 'hiddenInset', // Better macOS integration
      trafficLightPosition: { x: 20, y: 20 },
      backgroundColor: '#ffffff',
      title: 'ClipDesk',
      vibrancy: 'sidebar', // Add subtle transparency effect on macOS
      visualEffectState: 'active',
      show: false, // Always start hidden - let global shortcut show it
      skipTaskbar: true, // Don't show in taskbar initially
      icon: isDev
        ? path.join(__dirname, '../../assets/icon.png')
        : path.join(app.getAppPath(), 'assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true, // Keep security enabled
        preload: isDev
          ? path.resolve(__dirname, '../preload/index.js')
          : path.join(app.getAppPath(), 'dist/main/src/preload/index.js'),
      }
    })

    // Load the app using the proven custom protocol solution
    if (isDev && !app.isPackaged) {
      // In development, load from the dev server or fall back to custom protocol
      this.mainWindow.loadURL('http://localhost:5173').catch(() => {
        log.warn('Dev server not available, loading via custom protocol')
        if (this.mainWindow) {
          this.mainWindow.loadURL(`${SCHEME}://localhost/index.html`)
        }
      })
      this.mainWindow.webContents.openDevTools()
    } else {
      // In production or packaged app, use custom protocol (this bypasses CSP completely)
      log.info('Production/Packaged app detected - using custom protocol')
      log.info('Loading renderer from:', `${SCHEME}://localhost/index.html`)
      
      try {
        this.mainWindow.loadURL(`${SCHEME}://localhost/index.html`)
        log.info('✅ Successfully loaded using custom protocol')
      } catch (error) {
        log.error('❌ Failed to load using custom protocol:', error)
      }
    }

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })

    // Handle window close behavior - hide from dock for true background operation
    this.mainWindow.on('close', async (event) => {
      try {
        // Always prevent actual quit and hide instead (true background mode)
        event.preventDefault();
        
        log.info('🔧 Window close event - hiding app from dock (background mode)');
        
        // Hide the window first
        this.mainWindow?.hide();

        // Hide from dock completely (works in background)
        if (process.platform === 'darwin') {
          setTimeout(() => {
            app.dock?.hide();
            log.info('✅ App hidden from dock - running in background');
          }, 100);
        }
      } catch (error) {
        log.error('Error in window close handler:', error);
        // Fallback: still hide to maintain background operation
        event.preventDefault();
        this.mainWindow?.hide();
        if (process.platform === 'darwin') {
          setTimeout(() => {
            app.dock?.hide();
            log.info('✅ App hidden from dock (error fallback)');
          }, 100);
        }
      }
    })

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    })
  }

  private registerGlobalShortcuts(): void {
    // Main ClipDesk shortcut (Cmd/Ctrl + Shift + V)
    globalShortcut.register('CommandOrControl+Shift+V', () => {
      this.showWindow()
    })
  }

  private async startClipboardMonitoring(): Promise<void> {
    try {
      log.info('🔧 startClipboardMonitoring() called')
      log.info('🔧 App is packaged:', app.isPackaged)
      log.info('🔧 Process platform:', process.platform)

      // Send debug info to renderer
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', '🔧 Starting clipboard monitoring...')
        this.mainWindow.webContents.send('debug-log', `🔧 App is packaged: ${app.isPackaged}`)
      }

      // Start clipboard monitoring
      log.info('🔧 Calling clipboardMonitor.start()...')
      await clipboardMonitor.start();
      log.info('🔧 clipboardMonitor.start() completed')

      // Check status after start
      const isRunning = clipboardMonitor.isRunning();
      log.info('🔧 Monitor running after start:', isRunning)

      log.info('✅ Clipboard monitoring started successfully')
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', '✅ Clipboard monitoring started successfully')
        this.mainWindow.webContents.send('debug-log', `📊 Monitor running: ${isRunning}`)
      }

      // Listen for clipboard changes
      clipboardMonitor.on('clipboardChanged', async (content) => {
        log.info('📋 Clipboard changed in main:', content.type);
        
        // Send to renderer for debugging
        if (this.mainWindow && this.mainWindow.webContents) {
          this.mainWindow.webContents.send('debug-log', `📋 Clipboard changed: ${content.type}`)
        }
        
        try {
          // Wait a bit for the database to be updated
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get the most recent clipboard item from database
          const recentItems = await db.getClipboardItems(1, 0);
          const latestItem = recentItems[0];
          
          if (latestItem) {
            log.info('📦 Retrieved latest item from DB:', {
              id: latestItem.id,
              type: latestItem.contentType,
              content: latestItem.content.substring(0, 30) + '...'
            });
            
            // Check window state
            if (!this.mainWindow) {
              log.error('❌ Main window is null');
              return;
            }
            
            if (this.mainWindow.isDestroyed()) {
              log.error('❌ Main window is destroyed');
              return;
            }
            
            log.info('🚀 Sending IPC event to renderer...');
            
            // Additional webContents checks
            if (!this.mainWindow.webContents) {
              log.error('❌ Main window webContents is null');
              return;
            }
            
            if (this.mainWindow.webContents.isDestroyed()) {
              log.error('❌ Main window webContents is destroyed');
              return;
            }
            
            // Check if webContents is ready
            if (!this.mainWindow.webContents.isLoading()) {
              log.info('✅ WebContents is ready, sending event...');
              
              // Notify renderer process with the complete item data
              this.mainWindow.webContents.send('clipboard-changed', latestItem);
              
              log.info('✅ Sent clipboard item to renderer:', latestItem.contentType, latestItem.sourceApp, latestItem.content.substring(0, 50) + '...');
            } else {
              log.info('⏳ WebContents is still loading, queueing event...');
              
              // Wait for the page to finish loading then send
              this.mainWindow.webContents.once('did-finish-load', () => {
                log.info('✅ WebContents loaded, sending queued event...');
                this.mainWindow!.webContents.send('clipboard-changed', latestItem);
                log.info('✅ Sent queued clipboard item to renderer:', latestItem.contentType);
              });
            }
          } else {
            log.info('⚠️ No recent items found in database');
            if (this.mainWindow && this.mainWindow.webContents) {
              this.mainWindow.webContents.send('debug-log', '⚠️ No recent items found in database')
            }
          }
        } catch (error) {
          log.error('❌ Error sending clipboard change to renderer:', error);
          if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('debug-log', `❌ Error: ${error}`)
          }
        }
      });

      log.info('Clipboard monitoring started successfully');
    } catch (error) {
      log.error('Failed to start clipboard monitoring:', error);
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', `❌ Failed to start clipboard monitoring: ${error}`)
      }
    }
  }

  private toggleClipboardMonitoring(): void {
    log.info('🔧 toggleClipboardMonitoring called')
    log.info('🔧 Current monitoring status:', clipboardMonitor.isRunning())

    if (clipboardMonitor.isRunning()) {
      log.info('🔧 Stopping clipboard monitoring...')
      clipboardMonitor.stop()
      log.info('🔧 Clipboard monitoring stopped')
    } else {
      log.info('🔧 Starting clipboard monitoring...')
      clipboardMonitor.start()
      log.info('🔧 Clipboard monitoring start initiated')
    }
  }

  private setupIPCHandlers(): void {
    // Clipboard operations
    ipcMain.handle('clipboard-get-items', async (event, options = {}) => {
      try {
        // Check if database is initialized
        if (!db.isInitialized()) {
          log.warn('Database not initialized, returning empty array for clipboard items')
          return []
        }
        const { limit = 50, offset = 0, contentType, searchQuery } = options
        return await db.getClipboardItems(limit, offset, contentType, searchQuery)
      } catch (error) {
        log.error('Error getting clipboard items:', error)
        return [] // Return empty array instead of throwing
      }
    })

    ipcMain.handle('clipboard-get-source-apps', async () => {
      try {
        // Check if database is initialized
        if (!db.isInitialized()) {
          log.warn('Database not initialized, returning empty array for source apps')
          return []
        }
        return await db.getUniqueSourceApps()
      } catch (error) {
        log.error('Error getting unique source apps:', error)
        return [] // Return empty array instead of throwing
      }
    })

    ipcMain.handle('clipboard-toggle-favorite', async (event, id: string) => {
      try {
        return await db.toggleFavorite(id)
      } catch (error) {
        log.error('Error toggling favorite:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-delete-item', async (event, id: string) => {
      try {
        await db.deleteClipboardItem(id)
        return { success: true }
      } catch (error) {
        log.error('Error deleting clipboard item:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-clear-history', async () => {
      try {
        await db.clearHistory()
        return { success: true }
      } catch (error) {
        log.error('Error clearing history:', error)
        throw error
      }
    })

    ipcMain.handle('clipboard-copy-item', async (event, content: string) => {
      try {
        const { clipboard } = require('electron')
        clipboard.writeText(content)
        return { success: true }
      } catch (error) {
        log.error('Error copying to clipboard:', error)
        throw error
      }
    })

    // Tags operations
    ipcMain.handle('tags-get-all', async () => {
      try {
        return await db.getTags()
      } catch (error) {
        log.error('Error getting tags:', error)
        throw error
      }
    })

    ipcMain.handle('tags-create', async (event, name: string, color?: string) => {
      try {
        return await db.addTag(name, color)
      } catch (error) {
        log.error('Error creating tag:', error)
        throw error
      }
    })

    ipcMain.handle('tags-add-to-item', async (event, itemId: string, tagId: string) => {
      try {
        await db.addTagToItem(itemId, tagId)
        return { success: true }
      } catch (error) {
        log.error('Error adding tag to item:', error)
        throw error
      }
    })

    // Snippets operations
    ipcMain.handle('snippets-get-all', async () => {
      try {
        return await db.getSnippets()
      } catch (error) {
        log.error('Error getting snippets:', error)
        throw error
      }
    })

    ipcMain.handle('snippets-create', async (event, snippet) => {
      try {
        const { name, content, shortcut, variables } = snippet
        return await db.createSnippet(name, content, shortcut, variables)
      } catch (error) {
        log.error('Error creating snippet:', error)
        throw error
      }
    })

    // Settings operations
    ipcMain.handle('settings-get', async (event, key: string) => {
      try {
        // Check if database is initialized
        if (!db.isInitialized()) {
          log.warn('Database not initialized, returning null for setting:', key)
          return null
        }
        return await db.getSetting(key)
      } catch (error) {
        log.error('Error getting setting:', error)
        return null // Return null instead of throwing
      }
    })

    ipcMain.handle('settings-set', async (event, key: string, value: string) => {
      try {
        // Check if database is initialized
        if (!db.isInitialized()) {
          log.warn('Database not initialized, cannot set setting:', key)
          return { success: false, error: 'Database not initialized' }
        }

        // Handle launch at login setting
        if (key === 'launchAtLogin') {
          const shouldLaunchAtLogin = value === 'true';
          app.setLoginItemSettings({
            openAtLogin: shouldLaunchAtLogin,
            openAsHidden: shouldLaunchAtLogin // Start hidden when launching at login
          });
        }

        await db.setSetting(key, value)
        return { success: true }
      } catch (error) {
        log.error('Error setting value:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Monitor controls
    ipcMain.handle('monitor-toggle', async () => {
      try {
        this.toggleClipboardMonitoring()
        return { success: true, isRunning: clipboardMonitor.isRunning() }
      } catch (error) {
        log.error('Error toggling monitor:', error)
        throw error
      }
    })

    // Sensitive data controls
    ipcMain.handle('sensitive-data-settings-get', async () => {
      try {
        return await clipboardMonitor.getSensitiveDataSettings()
      } catch (error) {
        log.error('Error getting sensitive data settings:', error)
        throw error
      }
    })

    ipcMain.handle('sensitive-data-settings-update', async (event, enabled: boolean, level: 'strict' | 'moderate' | 'permissive') => {
      try {
        await clipboardMonitor.updateSensitiveDataSettings(enabled, level)
        return { success: true }
      } catch (error) {
        log.error('Error updating sensitive data settings:', error)
        throw error
      }
    })

    ipcMain.handle('sensitive-data-type-description', async (event, type: string) => {
      try {
        return clipboardMonitor.getSensitiveDataTypeDescription(type)
      } catch (error) {
        log.error('Error getting sensitive data type description:', error)
        throw error
      }
    })

    ipcMain.handle('monitor-status', async () => {
      try {
        return { isRunning: clipboardMonitor.isRunning() }
      } catch (error) {
        log.error('Error getting monitor status:', error)
        throw error
      }
    })

    ipcMain.handle('test-clipboard-access', async () => {
      try {
        return await clipboardMonitor.testClipboardAccess()
      } catch (error) {
        log.error('Error testing clipboard access:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Debug method to manually trigger clipboard check
    ipcMain.handle('debug-check-clipboard', async () => {
      try {
        log.info('🔧 Manual clipboard check triggered from renderer')
        if (this.mainWindow && this.mainWindow.webContents) {
          this.mainWindow.webContents.send('debug-log', '🔧 Manual clipboard check triggered')
        }

        // Force a clipboard check
        await (clipboardMonitor as any).checkClipboard()

        return { success: true }
      } catch (error) {
        log.error('Error in manual clipboard check:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Accessibility permissions
    ipcMain.handle('check-accessibility-permissions', async () => {
      try {
        if (process.platform === 'darwin') {
          const { systemPreferences } = require('electron')
          if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
            const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
            await db.setSetting('accessibilityPermissionsGranted', isTrusted ? 'true' : 'false')
            return { granted: isTrusted }
          }
        }
        return { granted: true } // Assume granted on non-macOS platforms
      } catch (error) {
        log.error('Error checking accessibility permissions:', error)
        return { granted: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('request-accessibility-permissions', async () => {
      try {
        if (process.platform === 'darwin') {
          const { systemPreferences } = require('electron')
          if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
            // This will prompt the user and open System Preferences
            systemPreferences.isTrustedAccessibilityClient(true)
            return { success: true }
          }
        }
        return { success: false, message: 'Not supported on this platform' }
      } catch (error) {
        log.error('Error requesting accessibility permissions:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
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
      await this.cleanup()
      app.quit()
      return { success: true }
    })

    // Auto-updater controls
    ipcMain.handle('updater-check-for-updates', async () => {
      try {
        await autoUpdaterManager.checkForUpdates()
        return { success: true }
      } catch (error) {
        log.error('Error checking for updates:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-download-update', async () => {
      try {
        await autoUpdaterManager.downloadUpdate()
        return { success: true }
      } catch (error) {
        log.error('Error downloading update:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-quit-and-install', async () => {
      try {
        autoUpdaterManager.quitAndInstall()
        return { success: true }
      } catch (error) {
        log.error('Error installing update:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-get-status', async () => {
      try {
        return { success: true, data: autoUpdaterManager.getUpdateStatus() }
      } catch (error) {
        log.error('Error getting update status:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('app-get-version', async () => {
      return { success: true, version: app.getVersion() }
    })
  }

  private async initializeLaunchAtLogin(): Promise<void> {
    try {
      // Get the stored launch at login preference
      const launchAtLogin = await db.getSetting('launchAtLogin');
      const shouldLaunchAtLogin = launchAtLogin === 'true';

      // Apply the setting to the system
      app.setLoginItemSettings({
        openAtLogin: shouldLaunchAtLogin,
        openAsHidden: shouldLaunchAtLogin // Start hidden when launching at login
      });

      log.info('Launch at login setting applied:', shouldLaunchAtLogin);
    } catch (error) {
      log.error('Error initializing launch at login:', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      // Stop clipboard monitoring
      if (clipboardMonitor.isRunning()) {
        clipboardMonitor.stop()
      }

      // Unregister global shortcuts
      globalShortcut.unregisterAll()

      // Close database connection
      await db.disconnect()

      log.info('App cleanup completed')
    } catch (error) {
      log.error('Error during cleanup:', error)
    }
  }

  private async checkAccessibilityPermissions(): Promise<void> {
    try {
      log.info('🔒 Checking accessibility permissions...')

      // For macOS, we need to check if the app has accessibility permissions
      // This is required for clipboard monitoring in sandboxed environments
      const { systemPreferences, dialog } = require('electron')

      if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
        const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
        log.info('Accessibility permissions trusted:', isTrusted)

        if (!isTrusted) {
          log.info('⚠️ Accessibility permissions not granted. Clipboard monitoring may not work properly.')
          log.info('📖 Please go to System Preferences > Security & Privacy > Privacy > Accessibility and enable ClipDesk')

          // Show a user-friendly dialog explaining the need for permissions
          const result = await dialog.showMessageBox({
            type: 'warning',
            title: 'Accessibility Permissions Required',
            message: 'ClipDesk needs accessibility permissions to monitor clipboard changes from other applications.',
            detail: 'Without these permissions, ClipDesk can only detect clipboard changes when you copy text within ClipDesk itself.\n\nWould you like to open System Preferences to grant these permissions?',
            buttons: ['Open System Preferences', 'Continue Without Permissions', 'Quit'],
            defaultId: 0,
            cancelId: 1
          })

          if (result.response === 0) {
            // Try to prompt for permissions (this will open System Preferences)
            systemPreferences.isTrustedAccessibilityClient(true)
          } else if (result.response === 2) {
            // User chose to quit
            require('electron').app.quit()
            return
          }

          // Store permission status for later reference
          await db.setSetting('accessibilityPermissionsGranted', 'false')
        } else {
          log.info('✅ Accessibility permissions already granted')
          await db.setSetting('accessibilityPermissionsGranted', 'true')
        }
      } else {
        log.info('⚠️ systemPreferences.isTrustedAccessibilityClient not available')
        await db.setSetting('accessibilityPermissionsGranted', 'unknown')
      }
    } catch (error) {
      log.error('Error checking accessibility permissions:', error)
      await db.setSetting('accessibilityPermissionsGranted', 'error')
    }
  }

  private async showWindow(): Promise<void> {
    try {
      // Always show in dock when summoned (temporary visibility for interaction)
      if (process.platform === 'darwin') {
        app.dock?.show();
        log.info('🔧 Showing app in dock for user interaction');
      }

      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        
        // Show and focus the window
        this.mainWindow.show()
        this.mainWindow.focus()
        
        // Bring to front if on macOS
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
        }
        
        log.info('✅ Window shown and focused');
      } else {
        log.info('🔧 Creating new window...');
        this.createWindow()
        
        // Show the window after creation
        const window = this.mainWindow as BrowserWindow | null;
        if (window && !window.isDestroyed()) {
          window.show()
          window.focus()
          
          if (process.platform === 'darwin') {
            app.focus({ steal: true });
          }
          
          log.info('✅ New window created, shown and focused');
        }
      }
    } catch (error) {
      log.error('Error in showWindow:', error);
      
      // Fallback behavior
      if (process.platform === 'darwin') {
        app.dock?.show();
      }
      
      const window = this.mainWindow as BrowserWindow | null;
      if (window && !window.isDestroyed()) {
        window.show()
        window.focus()
      } else {
        this.createWindow()
        const newWindow = this.mainWindow as BrowserWindow | null;
        if (newWindow && !newWindow.isDestroyed()) {
          newWindow.show()
          newWindow.focus()
        }
      }
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
// Note: Don't force openAtLogin - let user control this via settings
// app.setLoginItemSettings({
//   openAtLogin: true,
//   openAsHidden: true, // Start hidden in system tray
// })

// Custom app property to track quit state
declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean
    }
  }
} 