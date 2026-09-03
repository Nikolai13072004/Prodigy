-- AlterTable
ALTER TABLE "CourseSurveyTemplate" ADD COLUMN "introImageUrl" TEXT;

-- AlterTable
ALTER TABLE "CourseSurveyQuestion" ADD COLUMN "optionsJson" TEXT;

-- AlterTable
ALTER TABLE "ReusableCourseSurveyTemplate" ADD COLUMN "introImageUrl" TEXT;

-- AlterTable
ALTER TABLE "ReusableCourseSurveyQuestion" ADD COLUMN "optionsJson" TEXT;
