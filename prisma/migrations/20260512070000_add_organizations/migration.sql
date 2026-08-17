-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "loginLockedUntil" DATETIME,
    "departmentId" TEXT,
    "organizationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "departmentId", "email", "failedLoginAttempts", "id", "login", "loginLockedUntil", "name", "passwordHash", "role", "status") SELECT "createdAt", "departmentId", "email", "failedLoginAttempts", "id", "login", "loginLockedUntil", "name", "passwordHash", "role", "status" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");
