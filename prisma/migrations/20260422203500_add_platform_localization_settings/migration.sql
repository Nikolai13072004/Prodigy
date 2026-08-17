ALTER TABLE "PlatformSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow';
ALTER TABLE "PlatformSettings" ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DD.MM.YYYY';
ALTER TABLE "PlatformSettings" ADD COLUMN "timeFormat" TEXT NOT NULL DEFAULT '24H';
