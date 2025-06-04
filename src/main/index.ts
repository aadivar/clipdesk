import { app, BrowserWindow, Menu, Tray, globalShortcut, shell, nativeImage, ipcMain, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { clipboardMonitor } from './clipboardMonitor'
import { db } from '../shared/database'
import { autoUpdaterManager } from './autoUpdater'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
const SCHEME = 'clipdesk'

class ClipDeskApp {
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private trayContextMenu: Menu | null = null

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
        console.log('=== CLIPDESK STARTUP DEBUG ===')
        console.log('NODE_ENV:', process.env.NODE_ENV)
        console.log('isDev:', isDev)
        console.log('app.isPackaged:', app.isPackaged)
        console.log('app.getAppPath():', app.getAppPath())
        console.log('__dirname:', __dirname)
        console.log('process.cwd():', process.cwd())
        console.log('============================')

        // FIRST: Set up IPC handlers immediately - this is critical
        console.log('🔧 Setting up IPC handlers...')
        this.setupIPCHandlers()
        console.log('✅ IPC handlers set up successfully')

        // Register the protocol handler AFTER app is ready
        console.log('🔧 Registering protocol...')
        this.registerProtocol()
        console.log('✅ Protocol registered successfully')

        // Create window early so renderer can start
        console.log('🔧 Creating window...')
        this.createWindow()
        console.log('✅ Window created successfully')

        // Set main window for auto-updater
        if (this.mainWindow) {
          autoUpdaterManager.setMainWindow(this.mainWindow)
        }

        // Create tray
        console.log('🔧 Creating tray...')
        this.createTray()
        console.log('✅ Tray created successfully')

        // Check if app was launched at login and should start hidden
        const wasOpenedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
        if (wasOpenedAtLogin) {
          console.log('🔧 App was launched at login, starting hidden...')
          // Hide from dock immediately for login launch
          if (process.platform === 'darwin') {
            app.dock?.hide();
          }
        } else {
          // Show window on manual launch
          console.log('🔧 Manual launch detected, showing window...')
          this.showWindow();
        }

        // Apply initial dock hiding for hybrid mode (unless user wants it always in dock)
        if (process.platform === 'darwin') {
          try {
            const showInDock = await db.getSetting('showInDock');
            const shouldShowInDock = showInDock === 'true';
            
            if (!shouldShowInDock && !wasOpenedAtLogin) {
              // For manual launch, briefly show in dock then hide after window setup
              console.log('🔧 Hybrid mode detected, will hide from dock after window setup...')
              setTimeout(() => {
                app.dock?.hide();
                console.log('✅ App hidden from dock (hybrid mode)');
              }, 2000); // Give time for window to appear first
            }
          } catch (error) {
            console.error('Error checking dock setting:', error);
            // Default hybrid behavior - hide from dock unless manually launched
            if (wasOpenedAtLogin) {
              app.dock?.hide();
            }
          }
        }

        // Register shortcuts
        console.log('🔧 Registering shortcuts...')
        this.registerGlobalShortcuts()
        console.log('✅ Shortcuts registered successfully')

        // Check accessibility permissions (non-blocking)
        if (process.platform === 'darwin') {
          try {
            console.log('🔧 Checking accessibility permissions...')
            await this.checkAccessibilityPermissions()
            console.log('✅ Accessibility permissions checked')
          } catch (error) {
            console.error('❌ Accessibility permissions check failed:', error)
            // Continue anyway
          }
        }

        // Initialize database (non-blocking)
        try {
          console.log('🔧 Initializing database...')
          await db.initialize()
          console.log('✅ Database initialized successfully')
        } catch (error) {
          console.error('❌ Database initialization failed:', error)
          // Continue with app startup even if database fails
        }

        // Start clipboard monitoring (non-blocking)
        try {
          console.log('🔧 Starting clipboard monitoring...')
          await this.startClipboardMonitoring()
          console.log('✅ Clipboard monitoring started successfully')
        } catch (error) {
          console.error('❌ Clipboard monitoring failed to start:', error)
          // Continue with app startup even if clipboard monitoring fails
        }

        // Initialize launch at login setting
        try {
          console.log('🔧 Initializing launch at login setting...')
          await this.initializeLaunchAtLogin()
          console.log('✅ Launch at login setting initialized')
        } catch (error) {
          console.error('❌ Failed to initialize launch at login setting:', error)
        }

        console.log('✅ ClipDesk startup completed successfully')
      } catch (error) {
        console.error('❌ Critical error during app startup:', error)
        // Even if there's a critical error, try to set up basic IPC handlers
        try {
          this.setupIPCHandlers()
        } catch (ipcError) {
          console.error('❌ Failed to set up IPC handlers:', ipcError)
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
        console.error('Error checking runInMenubar setting in window-all-closed:', error);
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
        console.log('Production mode - App path:', basePath)
        console.log('Production mode - Full path:', fullPath)
      }

      console.log('Protocol request:', request.url)
      console.log('Resolved path:', fullPath)

      return new Promise((resolve, reject) => {
        fs.readFile(fullPath, (err, data) => {
          if (err) {
            console.error('File not found:', fullPath, err)
            reject(err)
            return
          }

          // Determine content type
          const ext = path.extname(filePath).toLowerCase()
          const mimeType = mimeTypes[ext] || 'application/octet-stream'

          console.log('Serving file:', filePath, 'as', mimeType)

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
      show: false, // Don't show immediately - let showWindow() handle it
      skipTaskbar: false, // Allow in dock initially
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
        console.warn('Dev server not available, loading via custom protocol')
        if (this.mainWindow) {
          this.mainWindow.loadURL(`${SCHEME}://localhost/index.html`)
        }
      })
      this.mainWindow.webContents.openDevTools()
    } else {
      // In production or packaged app, use custom protocol (this bypasses CSP completely)
      console.log('Production/Packaged app detected - using custom protocol')
      console.log('Loading renderer from:', `${SCHEME}://localhost/index.html`)
      
      try {
        this.mainWindow.loadURL(`${SCHEME}://localhost/index.html`)
        console.log('✅ Successfully loaded using custom protocol')
      } catch (error) {
        console.error('❌ Failed to load using custom protocol:', error)
      }
    }

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })

    // Handle window close behavior - implement hybrid mode
    this.mainWindow.on('close', async (event) => {
      try {
        // Always prevent close and hide instead (true hybrid mode for clipboard managers)
        event.preventDefault();
        
        console.log('🔧 Window close event - hiding window and app from dock');
        
        // Hide the window first
        this.mainWindow?.hide();

        // Always hide from dock when window is closed (unless user explicitly wants it in dock)
        if (process.platform === 'darwin') {
          try {
            const showInDock = await db.getSetting('showInDock');
            const shouldShowInDock = showInDock === 'true'; // Default to false for hybrid mode
            
            if (!shouldShowInDock) {
              console.log('🔧 Hiding app from dock...');
              // Use setTimeout to ensure the hide happens after the window is hidden
              setTimeout(() => {
                app.dock?.hide();
                console.log('✅ App hidden from dock');
              }, 100);
            } else {
              console.log('🔧 Keeping app in dock (user preference)');
            }
          } catch (error) {
            console.error('Error checking showInDock setting:', error);
            // Default behavior: hide from dock (true hybrid mode)
            console.log('🔧 Hiding app from dock (fallback)');
            setTimeout(() => {
              app.dock?.hide();
              console.log('✅ App hidden from dock (fallback)');
            }, 100);
          }
        }
      } catch (error) {
        console.error('Error in window close handler:', error);
        // Fallback: always hide on macOS (recommended behavior for clipboard managers)
        event.preventDefault();
        this.mainWindow?.hide();
        if (process.platform === 'darwin') {
          setTimeout(() => {
            app.dock?.hide();
            console.log('✅ App hidden from dock (error fallback)');
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

  private createTray(): void {
    // Use a proper path for the tray icon, with fallback
    let trayIcon: Electron.NativeImage
    try {
      let trayIconPath = isDev 
        ? path.join(__dirname, '../../assets/tray-icon-16.png')
        : path.join(app.getAppPath(), 'assets/tray-icon-16.png')
      
      // Fallback to original tray icon if 16px version doesn't exist
      if (!fs.existsSync(trayIconPath)) {
        console.log('🔧 16px tray icon not found, using original...')
        trayIconPath = isDev 
          ? path.join(__dirname, '../../assets/tray-icon.png')
          : path.join(app.getAppPath(), 'assets/tray-icon.png')
      }
      
      console.log('🔧 Loading tray icon from:', trayIconPath)
      trayIcon = nativeImage.createFromPath(trayIconPath)
      
      // Ensure icon is not empty
      if (trayIcon.isEmpty()) {
        throw new Error('Loaded tray icon is empty')
      }
      
      // Resize icon for macOS menubar (16x16 is optimal for menubar)
      if (process.platform === 'darwin') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
      }
      
      // Set template image for dark/light mode support on macOS
      if (process.platform === 'darwin') {
        trayIcon.setTemplateImage(true)
      }
      
      console.log('✅ Tray icon loaded successfully')
    } catch (error) {
      console.warn('Failed to load tray icon, creating simple fallback:', error)
      // Create a simple black square as fallback
      trayIcon = nativeImage.createFromBuffer(Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 16, 
        8, 2, 0, 0, 0, 144, 145, 104, 54, 0, 0, 0, 25, 116, 69, 88, 116, 83, 111, 102, 116, 119, 
        97, 114, 101, 0, 65, 100, 111, 98, 101, 32, 73, 109, 97, 103, 101, 82, 101, 97, 100, 121, 
        113, 201, 101, 60, 0, 0, 0, 46, 73, 68, 65, 84, 120, 218, 98, 96, 96, 96, 248, 15, 4, 12, 
        12, 140, 140, 140, 140, 204, 44, 0, 34, 5, 5, 69, 81, 81, 17, 139, 197, 98, 177, 88, 44, 
        22, 139, 197, 98, 177, 88, 44, 22, 139, 197, 98, 1, 0, 153, 96, 30, 184, 136, 132, 17, 0, 
        0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
      ]))
      if (process.platform === 'darwin') {
        trayIcon.setTemplateImage(true)
      }
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
        label: 'Check for Updates',
        click: async () => {
          await autoUpdaterManager.checkForUpdates()
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
        click: async () => {
          await this.cleanup()
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
    
    console.log('✅ Tray created and configured')
  }

  private async showWindow(): Promise<void> {
    try {
      // Always show in dock when window is shown (temporarily for hybrid mode)
      if (process.platform === 'darwin') {
        app.dock?.show();
        console.log('🔧 Showing app in dock for window display');
      }

      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
        console.log('✅ Window shown and focused');
      } else {
        console.log('🔧 Creating new window...');
        this.createWindow()
        // Show the window after creation
        const window = this.mainWindow as BrowserWindow | null;
        if (window && !window.isDestroyed()) {
          window.show()
          window.focus()
          console.log('✅ New window created, shown and focused');
        }
      }
    } catch (error) {
      console.error('Error in showWindow:', error);
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

  private registerGlobalShortcuts(): void {
    // Main ClipDesk shortcut (Cmd/Ctrl + Shift + V)
    globalShortcut.register('CommandOrControl+Shift+V', () => {
      this.showWindow()
    })
  }

  private async startClipboardMonitoring(): Promise<void> {
    try {
      console.log('🔧 startClipboardMonitoring() called')
      console.log('🔧 App is packaged:', app.isPackaged)
      console.log('🔧 Process platform:', process.platform)

      // Send debug info to renderer
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', '🔧 Starting clipboard monitoring...')
        this.mainWindow.webContents.send('debug-log', `🔧 App is packaged: ${app.isPackaged}`)
      }

      // Start clipboard monitoring
      console.log('🔧 Calling clipboardMonitor.start()...')
      await clipboardMonitor.start();
      console.log('🔧 clipboardMonitor.start() completed')

      // Check status after start
      const isRunning = clipboardMonitor.isRunning();
      console.log('🔧 Monitor running after start:', isRunning)

      console.log('✅ Clipboard monitoring started successfully')
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', '✅ Clipboard monitoring started successfully')
        this.mainWindow.webContents.send('debug-log', `📊 Monitor running: ${isRunning}`)
      }

      // Listen for clipboard changes
      clipboardMonitor.on('clipboardChanged', async (content) => {
        console.log('📋 Clipboard changed in main:', content.type);
        
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
            if (this.mainWindow && this.mainWindow.webContents) {
              this.mainWindow.webContents.send('debug-log', '⚠️ No recent items found in database')
            }
          }
        } catch (error) {
          console.error('❌ Error sending clipboard change to renderer:', error);
          if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('debug-log', `❌ Error: ${error}`)
          }
        }
      });

      console.log('Clipboard monitoring started successfully');
    } catch (error) {
      console.error('Failed to start clipboard monitoring:', error);
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('debug-log', `❌ Failed to start clipboard monitoring: ${error}`)
      }
    }
  }

  private toggleClipboardMonitoring(): void {
    console.log('🔧 toggleClipboardMonitoring called')
    console.log('🔧 Current monitoring status:', clipboardMonitor.isRunning())

    if (clipboardMonitor.isRunning()) {
      console.log('🔧 Stopping clipboard monitoring...')
      clipboardMonitor.stop()
      this.updateTrayMenu('Resume Monitoring')
      console.log('🔧 Clipboard monitoring stopped')
    } else {
      console.log('🔧 Starting clipboard monitoring...')
      clipboardMonitor.start()
      this.updateTrayMenu('Pause Monitoring')
      console.log('🔧 Clipboard monitoring start initiated')
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
        // Check if database is initialized
        if (!db.isInitialized()) {
          console.warn('Database not initialized, returning empty array for clipboard items')
          return []
        }
        const { limit = 50, offset = 0, contentType, searchQuery } = options
        return await db.getClipboardItems(limit, offset, contentType, searchQuery)
      } catch (error) {
        console.error('Error getting clipboard items:', error)
        return [] // Return empty array instead of throwing
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
        // Check if database is initialized
        if (!db.isInitialized()) {
          console.warn('Database not initialized, returning null for setting:', key)
          return null
        }
        return await db.getSetting(key)
      } catch (error) {
        console.error('Error getting setting:', error)
        return null // Return null instead of throwing
      }
    })

    ipcMain.handle('settings-set', async (event, key: string, value: string) => {
      try {
        // Check if database is initialized
        if (!db.isInitialized()) {
          console.warn('Database not initialized, cannot set setting:', key)
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
        console.error('Error setting value:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
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

    // Sensitive data controls
    ipcMain.handle('sensitive-data-settings-get', async () => {
      try {
        return await clipboardMonitor.getSensitiveDataSettings()
      } catch (error) {
        console.error('Error getting sensitive data settings:', error)
        throw error
      }
    })

    ipcMain.handle('sensitive-data-settings-update', async (event, enabled: boolean, level: 'strict' | 'moderate' | 'permissive') => {
      try {
        await clipboardMonitor.updateSensitiveDataSettings(enabled, level)
        return { success: true }
      } catch (error) {
        console.error('Error updating sensitive data settings:', error)
        throw error
      }
    })

    ipcMain.handle('sensitive-data-type-description', async (event, type: string) => {
      try {
        return clipboardMonitor.getSensitiveDataTypeDescription(type)
      } catch (error) {
        console.error('Error getting sensitive data type description:', error)
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

    ipcMain.handle('test-clipboard-access', async () => {
      try {
        return await clipboardMonitor.testClipboardAccess()
      } catch (error) {
        console.error('Error testing clipboard access:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Debug method to manually trigger clipboard check
    ipcMain.handle('debug-check-clipboard', async () => {
      try {
        console.log('🔧 Manual clipboard check triggered from renderer')
        if (this.mainWindow && this.mainWindow.webContents) {
          this.mainWindow.webContents.send('debug-log', '🔧 Manual clipboard check triggered')
        }

        // Force a clipboard check
        await (clipboardMonitor as any).checkClipboard()

        return { success: true }
      } catch (error) {
        console.error('Error in manual clipboard check:', error)
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
        console.error('Error checking accessibility permissions:', error)
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
        console.error('Error requesting accessibility permissions:', error)
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
        console.error('Error checking for updates:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-download-update', async () => {
      try {
        await autoUpdaterManager.downloadUpdate()
        return { success: true }
      } catch (error) {
        console.error('Error downloading update:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-quit-and-install', async () => {
      try {
        autoUpdaterManager.quitAndInstall()
        return { success: true }
      } catch (error) {
        console.error('Error installing update:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    ipcMain.handle('updater-get-status', async () => {
      try {
        return { success: true, data: autoUpdaterManager.getUpdateStatus() }
      } catch (error) {
        console.error('Error getting update status:', error)
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

      console.log('Launch at login setting applied:', shouldLaunchAtLogin);
    } catch (error) {
      console.error('Error initializing launch at login:', error);
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

      console.log('App cleanup completed')
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }

  private async checkAccessibilityPermissions(): Promise<void> {
    try {
      console.log('🔒 Checking accessibility permissions...')

      // For macOS, we need to check if the app has accessibility permissions
      // This is required for clipboard monitoring in sandboxed environments
      const { systemPreferences, dialog } = require('electron')

      if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
        const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
        console.log('Accessibility permissions trusted:', isTrusted)

        if (!isTrusted) {
          console.log('⚠️ Accessibility permissions not granted. Clipboard monitoring may not work properly.')
          console.log('📖 Please go to System Preferences > Security & Privacy > Privacy > Accessibility and enable ClipDesk')

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
          console.log('✅ Accessibility permissions already granted')
          await db.setSetting('accessibilityPermissionsGranted', 'true')
        }
      } else {
        console.log('⚠️ systemPreferences.isTrustedAccessibilityClient not available')
        await db.setSetting('accessibilityPermissionsGranted', 'unknown')
      }
    } catch (error) {
      console.error('Error checking accessibility permissions:', error)
      await db.setSetting('accessibilityPermissionsGranted', 'error')
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