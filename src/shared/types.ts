/**
 * Shared types between main and renderer processes
 */

export interface ClipboardItem {
  id: string
  content: string
  contentType: 'text' | 'image' | 'file' | 'link' | 'color'
  rawContent?: Buffer
  textContent?: string
  metadata?: Record<string, any>
  sourceApp?: string
  isSensitive?: boolean
  sensitiveTypes?: string[]
  sensitiveConfidence?: 'low' | 'medium' | 'high'
  createdAt: Date
  accessedAt: Date
  accessCount: number
  isFavorite: boolean
  tags?: Tag[]
}

export interface Tag {
  id: string
  name: string
  color?: string
  createdAt: Date
}

export interface AppSettings {
  maxHistoryItems: number
  autoStartup: boolean
  showInMenuBar: boolean
  globalShortcuts: {
    toggleWindow: string
    quickSearch: string
    quickPaste: string
  }
  excludedApps: string[]
  theme: 'light' | 'dark' | 'system'
}

export interface SearchFilters {
  contentType?: string
  sourceApp?: string
  dateRange?: {
    start: Date
    end: Date
  }
  isFavorite?: boolean
}

// IPC Events
export interface IPCEvents {
  'clipboard:get-history': () => ClipboardItem[]
  'clipboard:add-item': (item: Partial<ClipboardItem>) => void
  'clipboard:delete-item': (id: string) => void
  'clipboard:search': (query: string, filters?: SearchFilters) => ClipboardItem[]
  'settings:get': (key: keyof AppSettings) => any
  'settings:set': (key: keyof AppSettings, value: any) => void
  'settings:get-all': () => AppSettings
  'window:close': () => void
  'window:minimize': () => void
  'window:maximize': () => void
  'window:is-maximized': () => boolean
} 