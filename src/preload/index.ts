import { contextBridge, ipcRenderer } from 'electron'

// Event queue to store events before listeners are ready
const eventQueue: Array<{ channel: string; data: any }> = []
const activeListeners = new Map<string, (...args: any[]) => void>()

// Process queued events when a listener is registered
const processQueuedEvents = (channel: string, listener: (...args: any[]) => void) => {
  const queuedEvents = eventQueue.filter(event => event.channel === channel)
  if (queuedEvents.length > 0) {
    console.log(`📦 Processing ${queuedEvents.length} queued events for channel: ${channel}`)
    queuedEvents.forEach(event => {
      try {
        listener(event.data)
      } catch (error) {
        console.error('❌ Error processing queued event:', error)
      }
    })
    // Remove processed events from queue
    eventQueue.splice(0, eventQueue.length, ...eventQueue.filter(event => event.channel !== channel))
  }
}

// Queue events that arrive before listeners are set up
ipcRenderer.on('clipboard-changed', (event, data) => {
  const listener = activeListeners.get('clipboard-changed')
  if (listener) {
    console.log('📨 Clipboard event received and delivered')
    try {
      listener(data)
    } catch (error) {
      console.error('❌ Error in direct listener:', error)
    }
  } else {
    console.log('📬 Queueing clipboard event (no listener yet)')
    eventQueue.push({ channel: 'clipboard-changed', data })
  }
})

// Queue debug log events
ipcRenderer.on('debug-log', (event, data) => {
  const listener = activeListeners.get('debug-log')
  if (listener) {
    console.log('📨 Debug log event received and delivered')
    try {
      listener(data)
    } catch (error) {
      console.error('❌ Error in debug log listener:', error)
    }
  } else {
    console.log('📬 Queueing debug log event (no listener yet)')
    eventQueue.push({ channel: 'debug-log', data })
  }
})

// Define the API interface that will be available in the renderer
interface ClipDeskAPI {
  // Window management
  window: {
    close: () => void
    minimize: () => void
    maximize: () => void
    isMaximized: () => Promise<boolean>
  }

  // Clipboard operations
  clipboard: {
    getHistory: (options?: {
      limit?: number
      offset?: number
      contentType?: string
      searchQuery?: string
    }) => Promise<any[]>
    toggleFavorite: (id: string) => Promise<any>
    deleteItem: (id: string) => Promise<{ success: boolean }>
    clearHistory: () => Promise<{ success: boolean }>
    copyItem: (content: string) => Promise<{ success: boolean }>
  }

  // Tags operations
  tags: {
    getAll: () => Promise<any[]>
    create: (name: string, color?: string) => Promise<any>
    addToItem: (itemId: string, tagId: string) => Promise<{ success: boolean }>
  }

  // Snippets operations
  snippets: {
    getAll: () => Promise<any[]>
    create: (snippet: {
      name: string
      content: string
      shortcut?: string
      variables?: any
    }) => Promise<any>
  }

  // Settings management
  settings: {
    get: (key: string) => Promise<any>
    set: (key: string, value: string) => Promise<{ success: boolean }>
  }

  // Monitor controls
  monitor: {
    toggle: () => Promise<{ success: boolean; isRunning: boolean }>
    getStatus: () => Promise<{ isRunning: boolean }>
    testClipboardAccess: () => Promise<{ success: boolean; error?: string; details?: any }>
    debugCheckClipboard: () => Promise<{ success: boolean; error?: string }>
  }

  permissions: {
    checkAccessibility: () => Promise<{ granted: boolean; error?: string }>
    requestAccessibility: () => Promise<{ success: boolean; message?: string; error?: string }>
  }

  // Sensitive data controls
  sensitiveData: {
    getSettings: () => Promise<{ enabled: boolean; level: 'strict' | 'moderate' | 'permissive' }>
    updateSettings: (enabled: boolean, level: 'strict' | 'moderate' | 'permissive') => Promise<{ success: boolean }>
    getTypeDescription: (type: string) => Promise<string>
  }

  // App controls
  app: {
    showWindow: () => Promise<{ success: boolean }>
    hideWindow: () => Promise<{ success: boolean }>
    quit: () => Promise<{ success: boolean }>
    getVersion: () => Promise<{ success: boolean; version: string }>
  }

  updater: {
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>
    quitAndInstall: () => Promise<{ success: boolean; error?: string }>
    getStatus: () => Promise<{ success: boolean; data?: { available: boolean; downloaded: boolean }; error?: string }>
  }

  // Event listeners
  on: (channel: string, listener: (...args: any[]) => void) => void
  off: (channel: string, listener: (...args: any[]) => void) => void
  
  // System information
  system: {
    platform: string
    version: string
  }
}

// Implement the API
const api: ClipDeskAPI = {
  window: {
    close: () => ipcRenderer.invoke('window:close'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  clipboard: {
    getHistory: (options = {}) => ipcRenderer.invoke('clipboard-get-items', options),
    toggleFavorite: (id: string) => ipcRenderer.invoke('clipboard-toggle-favorite', id),
    deleteItem: (id: string) => ipcRenderer.invoke('clipboard-delete-item', id),
    clearHistory: () => ipcRenderer.invoke('clipboard-clear-history'),
    copyItem: (content: string) => ipcRenderer.invoke('clipboard-copy-item', content),
  },

  tags: {
    getAll: () => ipcRenderer.invoke('tags-get-all'),
    create: (name: string, color?: string) => ipcRenderer.invoke('tags-create', name, color),
    addToItem: (itemId: string, tagId: string) => ipcRenderer.invoke('tags-add-to-item', itemId, tagId),
  },

  snippets: {
    getAll: () => ipcRenderer.invoke('snippets-get-all'),
    create: (snippet) => ipcRenderer.invoke('snippets-create', snippet),
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings-get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings-set', key, value),
  },

  monitor: {
    toggle: () => ipcRenderer.invoke('monitor-toggle'),
    getStatus: () => ipcRenderer.invoke('monitor-status'),
    testClipboardAccess: () => ipcRenderer.invoke('test-clipboard-access'),
    debugCheckClipboard: () => ipcRenderer.invoke('debug-check-clipboard'),
  },

  permissions: {
    checkAccessibility: () => ipcRenderer.invoke('check-accessibility-permissions'),
    requestAccessibility: () => ipcRenderer.invoke('request-accessibility-permissions'),
  },

  sensitiveData: {
    getSettings: () => ipcRenderer.invoke('sensitive-data-settings-get'),
    updateSettings: (enabled: boolean, level: 'strict' | 'moderate' | 'permissive') =>
      ipcRenderer.invoke('sensitive-data-settings-update', enabled, level),
    getTypeDescription: (type: string) => ipcRenderer.invoke('sensitive-data-type-description', type),
  },

  app: {
    showWindow: () => ipcRenderer.invoke('app-show-window'),
    hideWindow: () => ipcRenderer.invoke('app-hide-window'),
    quit: () => ipcRenderer.invoke('app-quit'),
    getVersion: () => ipcRenderer.invoke('app-get-version'),
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater-check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('updater-download-update'),
    quitAndInstall: () => ipcRenderer.invoke('updater-quit-and-install'),
    getStatus: () => ipcRenderer.invoke('updater-get-status'),
  },

  on: (channel: string, listener: (...args: any[]) => void) => {
    // Whitelist of allowed channels
    const validChannels = [
      'clipboard-changed',
      'debug-log',
      'show-preferences',
      'focus-search',
      'settings-changed',
      'update-status'
    ]
    
    console.log('🔗 Setting up IPC listener for channel:', channel)
    
    if (validChannels.includes(channel)) {
      // Store the listener in our active listeners map
      activeListeners.set(channel, listener)
      console.log('✅ IPC listener registered for channel:', channel)
      
      // Process any queued events for this channel
      processQueuedEvents(channel, listener)
    } else {
      console.error('❌ Invalid channel attempted:', channel)
    }
  },

  off: (channel: string, listener: (...args: any[]) => void) => {
    console.log('🔌 Removing IPC listener for channel:', channel)
    
    // Remove from active listeners map
    if (activeListeners.get(channel) === listener) {
      activeListeners.delete(channel)
      console.log('✅ Removed IPC listener for channel:', channel)
    } else {
      console.log('⚠️ Listener not found for channel:', channel)
    }
  },

  system: {
    platform: process.platform,
    version: process.versions.electron || 'unknown',
  },
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('clipdesk', api)

// Type declaration for TypeScript support in renderer
declare global {
  interface Window {
    clipdesk: ClipDeskAPI
  }
} 