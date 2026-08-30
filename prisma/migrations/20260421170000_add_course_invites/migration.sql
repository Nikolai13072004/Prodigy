-- CreateTable
CREATE TABLE "CourseInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseInvite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CourseInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseInvite_tokenHash_key" ON "CourseInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CourseInvite_courseId_email_key" ON "CourseInvite"("courseId", "email");

-- CreateIndex
CREATE INDEX "CourseInvite_email_status_idx" ON "CourseInvite"("email", "status");

-- CreateIndex
CREATE INDEX "CourseInvite_expiresAt_idx" ON "CourseInvite"("expiresAt");
