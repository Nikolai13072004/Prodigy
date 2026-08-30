ALTER TABLE "PlatformSettings" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "maintenanceMessage" TEXT;
