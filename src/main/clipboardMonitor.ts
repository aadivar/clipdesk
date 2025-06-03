import { clipboard, nativeImage, NativeImage } from 'electron';
import { EventEmitter } from 'events';
import { db } from '../shared/database';
import path from 'path';
import { promises as fs } from 'fs';

export interface ClipboardContent {
  type: 'text' | 'image' | 'file' | 'link' | 'color';
  content: string;
  rawContent?: Buffer;
  metadata?: any;
}

export class ClipboardMonitor extends EventEmitter {
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private timeoutId?: NodeJS.Timeout;
  private lastClipboardContent: string = '';
  private lastClipboardContentHash: string = '';
  private pollInterval = 500; // ms
  private excludedApps: Set<string> = new Set();
  private useTimeoutPolling = false; // Fallback for packaged apps

  constructor() {
    super();
    this.loadExcludedApps();
  }

  async start(): Promise<void> {
    if (this.isMonitoring) return;

    console.log('🚀 Starting clipboard monitoring...')
    this.isMonitoring = true;

    // Detect if we're in a packaged app
    const { app } = require('electron');
    const isPackaged = app.isPackaged;
    console.log('📦 App is packaged:', isPackaged);

    // Use timeout polling for packaged apps as setInterval can be unreliable
    this.useTimeoutPolling = isPackaged;
    console.log('⏰ Using timeout polling:', this.useTimeoutPolling);

    // Initialize database
    await db.initialize();

    // Get initial clipboard state
    console.log('📋 Getting initial clipboard state...')
    try {
      this.lastClipboardContent = clipboard.readText() || '';
      console.log('📝 Initial clipboard content:', this.lastClipboardContent.substring(0, 100) + '...')
      this.lastClipboardContentHash = this.generateHash(this.lastClipboardContent);
      console.log('🔑 Initial clipboard hash:', this.lastClipboardContentHash)
    } catch (error) {
      console.error('❌ Error reading initial clipboard:', error)
    }

    // Start polling
    console.log('⏰ Starting clipboard polling every', this.pollInterval, 'ms')

    if (this.useTimeoutPolling) {
      console.log('⏰ Using setTimeout-based polling for packaged app...')
      this.startTimeoutPolling();
    } else {
      console.log('⏰ Using setInterval-based polling for development...')
      this.startIntervalPolling();
    }

    // Force an immediate check
    console.log('🔍 Forcing immediate clipboard check...')
    setTimeout(() => this.checkClipboard(), 100);

    this.emit('started');
    console.log('✅ Clipboard monitoring started successfully');
  }

  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    this.emit('stopped');
    console.log('Clipboard monitoring stopped');
  }

  private startIntervalPolling(): void {
    this.intervalId = setInterval(() => {
      console.log('⏰ Interval tick - calling checkClipboard()')
      this.checkClipboard();
    }, this.pollInterval);
    console.log('⏰ Interval ID:', this.intervalId)
  }

  private startTimeoutPolling(): void {
    console.log('🔧 startTimeoutPolling() called')

    const poll = () => {
      console.log('⏰ Timeout tick - checking if monitoring is active:', this.isMonitoring)
      if (!this.isMonitoring) {
        console.log('⏰ Monitoring stopped, ending timeout polling')
        return;
      }

      console.log('⏰ Timeout tick - calling checkClipboard()')
      this.checkClipboard().finally(() => {
        console.log('⏰ checkClipboard() completed, scheduling next check')
        if (this.isMonitoring) {
          this.timeoutId = setTimeout(poll, this.pollInterval);
          console.log('⏰ Next timeout scheduled with ID:', this.timeoutId)
        } else {
          console.log('⏰ Monitoring stopped during check, not scheduling next')
        }
      });
    };

    // Start the polling chain
    console.log('⏰ Starting initial timeout with interval:', this.pollInterval)
    this.timeoutId = setTimeout(poll, this.pollInterval);
    console.log('⏰ Timeout polling started with ID:', this.timeoutId)
  }

  private async checkClipboard(): Promise<void> {
    try {
      console.log('🔍 Checking clipboard...')

      // Check if we have accessibility permissions on macOS
      if (process.platform === 'darwin') {
        try {
          const { systemPreferences } = require('electron')
          if (systemPreferences && systemPreferences.isTrustedAccessibilityClient) {
            const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
            if (!isTrusted) {
              console.log('⚠️ Accessibility permissions not granted, clipboard monitoring may be limited')
              // Continue anyway - we can still detect some clipboard changes
            }
          }
        } catch (permError) {
          console.log('⚠️ Could not check accessibility permissions:', permError instanceof Error ? permError.message : String(permError))
        }
      }

      const currentContent = await this.getCurrentClipboardContent();

      console.log('🔍 getCurrentClipboardContent result:', currentContent ? 'Found content' : 'NULL - no content')

      if (!currentContent) {
        console.log('❌ No clipboard content detected')
        return
      }

      console.log('📋 Clipboard content detected:', currentContent.type, currentContent.content.substring(0, 50) + '...')

      const currentHash = this.generateHash(currentContent.content);

      console.log('🔑 Current hash:', currentHash)
      console.log('🔑 Last hash:', this.lastClipboardContentHash)
      console.log('🔍 Hashes equal?', currentHash === this.lastClipboardContentHash)

      // Check if content has changed
      if (currentHash !== this.lastClipboardContentHash) {
        console.log('🆕 Clipboard content changed!')
        this.lastClipboardContent = currentContent.content;
        this.lastClipboardContentHash = currentHash;

        // Skip if from excluded app
        console.log('🔍 Getting source application...')
        const sourceApp = await this.getSourceApplication();
        console.log('📱 Source app:', sourceApp)

        console.log('🔍 Checking if app is excluded...')
        console.log('🔍 Excluded apps:', Array.from(this.excludedApps))

        if (sourceApp && this.excludedApps.has(sourceApp.toLowerCase())) {
          console.log('🚫 Skipping excluded app:', sourceApp)
          return;
        } else {
          console.log('✅ App not excluded, proceeding...')
        }

        // Process and store the new clipboard content
        console.log('💾 Processing clipboard content...')
        try {
          await this.processClipboardContent(currentContent, sourceApp || undefined);
          console.log('✅ Clipboard content processed successfully')
        } catch (error) {
          console.error('❌ Error in processClipboardContent:', error)
        }

        console.log('📤 Emitting clipboard-changed event')
        this.emit('clipboardChanged', currentContent);
      } else {
        console.log('📝 Clipboard content unchanged')
      }
    } catch (error) {
      console.error('❌ Error checking clipboard:', error);
    }
  }

  private async getCurrentClipboardContent(): Promise<ClipboardContent | null> {
    try {
      console.log('🔍 getCurrentClipboardContent: Starting clipboard content detection...')

      // Check for different content types in order of priority
      // IMPORTANT: Order matters! More specific types should be checked first

      // Special case: Check if we have both image and file data (common when copying files from Finder)
      console.log('🔍 Reading text content from clipboard...')
      const textContent = clipboard.readText();
      console.log('🔍 Text content length:', textContent ? textContent.length : 0)

      console.log('🔍 Reading image data from clipboard...')
      const hasImageData = !clipboard.readImage().isEmpty();
      console.log('🔍 Has image data:', hasImageData)

      const hasFileData = textContent && this.isFilePath(textContent);
      console.log('🔍 Has file data:', hasFileData)

      // If we have both image and file data, prefer file detection
      // This handles the case where Finder puts both file path and file icon in clipboard
      if (hasImageData && hasFileData) {
        console.log('🔍 Both image and file data detected, checking file content...')
        const fileContent = await this.getFileContent();
        if (fileContent) {
          console.log('🔍 File content detected:', fileContent.type)
          return fileContent;
        }
      }

      // 1. Check for images first (highest priority for visual content)
      console.log('🔍 Checking for image content...')
      const imageContent = await this.getImageContent();
      if (imageContent) {
        console.log('🔍 Image content found:', imageContent.type)
        return imageContent;
      }

      // 2. Check for files (before text, since file paths might be text)
      console.log('🔍 Checking for file content...')
      const filesContent = await this.getFileContent();
      if (filesContent) {
        console.log('🔍 File content found:', filesContent.type)
        return filesContent;
      }

      // 3. Check for text content last (most general, includes links, colors, etc.)
      console.log('🔍 Checking for text content...')
      const finalTextContent = await this.getTextContent();
      if (finalTextContent) {
        console.log('🔍 Text content found:', finalTextContent.type)
        return finalTextContent;
      }

      console.log('🔍 No clipboard content detected')
      return null;
    } catch (error) {
      console.error('❌ Error in getCurrentClipboardContent:', error)
      return null;
    }
  }

  private async getFileContent(): Promise<ClipboardContent | null> {
    try {
      // Note: Electron's clipboard API doesn't directly support file paths
      // This is a platform-specific implementation that would need native modules
      // For now, we'll detect file paths in text content
      const text = clipboard.readText();
      
      if (text && this.isFilePath(text)) {
        const filePath = text.trim();
        
        try {
          // Try to get file stats if the file exists
          const stats = await fs.stat(filePath);
          
          return {
            type: 'file',
            content: filePath,
            metadata: {
              fileName: path.basename(filePath),
              fileSize: stats.size,
              fileType: path.extname(filePath),
              isDirectory: stats.isDirectory(),
              isFile: stats.isFile(),
              fullPath: filePath,
              exists: true,
            },
          };
        } catch (e) {
          // File doesn't exist on disk, but it still looks like a file path/name
          // This could be a file that was moved, deleted, or copied from another system
          const fileName = path.basename(filePath);
          const fileExt = path.extname(filePath);
          
          return {
            type: 'file',
            content: filePath,
            metadata: {
              fileName: fileName,
              fileSize: 0,
              fileType: fileExt,
              isDirectory: false,
              isFile: true,
              fullPath: filePath,
              exists: false,
              reason: 'File not found or inaccessible'
            },
          };
        }
      }
    } catch (error) {
      console.error('Error getting file content:', error);
    }
    return null;
  }

  private async getImageContent(): Promise<ClipboardContent | null> {
    try {
      const image: NativeImage = clipboard.readImage();
      
      if (!image.isEmpty()) {
        const buffer = image.toPNG();
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        
        return {
          type: 'image',
          content: dataUrl,
          rawContent: buffer,
          metadata: {
            format: 'png',
            size: buffer.length,
            dimensions: image.getSize(),
          },
        };
      }
    } catch (error) {
      console.error('Error getting image content:', error);
    }
    return null;
  }

  private async getTextContent(): Promise<ClipboardContent | null> {
    try {
      console.log('🔍 getTextContent: Reading text from clipboard...')
      const text = clipboard.readText();
      console.log('🔍 getTextContent: Text length:', text ? text.length : 0)

      if (!text || text.trim().length === 0) {
        console.log('🔍 getTextContent: No text content or empty text')
        return null;
      }

      // Detect content subtype
      console.log('🔍 getTextContent: Detecting content type...')
      const contentType = this.detectTextContentType(text);
      console.log('🔍 getTextContent: Detected type:', contentType)

      const result = {
        type: contentType,
        content: text,
        metadata: this.generateTextMetadata(text, contentType),
      };

      console.log('🔍 getTextContent: Returning content with type:', result.type)
      return result;
    } catch (error) {
      console.error('❌ Error getting text content:', error);
    }
    return null;
  }

  private detectTextContentType(text: string): 'text' | 'link' | 'color' {
    const trimmed = text.trim();

    // Check for URLs
    try {
      new URL(trimmed);
      return 'link';
    } catch (e) {
      // Not a URL
    }

    // Check for color codes
    if (this.isColorCode(trimmed)) {
      return 'color';
    }

    return 'text';
  }

  private isColorCode(text: string): boolean {
    // Hex colors
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(text)) return true;
    
    // RGB/RGBA
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/i.test(text)) return true;
    
    // HSL/HSLA
    if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+)?\s*\)$/i.test(text)) return true;
    
    return false;
  }

  private isFilePath(text: string): boolean {
    const trimmed = text.trim();
    
    // Check for file extensions (most reliable indicator)
    const hasFileExtension = /\.[a-zA-Z0-9]{1,10}$/.test(trimmed);
    
    // Check for various path patterns
    const isAbsolutePath = path.isAbsolute(trimmed);
    const isWindowsPath = /^[a-zA-Z]:\\/.test(trimmed);
    const isUnixPath = /^\//.test(trimmed);
    const isHomePath = /^~\//.test(trimmed);
    
    // Check for common file naming patterns
    const hasSpacesAndExtension = /\s+.*\.[a-zA-Z0-9]{1,10}$/.test(trimmed);
    const looksLikeFileName = /^[^\/\\]+\.[a-zA-Z0-9]{1,10}$/.test(trimmed);
    
    // If it has a file extension, it's likely a file
    if (hasFileExtension) {
      // Additional checks to confirm it's really a file path
      if (isAbsolutePath || isWindowsPath || isUnixPath || isHomePath) {
        return true;
      }
      
      // Check if it's just a filename (like "document.pdf" or "Research_Performance_Analysis.pptx")
      if (looksLikeFileName || hasSpacesAndExtension) {
        return true;
      }
      
      // Check for common file extensions
      const commonExtensions = [
        // Documents
        'txt', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx',
        'pages', 'numbers', 'key', // Apple iWork formats
        'rtf', 'odt', 'ods', 'odp', // OpenOffice formats
        
        // Images  
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'tiff', 'tif',
        'webp', 'ico', 'heic', 'heif', 'raw', 'psd', 'ai',
        
        // Audio/Video
        'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'wav', 'mkv',
        'm4a', 'aac', 'flac', 'ogg', 'webm', 'm4v', 'f4v',
        
        // Archives
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg',
        
        // Code files
        'js', 'ts', 'html', 'css', 'json', 'xml', 'csv', 'yaml', 'yml',
        'py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs', 'swift',
        'jsx', 'tsx', 'vue', 'scss', 'sass', 'less', 'sql', 'sh', 'bat',
        
        // Applications
        'exe', 'dmg', 'pkg', 'deb', 'rpm', 'msi', 'app',
        
        // Design files
        'sketch', 'fig', 'figma', 'xd', 'xcf', 'blend',
        
        // Other formats
        'epub', 'mobi', 'azw', 'azw3', 'fb2', 'torrent'
      ];
      
      const extension = trimmed.split('.').pop()?.toLowerCase();
      if (extension && commonExtensions.includes(extension)) {
        return true;
      }
    }
    
    // Check for explicit path patterns even without extensions (directories)
    if (isAbsolutePath || isWindowsPath || isUnixPath || isHomePath) {
      return true;
    }
    
    return false;
  }

  private generateTextMetadata(text: string, contentType: string): any {
    const metadata: any = {
      length: text.length,
      wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
      lineCount: text.split('\n').length,
    };

    if (contentType === 'link') {
      try {
        const url = new URL(text.trim());
        metadata.domain = url.hostname;
        metadata.protocol = url.protocol;
        metadata.pathname = url.pathname;
      } catch (e) {
        // Invalid URL
      }
    }

    if (contentType === 'color') {
      metadata.colorFormat = this.getColorFormat(text.trim());
    }

    // Detect programming language
    metadata.language = this.detectProgrammingLanguage(text);

    return metadata;
  }

  private getColorFormat(color: string): string {
    if (color.startsWith('#')) return 'hex';
    if (color.startsWith('rgb')) return color.includes('rgba') ? 'rgba' : 'rgb';
    if (color.startsWith('hsl')) return color.includes('hsla') ? 'hsla' : 'hsl';
    return 'unknown';
  }

  private detectProgrammingLanguage(text: string): string | null {
    // Simple language detection based on patterns
    const patterns = [
      { lang: 'json', pattern: /^\s*[\[\{].*[\]\}]\s*$/s },
      { lang: 'html', pattern: /^\s*<(!DOCTYPE|html|head|body|div|span|p|a|img)/i },
      { lang: 'css', pattern: /^\s*[.#]?[\w-]+\s*\{.*\}\s*$/s },
      { lang: 'javascript', pattern: /\b(function|const|let|var|import|export|class|=>)\b/ },
      { lang: 'python', pattern: /\b(def|import|from|class|if __name__|print)\b/ },
      { lang: 'java', pattern: /\b(public|private|class|import java|System\.out)\b/ },
      { lang: 'c++', pattern: /\b(#include|using namespace|cout|cin)\b/ },
      { lang: 'sql', pattern: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i },
    ];

    for (const { lang, pattern } of patterns) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return null;
  }

  private async processClipboardContent(
    content: ClipboardContent,
    sourceApp?: string
  ): Promise<void> {
    try {
      console.log('💾 Starting to process clipboard content...')
      console.log('📝 Content type:', content.type)
      console.log('📝 Content length:', content.content.length)
      console.log('📝 Source app:', sourceApp)
      console.log('📝 Content preview:', content.content.substring(0, 100) + '...')
      
      // Store in database
      console.log('💾 Calling db.addClipboardItem...')
      console.log('📝 Metadata:', content.metadata)
      const result = await db.addClipboardItem(
        content.content,
        content.type,
        sourceApp,
        content.rawContent,
        content.metadata
      );
      
      console.log('✅ Database item added successfully:', result);
      console.log(`✅ Stored clipboard item: ${content.type} from ${sourceApp || 'unknown'}`);
    } catch (error) {
      console.error('❌ Error processing clipboard content:', error);
      console.error('❌ Failed content:', {
        type: content.type,
        contentLength: content.content.length,
        sourceApp
      });
    }
  }

  private async getSourceApplication(): Promise<string | null> {
    try {
      // Basic source app detection using Electron APIs
      const { BrowserWindow } = require('electron');
      const focusedWindow = BrowserWindow.getFocusedWindow();
      
      if (focusedWindow) {
        const title = focusedWindow.getTitle();
        
        // Extract app name from window title patterns
        if (title.includes('Visual Studio Code')) return 'Visual Studio Code';
        if (title.includes('Chrome') || title.includes('Google Chrome')) return 'Google Chrome';
        if (title.includes('Safari')) return 'Safari';
        if (title.includes('Firefox')) return 'Firefox';
        if (title.includes('Slack')) return 'Slack';
        if (title.includes('Discord')) return 'Discord';
        if (title.includes('Terminal')) return 'Terminal';
        if (title.includes('iTerm')) return 'iTerm';
        if (title.includes('Finder')) return 'Finder';
        if (title.includes('Notes')) return 'Notes';
        if (title.includes('TextEdit')) return 'TextEdit';
        if (title.includes('Word')) return 'Microsoft Word';
        if (title.includes('Excel')) return 'Microsoft Excel';
        if (title.includes('PowerPoint')) return 'Microsoft PowerPoint';
        if (title.includes('Notion')) return 'Notion';
        if (title.includes('Figma')) return 'Figma';
        if (title.includes('Adobe')) return 'Adobe';
        
        // If we can't identify from title, return the title itself (truncated)
        return title.length > 30 ? title.substring(0, 30) + '...' : title;
      }
      
      // Alternative: Try to get frontmost application (macOS specific)
      if (process.platform === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const frontmostApp = execSync(
            'osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"',
            { encoding: 'utf8', timeout: 1000 }
          ).trim();
          
          if (frontmostApp && frontmostApp !== 'ClipDesk') {
            return frontmostApp;
          }
        } catch (e) {
          // osascript failed, continue with fallback
        }
      }
      
      return 'Unknown';
    } catch (error) {
      console.error('Error detecting source app:', error);
      return 'Unknown';
    }
  }

  private async loadExcludedApps(): Promise<void> {
    try {
      // Wait for database to be ready
      let retries = 0
      const maxRetries = 10
      
      while (retries < maxRetries) {
        try {
          const excludedAppsJson = await db.getSetting('excludedApps');
          if (excludedAppsJson) {
            const excludedApps = JSON.parse(excludedAppsJson);
            this.excludedApps = new Set(excludedApps.map((app: string) => app.toLowerCase()));
          }
          console.log('✅ Excluded apps loaded successfully')
          return
        } catch (error) {
          if (retries < maxRetries - 1) {
            console.log(`⏳ Database not ready, retrying... (${retries + 1}/${maxRetries})`)
            retries++
            await new Promise(resolve => setTimeout(resolve, 500))
          } else {
            throw error
          }
        }
      }
    } catch (error) {
      console.error('Error loading excluded apps:', error);
      console.log('🔧 Using default empty excluded apps list')
      this.excludedApps = new Set()
    }
  }

  private generateHash(content: string): string {
    // Simple hash function for change detection
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // Public methods for external control
  async updateExcludedApps(apps: string[]): Promise<void> {
    this.excludedApps = new Set(apps.map(app => app.toLowerCase()));
    await db.setSetting('excludedApps', JSON.stringify(apps));
  }

  async updatePollInterval(interval: number): Promise<void> {
    this.pollInterval = Math.max(100, Math.min(5000, interval)); // Clamp between 100ms and 5s
    
    if (this.isMonitoring) {
      // Restart with new interval
      this.stop();
      await this.start();
    }
  }

  isRunning(): boolean {
    return this.isMonitoring;
  }

  // Test clipboard access
  async testClipboardAccess(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      console.log('🧪 Testing clipboard access...')

      // Test reading text
      const text = clipboard.readText();
      console.log('🧪 Text read test - length:', text ? text.length : 0)

      // Test reading image
      const image = clipboard.readImage();
      const hasImage = !image.isEmpty();
      console.log('🧪 Image read test - has image:', hasImage)

      // Test writing (temporarily)
      const originalText = text;
      const testText = 'ClipDesk Test - ' + Date.now();
      clipboard.writeText(testText);

      // Verify write worked
      const readBack = clipboard.readText();
      const writeWorked = readBack === testText;
      console.log('🧪 Write test - success:', writeWorked)

      // Restore original content
      if (originalText) {
        clipboard.writeText(originalText);
      }

      return {
        success: true,
        details: {
          canReadText: text !== undefined,
          textLength: text ? text.length : 0,
          canReadImage: true,
          hasImage,
          canWrite: writeWorked,
          platform: process.platform
        }
      };
    } catch (error) {
      console.error('🧪 Clipboard access test failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Singleton instance
export const clipboardMonitor = new ClipboardMonitor(); 