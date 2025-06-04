import { app } from 'electron';
import path from 'path';

// Dynamic import type for PrismaClient
type PrismaClient = any;

class Database {
  private prisma: PrismaClient | null = null;
  private PrismaClientClass: any = null;

  private async loadPrismaClient() {
    try {
      // Determine the correct path to the generated Prisma client
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

      console.log('🔧 Loading PrismaClient...');
      console.log('🔧 isDev:', isDev);
      console.log('🔧 app.isPackaged:', app.isPackaged);
      console.log('🔧 process.cwd():', process.cwd());
      console.log('🔧 app.getAppPath():', app.getAppPath());
      console.log('🔧 process.resourcesPath:', process.resourcesPath);

      if (isDev) {
        // Development: use relative path from project root
        const prismaPath = path.join(process.cwd(), 'generated', 'prisma');
        console.log('🔧 Dev prisma path:', prismaPath);
        const { PrismaClient } = await import(prismaPath);
        this.PrismaClientClass = PrismaClient;
      } else {
        // Production: try multiple possible paths
        const possiblePaths = [
          // Path 1: Using process.resourcesPath
          process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'generated', 'prisma') : null,
          // Path 2: Using app.getAppPath() + unpacked
          path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'generated', 'prisma'),
          // Path 3: Using app.getAppPath() directly (if not in asar)
          path.join(app.getAppPath(), 'generated', 'prisma'),
          // Path 4: Relative to current working directory
          path.join(process.cwd(), 'generated', 'prisma')
        ].filter(Boolean);

        console.log('🔧 Trying production paths:', possiblePaths);

        let loadError: Error | null = null;
        for (const prismaPath of possiblePaths) {
          try {
            console.log('🔧 Attempting to load from:', prismaPath);
            const { PrismaClient } = await import(prismaPath as string);
            this.PrismaClientClass = PrismaClient;
            console.log('✅ Successfully loaded PrismaClient from:', prismaPath);
            break;
          } catch (error) {
            console.log('❌ Failed to load from:', prismaPath, error);
            loadError = error as Error;
            continue;
          }
        }

        if (!this.PrismaClientClass) {
          throw new Error(`Failed to load PrismaClient from any path. Last error: ${loadError?.message}`);
        }
      }

      console.log('✅ PrismaClient loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load PrismaClient:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      console.log('Initializing database...');
      
      // Set up the database path in the user data directory
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'clipdesk.db');
      
      console.log('Database path:', dbPath);
      
      // Ensure DATABASE_URL environment variable is set
      process.env.DATABASE_URL = `file:${dbPath}`;
      console.log('DATABASE_URL:', process.env.DATABASE_URL);

      // Load PrismaClient dynamically
      await this.loadPrismaClient();

      // Initialize Prisma client
      this.prisma = new this.PrismaClientClass();
      await this.prisma.$connect();

      console.log('Database connected successfully');

      // Ensure database schema exists
      await this.ensureSchema();
      return true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  get client() {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.prisma;
  }

  isInitialized(): boolean {
    return this.prisma !== null;
  }

  private async checkAndFixSchemaMismatch(): Promise<void> {
    try {
      // Check if clipboard_items table exists and has the wrong column names
      const tableInfo = await this.prisma.$queryRaw`
        PRAGMA table_info(clipboard_items)
      ` as any[];

      if (tableInfo.length > 0) {
        // Check if we have the old camelCase column names
        const hasOldSchema = tableInfo.some((col: any) =>
          col.name === 'contentHash' ||
          col.name === 'contentType' ||
          col.name === 'rawContent' ||
          col.name === 'sourceApp' ||
          col.name === 'createdAt' ||
          col.name === 'accessedAt' ||
          col.name === 'accessCount' ||
          col.name === 'isFavorite' ||
          col.name === 'isDeleted'
        );

        if (hasOldSchema) {
          console.log('🔧 Detected old schema with camelCase columns, recreating tables...');

          // Drop all tables to recreate with correct schema
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "item_tags"`;
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "clipboard_items"`;
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "tags"`;
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "settings"`;
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "snippets"`;
          await this.prisma.$executeRaw`DROP TABLE IF EXISTS "license"`;

          console.log('✅ Old tables dropped, will recreate with correct schema');
        }
      }
    } catch (error) {
      // If table doesn't exist or other error, that's fine - we'll create it
      console.log('🔧 No existing tables found or error checking schema, will create fresh tables');
    }
  }

  private async ensureSchema(): Promise<void> {
    try {
      console.log('🔧 Ensuring database schema exists...');

      // Check if we need to recreate tables due to schema mismatch
      await this.checkAndFixSchemaMismatch();

      // Create tables if they don't exist - using snake_case as Prisma automatically converts camelCase to snake_case
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "clipboard_items" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "content_hash" TEXT NOT NULL UNIQUE,
          "content_type" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "raw_content" BLOB,
          "metadata" TEXT,
          "source_app" TEXT,
          "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
          "sensitive_types" TEXT,
          "sensitive_confidence" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "accessed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "access_count" INTEGER NOT NULL DEFAULT 1,
          "is_favorite" BOOLEAN NOT NULL DEFAULT false,
          "is_deleted" BOOLEAN NOT NULL DEFAULT false
        )
      `;

      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "tags" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL UNIQUE,
          "color" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "item_tags" (
          "item_id" TEXT NOT NULL,
          "tag_id" TEXT NOT NULL,
          PRIMARY KEY ("item_id", "tag_id"),
          FOREIGN KEY ("item_id") REFERENCES "clipboard_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;

      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "settings" (
          "key" TEXT NOT NULL PRIMARY KEY,
          "value" TEXT NOT NULL,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "snippets" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "shortcut" TEXT UNIQUE,
          "variables" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Create indexes for better performance
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "clipboard_items_content_hash_idx" ON "clipboard_items"("content_hash")
      `;

      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "clipboard_items_created_at_idx" ON "clipboard_items"("created_at")
      `;

      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "clipboard_items_is_deleted_idx" ON "clipboard_items"("is_deleted")
      `;

      console.log('✅ Database schema ensured successfully');
    } catch (error) {
      console.error('❌ Failed to ensure database schema:', error);
      throw error;
    }
  }
  
  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  // Clipboard Items CRUD operations
  async addClipboardItem(
    content: string,
    contentType: 'text' | 'image' | 'file' | 'link' | 'color',
    sourceApp?: string,
    rawContent?: Buffer,
    metadata?: any,
    sensitiveData?: { isSensitive: boolean; detectedTypes: string[]; confidence: string }
  ) {
    try {
      console.log('💾 Adding clipboard item to database...');

      // Generate content hash for deduplication
      const contentHash = this.generateContentHash(content);
      console.log('🔑 Generated content hash:', contentHash);

      // Check if item already exists
      const existingItem = await this.client.clipboardItem.findUnique({
        where: { content_hash: contentHash }
      });

      if (existingItem && !existingItem.is_deleted) {
        console.log('♻️ Item already exists, updating access info...');
        // Update existing item's access info
        const updatedItem = await this.client.clipboardItem.update({
          where: { id: existingItem.id },
          data: {
            accessed_at: new Date(),
            access_count: { increment: 1 }
          }
        });
        console.log('✅ Updated existing item:', updatedItem.id);
        // Map snake_case database fields to camelCase for frontend
        return {
          ...updatedItem,
          contentType: updatedItem.content_type,
          sourceApp: updatedItem.source_app,
          createdAt: updatedItem.created_at,
          accessedAt: updatedItem.accessed_at,
          accessCount: updatedItem.access_count,
          isFavorite: updatedItem.is_favorite,
          isDeleted: updatedItem.is_deleted,
          rawContent: updatedItem.raw_content,
          contentHash: updatedItem.content_hash,
          metadata: updatedItem.metadata ? JSON.parse(updatedItem.metadata) : null
        };
      }

      // Create new item
      const newItem = await this.client.clipboardItem.create({
        data: {
          id: this.generateId(),
          content_hash: contentHash,
          content_type: contentType,
          content,
          raw_content: rawContent,
          metadata: metadata ? JSON.stringify(metadata) : null,
          source_app: sourceApp,
          is_sensitive: sensitiveData?.isSensitive || false,
          sensitive_types: sensitiveData?.detectedTypes ? JSON.stringify(sensitiveData.detectedTypes) : null,
          sensitive_confidence: sensitiveData?.confidence || null,
          created_at: new Date(),
          accessed_at: new Date(),
          access_count: 1,
          is_favorite: false,
          is_deleted: false
        }
      });

      console.log('✅ Created new clipboard item:', newItem.id);
      // Map snake_case database fields to camelCase for frontend
      return {
        ...newItem,
        contentType: newItem.content_type,
        sourceApp: newItem.source_app,
        isSensitive: newItem.is_sensitive,
        sensitiveTypes: newItem.sensitive_types ? JSON.parse(newItem.sensitive_types) : null,
        sensitiveConfidence: newItem.sensitive_confidence,
        createdAt: newItem.created_at,
        accessedAt: newItem.accessed_at,
        accessCount: newItem.access_count,
        isFavorite: newItem.is_favorite,
        isDeleted: newItem.is_deleted,
        rawContent: newItem.raw_content,
        contentHash: newItem.content_hash,
        metadata: newItem.metadata ? JSON.parse(newItem.metadata) : null
      };
    } catch (error) {
      console.error('❌ Error adding clipboard item:', error);
      throw error;
    }
  }

  async getClipboardItems(
    limit: number = 50,
    offset: number = 0,
    contentType?: string,
    searchQuery?: string
  ) {
    try {
      const where: any = {
        is_deleted: false
      };

      if (contentType) {
        where.content_type = contentType;
      }

      if (searchQuery) {
        where.content = {
          contains: searchQuery,
          mode: 'insensitive'
        };
      }

      const items = await this.client.clipboardItem.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });

      return items.map((item: any) => ({
        ...item,
        // Map snake_case database fields to camelCase for frontend
        contentType: item.content_type,
        sourceApp: item.source_app,
        isSensitive: item.is_sensitive,
        sensitiveTypes: item.sensitive_types ? JSON.parse(item.sensitive_types) : null,
        sensitiveConfidence: item.sensitive_confidence,
        createdAt: item.created_at,
        accessedAt: item.accessed_at,
        accessCount: item.access_count,
        isFavorite: item.is_favorite,
        isDeleted: item.is_deleted,
        rawContent: item.raw_content,
        contentHash: item.content_hash,
        tags: item.tags.map((t: any) => t.tag),
        metadata: item.metadata ? JSON.parse(item.metadata) : null
      }));
    } catch (error) {
      console.error('Error getting clipboard items:', error);
      throw error;
    }
  }

  async deleteClipboardItem(id: string) {
    try {
      await this.client.clipboardItem.update({
        where: { id },
        data: { is_deleted: true }
      });
    } catch (error) {
      console.error('Error deleting clipboard item:', error);
      throw error;
    }
  }

  async clearHistory() {
    try {
      await this.client.clipboardItem.updateMany({
        where: { is_deleted: false },
        data: { is_deleted: true }
      });
    } catch (error) {
      console.error('Error clearing history:', error);
      throw error;
    }
  }

  async toggleFavorite(id: string) {
    try {
      const item = await this.client.clipboardItem.findUnique({
        where: { id }
      });

      if (!item) {
        throw new Error('Item not found');
      }

      const updatedItem = await this.client.clipboardItem.update({
        where: { id },
        data: { is_favorite: !item.is_favorite }
      });

      // Map snake_case database fields to camelCase for frontend
      return {
        ...updatedItem,
        contentType: updatedItem.content_type,
        sourceApp: updatedItem.source_app,
        isSensitive: updatedItem.is_sensitive,
        sensitiveTypes: updatedItem.sensitive_types ? JSON.parse(updatedItem.sensitive_types) : null,
        sensitiveConfidence: updatedItem.sensitive_confidence,
        createdAt: updatedItem.created_at,
        accessedAt: updatedItem.accessed_at,
        accessCount: updatedItem.access_count,
        isFavorite: updatedItem.is_favorite,
        isDeleted: updatedItem.is_deleted,
        rawContent: updatedItem.raw_content,
        contentHash: updatedItem.content_hash,
        metadata: updatedItem.metadata ? JSON.parse(updatedItem.metadata) : null
      };
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  // Tags CRUD operations
  async getTags() {
    try {
      return await this.client.tag.findMany({
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      console.error('Error getting tags:', error);
      throw error;
    }
  }

  async addTag(name: string, color?: string) {
    try {
      return await this.client.tag.create({
        data: {
          id: this.generateId(),
          name,
          color
        }
      });
    } catch (error) {
      console.error('Error adding tag:', error);
      throw error;
    }
  }

  async addTagToItem(itemId: string, tagId: string) {
    try {
      await this.client.itemTag.create({
        data: {
          item_id: itemId,
          tag_id: tagId
        }
      });
    } catch (error) {
      console.error('Error adding tag to item:', error);
      throw error;
    }
  }

  // Settings CRUD operations
  async getSetting(key: string) {
    try {
      const setting = await this.client.setting.findUnique({
        where: { key }
      });
      return setting?.value || null;
    } catch (error) {
      console.error('Error getting setting:', error);
      throw error;
    }
  }

  async setSetting(key: string, value: string) {
    try {
      await this.client.setting.upsert({
        where: { key },
        update: { value },
        create: {
          key,
          value
        }
      });
    } catch (error) {
      console.error('Error setting value:', error);
      throw error;
    }
  }

  // Snippets CRUD operations
  async getSnippets() {
    try {
      return await this.client.snippet.findMany({
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      console.error('Error getting snippets:', error);
      throw error;
    }
  }

  async createSnippet(name: string, content: string, shortcut?: string, variables?: any) {
    try {
      return await this.client.snippet.create({
        data: {
          id: this.generateId(),
          name,
          content,
          shortcut,
          variables: variables ? JSON.stringify(variables) : null,
          created_at: new Date()
        }
      });
    } catch (error) {
      console.error('Error creating snippet:', error);
      throw error;
    }
  }

  // Utility methods
  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private generateId(): string {
    // Simple UUID-like ID generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const db = new Database();
