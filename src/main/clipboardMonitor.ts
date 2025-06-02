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
  private lastClipboardContent: string = '';
  private lastClipboardContentHash: string = '';
  private pollInterval = 500; // ms
  private excludedApps: Set<string> = new Set();

  constructor() {
    super();
    this.loadExcludedApps();
  }

  async start(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    // Initialize database
    await db.initialize();
    
    // Get initial clipboard state
    this.lastClipboardContent = clipboard.readText() || '';
    this.lastClipboardContentHash = this.generateHash(this.lastClipboardContent);

    // Start polling
    this.intervalId = setInterval(() => {
      this.checkClipboard();
    }, this.pollInterval);

    this.emit('started');
    console.log('Clipboard monitoring started');
  }

  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.emit('stopped');
    console.log('Clipboard monitoring stopped');
  }

  private async checkClipboard(): Promise<void> {
    try {
      const currentContent = await this.getCurrentClipboardContent();
      
      if (!currentContent) return;

      const currentHash = this.generateHash(currentContent.content);
      
      // Check if content has changed
      if (currentHash !== this.lastClipboardContentHash) {
        this.lastClipboardContent = currentContent.content;
        this.lastClipboardContentHash = currentHash;

        // Skip if from excluded app
        const sourceApp = await this.getSourceApplication();
        if (sourceApp && this.excludedApps.has(sourceApp.toLowerCase())) {
          return;
        }

        // Process and store the new clipboard content
        await this.processClipboardContent(currentContent, sourceApp || undefined);
        
        this.emit('clipboardChanged', currentContent);
      }
    } catch (error) {
      console.error('Error checking clipboard:', error);
    }
  }

  private async getCurrentClipboardContent(): Promise<ClipboardContent | null> {
    // Check for different content types in order of priority
    // IMPORTANT: Order matters! More specific types should be checked first

    // Special case: Check if we have both image and file data (common when copying files from Finder)
    const textContent = clipboard.readText();
    const hasImageData = !clipboard.readImage().isEmpty();
    const hasFileData = textContent && this.isFilePath(textContent);

    // If we have both image and file data, prefer file detection
    // This handles the case where Finder puts both file path and file icon in clipboard
    if (hasImageData && hasFileData) {
      const fileContent = await this.getFileContent();
      if (fileContent) return fileContent;
    }

    // 1. Check for images first (highest priority for visual content)
    const imageContent = await this.getImageContent();
    if (imageContent) {
      return imageContent;
    }

    // 2. Check for files (before text, since file paths might be text)
    const filesContent = await this.getFileContent();
    if (filesContent) {
      return filesContent;
    }

    // 3. Check for text content last (most general, includes links, colors, etc.)
    const finalTextContent = await this.getTextContent();
    if (finalTextContent) {
      return finalTextContent;
    }

    return null;
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
      const text = clipboard.readText();
      
      if (!text || text.trim().length === 0) return null;

      // Detect content subtype
      const contentType = this.detectTextContentType(text);
      
      return {
        type: contentType,
        content: text,
        metadata: this.generateTextMetadata(text, contentType),
      };
    } catch (error) {
      console.error('Error getting text content:', error);
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
      // Store in database
      await db.addClipboardItem(
        content.content,
        content.type,
        sourceApp,
        content.rawContent
      );

      console.log(`Stored clipboard item: ${content.type} from ${sourceApp || 'unknown'}`);
    } catch (error) {
      console.error('Error processing clipboard content:', error);
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
      const excludedAppsJson = await db.getSetting('excludedApps');
      if (excludedAppsJson) {
        const excludedApps = JSON.parse(excludedAppsJson);
        this.excludedApps = new Set(excludedApps.map((app: string) => app.toLowerCase()));
      }
    } catch (error) {
      console.error('Error loading excluded apps:', error);
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
}

// Singleton instance
export const clipboardMonitor = new ClipboardMonitor(); 