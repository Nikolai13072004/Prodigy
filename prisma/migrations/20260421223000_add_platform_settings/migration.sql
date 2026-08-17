-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'Aurora LMS',
    "siteDescription" TEXT NOT NULL DEFAULT 'Корпоративное обучение сотрудников',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "supportEmail" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpEncryption" TEXT NOT NULL DEFAULT 'TLS',
    "smtpLogin" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

