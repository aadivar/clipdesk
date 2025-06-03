-- CreateTable
CREATE TABLE "clipboard_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content_hash" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "raw_content" BLOB,
    "metadata" TEXT,
    "source_app" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_count" INTEGER NOT NULL DEFAULT 1,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "item_tags" (
    "item_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("item_id", "tag_id"),
    CONSTRAINT "item_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clipboard_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snippets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "shortcut" TEXT,
    "variables" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "license" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "license_key" TEXT NOT NULL,
    "purchase_date" DATETIME NOT NULL,
    "expires_at" DATETIME,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "clipboard_items_content_hash_key" ON "clipboard_items"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "snippets_shortcut_key" ON "snippets"("shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "license_license_key_key" ON "license"("license_key");
