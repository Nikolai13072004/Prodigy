ALTER TABLE "PlatformSettings" ADD COLUMN "passwordMinLength" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "PlatformSettings" ADD COLUMN "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "passwordRequireSpecialChar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "sessionMaxAgeMinutes" INTEGER NOT NULL DEFAULT 43200;
ALTER TABLE "PlatformSettings" ADD COLUMN "maxFailedLoginAttempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "PlatformSettings" ADD COLUMN "loginLockoutMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "PlatformSettings" ADD COLUMN "loginEventRetentionDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "loginLockedUntil" DATETIME;
