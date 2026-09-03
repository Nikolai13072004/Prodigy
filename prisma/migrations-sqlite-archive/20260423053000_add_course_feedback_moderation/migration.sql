ALTER TABLE "CourseFeedback"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';

UPDATE "CourseFeedback"
SET "rating" = CASE
  WHEN "rating" > 5 THEN CASE
    WHEN "rating" <= 6 THEN 3
    WHEN "rating" <= 8 THEN 4
    ELSE 5
  END
  ELSE "rating"
END;

ALTER TABLE "PlatformSettings"
ADD COLUMN "feedbackModerationEnabled" BOOLEAN NOT NULL DEFAULT false;
