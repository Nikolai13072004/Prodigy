CREATE TABLE "UserTotpCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "recoveryCodesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserTotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserTotpCredential_userId_key" ON "UserTotpCredential"("userId");

ALTER TABLE "PlatformSettings" ADD COLUMN "adminTotpRequired" BOOLEAN NOT NULL DEFAULT false;
