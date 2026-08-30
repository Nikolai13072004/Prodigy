PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Quiz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseItemId" TEXT NOT NULL,
    "description" TEXT,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "minCorrectAnswers" INTEGER NOT NULL DEFAULT 1,
    "timeLimitMinutes" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleAnswers" BOOLEAN NOT NULL DEFAULT false,
    "lockMaterialsOnStart" BOOLEAN NOT NULL DEFAULT true,
    "questionPoolSize" INTEGER,
    "retryDelayMinutes" INTEGER,
    "trackSecurityEvents" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Quiz_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Quiz" (
    "id",
    "courseItemId",
    "description",
    "maxAttempts",
    "minCorrectAnswers",
    "timeLimitMinutes",
    "shuffleQuestions",
    "shuffleAnswers",
    "lockMaterialsOnStart",
    "questionPoolSize",
    "retryDelayMinutes",
    "trackSecurityEvents"
)
SELECT
    "id",
    "courseItemId",
    "description",
    "maxAttempts",
    "minCorrectAnswers",
    "timeLimitMinutes",
    "shuffleQuestions",
    "shuffleAnswers",
    "lockMaterialsOnStart",
    "questionPoolSize",
    "retryDelayMinutes",
    "trackSecurityEvents"
FROM "Quiz";

DROP TABLE "Quiz";
ALTER TABLE "new_Quiz" RENAME TO "Quiz";
CREATE UNIQUE INDEX "Quiz_courseItemId_key" ON "Quiz"("courseItemId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
