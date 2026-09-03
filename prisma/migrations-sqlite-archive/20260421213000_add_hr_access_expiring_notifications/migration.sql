ALTER TABLE "HrNotificationPreference"
ADD COLUMN "notifyAccessExpiring" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "HrNotificationPreference"
ADD COLUMN "accessExpiringDays" INTEGER NOT NULL DEFAULT 7;
