CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_createdAt_idx" ON "ApiToken"("createdAt");
CREATE INDEX "ApiToken_lastUsedAt_idx" ON "ApiToken"("lastUsedAt");
