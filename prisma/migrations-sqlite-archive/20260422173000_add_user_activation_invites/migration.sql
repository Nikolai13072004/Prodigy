CREATE TABLE "UserActivationInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "activatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserActivationInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserActivationInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserActivationInvite_userId_key" ON "UserActivationInvite"("userId");
CREATE UNIQUE INDEX "UserActivationInvite_tokenHash_key" ON "UserActivationInvite"("tokenHash");
CREATE INDEX "UserActivationInvite_email_status_idx" ON "UserActivationInvite"("email", "status");
CREATE INDEX "UserActivationInvite_expiresAt_idx" ON "UserActivationInvite"("expiresAt");
