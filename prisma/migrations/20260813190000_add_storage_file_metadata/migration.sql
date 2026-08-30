-- CreateTable
CREATE TABLE "StorageFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "area" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT,
    "originalName" TEXT,
    "purpose" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_key_key" ON "StorageFile"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_url_key" ON "StorageFile"("url");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_area_sha256_sizeBytes_extension_key" ON "StorageFile"("area", "sha256", "sizeBytes", "extension");

-- CreateIndex
CREATE INDEX "StorageFile_area_createdAt_idx" ON "StorageFile"("area", "createdAt");

-- CreateIndex
CREATE INDEX "StorageFile_sha256_idx" ON "StorageFile"("sha256");
