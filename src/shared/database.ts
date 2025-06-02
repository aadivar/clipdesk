import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { ClipboardItem as ClipboardItemType } from './types';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    // Initialize default settings
    await this.initializeDefaultSettings();
  }

  private async initializeDefaultSettings(): Promise<void> {
    const defaultSettings = [
      { key: 'maxHistoryItems', value: '1000' },
      { key: 'autoStartup', value: 'true' },
      { key: 'showMenuBar', value: 'true' },
      { key: 'globalShortcut', value: 'CommandOrControl+Shift+V' },
      { key: 'excludedApps', value: '[]' },
      { key: 'soundEnabled', value: 'true' },
      { key: 'retentionDays', value: '30' },
    ];

    for (const setting of defaultSettings) {
      await this.prisma.setting.upsert({
        where: { key: setting.key },
        update: {},
        create: setting,
      });
    }
  }

  // Clipboard Items
  async addClipboardItem(
    content: string,
    contentType: string,
    sourceApp?: string,
    rawContent?: Buffer
  ): Promise<ClipboardItemType> {
    const contentHash = this.generateContentHash(content);
    
    // Check if item already exists
    const existing = await this.prisma.clipboardItem.findUnique({
      where: { contentHash },
    });

    if (existing) {
      // Update access info for existing item
      const updated = await this.prisma.clipboardItem.update({
        where: { id: existing.id },
        data: {
          accessedAt: new Date(),
          accessCount: { increment: 1 },
          isDeleted: false, // Restore if it was soft deleted
        },
        include: { tags: { include: { tag: true } } },
      });
      return this.transformClipboardItem(updated);
    }

    // Create new item
    const newItem = await this.prisma.clipboardItem.create({
      data: {
        contentHash,
        content,
        contentType,
        sourceApp,
        rawContent,
        metadata: this.generateMetadata(content, contentType),
      },
      include: { tags: { include: { tag: true } } },
    });

    // Clean up old items if we exceed the limit
    await this.cleanupOldItems();

    return this.transformClipboardItem(newItem);
  }

  async getClipboardItems(
    limit = 50,
    offset = 0,
    contentType?: string,
    searchQuery?: string
  ): Promise<ClipboardItemType[]> {
    const where: any = { isDeleted: false };

    if (contentType) {
      where.contentType = contentType;
    }

    if (searchQuery) {
      where.OR = [
        { content: { contains: searchQuery } },
        { sourceApp: { contains: searchQuery } },
        { tags: { some: { tag: { name: { contains: searchQuery } } } } },
      ];
    }

    const items = await this.prisma.clipboardItem.findMany({
      where,
      orderBy: { accessedAt: 'desc' },
      take: limit,
      skip: offset,
      include: { tags: { include: { tag: true } } },
    });

    return items.map(this.transformClipboardItem);
  }

  async toggleFavorite(id: string): Promise<ClipboardItemType> {
    const item = await this.prisma.clipboardItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new Error('Clipboard item not found');
    }

    const updated = await this.prisma.clipboardItem.update({
      where: { id },
      data: { isFavorite: !item.isFavorite },
      include: { tags: { include: { tag: true } } },
    });

    return this.transformClipboardItem(updated);
  }

  async deleteClipboardItem(id: string): Promise<void> {
    await this.prisma.clipboardItem.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async clearHistory(): Promise<void> {
    await this.prisma.clipboardItem.updateMany({
      where: { isFavorite: false },
      data: { isDeleted: true },
    });
  }

  // Tags
  async addTag(name: string, color?: string): Promise<any> {
    return await this.prisma.tag.create({
      data: { name, color },
    });
  }

  async getTags(): Promise<any[]> {
    return await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async addTagToItem(itemId: string, tagId: string): Promise<void> {
    await this.prisma.itemTag.create({
      data: { itemId, tagId },
    });
  }

  // Snippets
  async createSnippet(
    name: string,
    content: string,
    shortcut?: string,
    variables?: object
  ): Promise<any> {
    return await this.prisma.snippet.create({
      data: {
        name,
        content,
        shortcut,
        variables: variables ? JSON.stringify(variables) : null,
      },
    });
  }

  async getSnippets(): Promise<any[]> {
    return await this.prisma.snippet.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // Settings
  async getSetting(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key },
    });
    return setting?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // Helper methods
  private generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private generateMetadata(content: string, contentType: string): string {
    const metadata: any = {
      size: content.length,
      language: contentType === 'text' ? this.detectLanguage(content) : null,
      wordCount: contentType === 'text' ? content.split(/\s+/).length : null,
    };

    if (contentType === 'link') {
      try {
        const url = new URL(content);
        metadata.domain = url.hostname;
        metadata.protocol = url.protocol;
      } catch (e) {
        // Invalid URL
      }
    }

    return JSON.stringify(metadata);
  }

  private detectLanguage(content: string): string | null {
    // Simple language detection based on patterns
    if (/^\s*[\[\{]/.test(content) && /[\]\}]\s*$/.test(content)) {
      return 'json';
    }
    if (/^\s*</.test(content) && />/.test(content)) {
      return 'html';
    }
    if (/import\s+|export\s+|function\s+|const\s+|let\s+|var\s+/.test(content)) {
      return 'javascript';
    }
    return null;
  }

  private transformClipboardItem(item: any): ClipboardItemType {
    return {
      id: item.id,
      content: item.content,
      contentType: item.contentType as any,
      sourceApp: item.sourceApp,
      createdAt: item.createdAt,
      accessedAt: item.accessedAt,
      accessCount: item.accessCount,
      isFavorite: item.isFavorite,
      tags: item.tags?.map((t: any) => t.tag) || [],
      metadata: item.metadata ? JSON.parse(item.metadata) : null,
    };
  }

  private async cleanupOldItems(): Promise<void> {
    const maxItems = parseInt(await this.getSetting('maxHistoryItems') || '1000');
    const retentionDays = parseInt(await this.getSetting('retentionDays') || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete old items that are not favorites
    await this.prisma.clipboardItem.updateMany({
      where: {
        isFavorite: false,
        createdAt: { lt: cutoffDate },
      },
      data: { isDeleted: true },
    });

    // Keep only the most recent maxItems (excluding favorites)
    const recentItems = await this.prisma.clipboardItem.findMany({
      where: { isDeleted: false, isFavorite: false },
      orderBy: { accessedAt: 'desc' },
      skip: maxItems,
      select: { id: true },
    });

    if (recentItems.length > 0) {
      await this.prisma.clipboardItem.updateMany({
        where: { id: { in: recentItems.map(item => item.id) } },
        data: { isDeleted: true },
      });
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Singleton instance
export const db = new DatabaseService(); 