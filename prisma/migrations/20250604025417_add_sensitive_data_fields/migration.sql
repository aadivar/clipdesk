-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_clipboard_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content_hash" TEXT NOT NULL,
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
);
INSERT INTO "new_clipboard_items" ("access_count", "accessed_at", "content", "content_hash", "content_type", "created_at", "id", "is_deleted", "is_favorite", "metadata", "raw_content", "source_app") SELECT "access_count", "accessed_at", "content", "content_hash", "content_type", "created_at", "id", "is_deleted", "is_favorite", "metadata", "raw_content", "source_app" FROM "clipboard_items";
DROP TABLE "clipboard_items";
ALTER TABLE "new_clipboard_items" RENAME TO "clipboard_items";
CREATE UNIQUE INDEX "clipboard_items_content_hash_key" ON "clipboard_items"("content_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
