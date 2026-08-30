ALTER TABLE "PlatformSettings" ADD COLUMN "userActivationInviteTtlDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "PlatformSettings" ADD COLUMN "courseInviteTtlDays" INTEGER NOT NULL DEFAULT 7;
