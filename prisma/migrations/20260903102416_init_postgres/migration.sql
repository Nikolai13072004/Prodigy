-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "avatarUrl" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "loginLockedUntil" TIMESTAMP(3),
    "departmentId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTotpCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "recoveryCodesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTotpCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUiPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminCoursesView" TEXT NOT NULL DEFAULT 'table',
    "preferredRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUiPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissionsJson" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleProfileId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "targetAudience" TEXT,
    "category" TEXT,
    "difficultyLevel" TEXT,
    "durationMinutes" INTEGER,
    "tagsJson" TEXT,
    "thumbnailUrl" TEXT,
    "coverUrl" TEXT,
    "navigationMode" TEXT NOT NULL DEFAULT 'FREE',
    "quizGateMode" TEXT NOT NULL DEFAULT 'RESOLVED',
    "completionMode" TEXT NOT NULL DEFAULT 'ALL_ITEMS',
    "statusFormat" TEXT NOT NULL DEFAULT 'COMPLETED_ONLY',
    "gradedItemIdsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "resultViewMode" TEXT NOT NULL DEFAULT 'SCORE_ONLY',
    "publishedSnapshotJson" TEXT,
    "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedVia" TEXT NOT NULL,
    "issuedById" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseUserAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CourseUserAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseGroupAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CourseGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseInvite" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivationInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserActivationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItem" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "totalSlides" INTEGER,
    "presentationViewMode" TEXT NOT NULL DEFAULT 'PDF_PREVIEW',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItemView" (
    "id" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "maxPageSeen" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER,
    "viewedPagesJson" TEXT NOT NULL DEFAULT '[]',
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseItemView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "points" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "answers" TEXT NOT NULL,
    "questionSnapshot" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "correctAnswers" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "manualReviewJson" TEXT,
    "securityEventsJson" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizUserBestResult" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bestAttemptId" TEXT,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestMaxScore" INTEGER NOT NULL DEFAULT 0,
    "bestCorrectAnswers" INTEGER NOT NULL DEFAULT 0,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizUserBestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseFeedback" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSurveyTemplate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "introImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSurveyQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "optionsJson" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReusableCourseSurveyTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "introImageUrl" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sourceCourseId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReusableCourseSurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReusableCourseSurveyQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "optionsJson" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReusableCourseSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSurveyResponse" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textValue" TEXT,

    CONSTRAINT "CourseSurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItemSurveyTemplate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "introImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseItemSurveyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItemSurveyQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "optionsJson" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseItemSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItemSurveyResponse" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseItemSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseItemSurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textValue" TEXT,

    CONSTRAINT "CourseItemSurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseLearnerState" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastOpenedCourseItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLearnerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLogin" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "objectLabel" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifyCourseCompleted" BOOLEAN NOT NULL DEFAULT true,
    "notifyLowActivity" BOOLEAN NOT NULL DEFAULT true,
    "lowActivityDays" INTEGER NOT NULL DEFAULT 7,
    "notifyAccessExpiring" BOOLEAN NOT NULL DEFAULT true,
    "accessExpiringDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrNotificationDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrNotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrNotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrNotificationDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrReportSchedule" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "courseId" TEXT,
    "recipientsJson" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrReportScheduleDispatch" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrReportScheduleDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "template" TEXT,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 10,
    "availableAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseReminderDispatch" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageFile" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT,
    "originalName" TEXT,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'Aurora LMS',
    "siteDescription" TEXT NOT NULL DEFAULT 'Корпоративное обучение сотрудников',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "supportEmail" TEXT,
    "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "feedbackModerationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '24H',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "smtpSettingsSource" TEXT NOT NULL DEFAULT 'ENV',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpEncryption" TEXT NOT NULL DEFAULT 'TLS',
    "smtpLogin" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "welcomeEmailTemplateJson" TEXT,
    "passwordResetEmailTemplateJson" TEXT,
    "certificateEmailTemplateJson" TEXT,
    "courseAssignedEmailTemplateJson" TEXT,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT false,
    "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT false,
    "passwordRequireSpecialChar" BOOLEAN NOT NULL DEFAULT false,
    "sessionMaxAgeMinutes" INTEGER NOT NULL DEFAULT 43200,
    "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxFailedLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "loginLockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "loginEventRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "adminTotpRequired" BOOLEAN NOT NULL DEFAULT false,
    "userActivationInviteTtlDays" INTEGER NOT NULL DEFAULT 7,
    "courseInviteTtlDays" INTEGER NOT NULL DEFAULT 7,
    "courseRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseReminderNotStartedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseReminderExpiringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseReminderExpiredEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseReminderQuizFailedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "courseReminderExpiringDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_avatarUrl_idx" ON "User"("avatarUrl");

-- CreateIndex
CREATE UNIQUE INDEX "UserTotpCredential_userId_key" ON "UserTotpCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserUiPreference_userId_key" ON "UserUiPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleProfile_name_key" ON "RoleProfile"("name");

-- CreateIndex
CREATE INDEX "UserRole_roleProfileId_idx" ON "UserRole"("roleProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleProfileId_key" ON "UserRole"("userId", "roleProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "GroupMembership_userId_idx" ON "GroupMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_userId_key" ON "GroupMembership"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Course_coverUrl_idx" ON "Course"("coverUrl");

-- CreateIndex
CREATE INDEX "Course_thumbnailUrl_idx" ON "Course"("thumbnailUrl");

-- CreateIndex
CREATE INDEX "Course_status_publishedAt_idx" ON "Course"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_serial_key" ON "Certificate"("serial");

-- CreateIndex
CREATE INDEX "Certificate_userId_issuedAt_idx" ON "Certificate"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "Certificate_courseId_issuedAt_idx" ON "Certificate"("courseId", "issuedAt");

-- CreateIndex
CREATE INDEX "Certificate_status_issuedAt_idx" ON "Certificate"("status", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_courseId_userId_key" ON "Certificate"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseUserAssignment_userId_idx" ON "CourseUserAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseUserAssignment_courseId_userId_key" ON "CourseUserAssignment"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseGroupAssignment_courseId_groupId_key" ON "CourseGroupAssignment"("courseId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseInvite_tokenHash_key" ON "CourseInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CourseInvite_email_status_idx" ON "CourseInvite"("email", "status");

-- CreateIndex
CREATE INDEX "CourseInvite_expiresAt_idx" ON "CourseInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseInvite_courseId_email_key" ON "CourseInvite"("courseId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UserActivationInvite_userId_key" ON "UserActivationInvite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserActivationInvite_tokenHash_key" ON "UserActivationInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserActivationInvite_email_status_idx" ON "UserActivationInvite"("email", "status");

-- CreateIndex
CREATE INDEX "UserActivationInvite_expiresAt_idx" ON "UserActivationInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_status_idx" ON "PasswordResetToken"("userId", "status");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_status_idx" ON "PasswordResetToken"("email", "status");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CourseItem_courseId_orderIndex_idx" ON "CourseItem"("courseId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseItem_moduleId_idx" ON "CourseItem"("moduleId");

-- CreateIndex
CREATE INDEX "CourseItem_courseId_archivedAt_orderIndex_idx" ON "CourseItem"("courseId", "archivedAt", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseItem_fileUrl_idx" ON "CourseItem"("fileUrl");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_orderIndex_idx" ON "CourseModule"("courseId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_archivedAt_orderIndex_idx" ON "CourseModule"("courseId", "archivedAt", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CourseItemView_courseItemId_userId_key" ON "CourseItemView"("courseItemId", "userId");

-- CreateIndex
CREATE INDEX "LearningEvent_courseItemId_userId_occurredAt_idx" ON "LearningEvent"("courseItemId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_occurredAt_idx" ON "LearningEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearningEvent_type_occurredAt_idx" ON "LearningEvent"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_courseItemId_key" ON "Quiz"("courseItemId");

-- CreateIndex
CREATE INDEX "Question_quizId_archivedAt_orderIndex_idx" ON "Question"("quizId", "archivedAt", "orderIndex");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_completedAt_idx" ON "QuizAttempt"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_userId_completedAt_idx" ON "QuizAttempt"("quizId", "userId", "completedAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_outcome_completedAt_idx" ON "QuizAttempt"("outcome", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quizId_userId_attemptNumber_key" ON "QuizAttempt"("quizId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuizUserBestResult_bestAttemptId_key" ON "QuizUserBestResult"("bestAttemptId");

-- CreateIndex
CREATE INDEX "QuizUserBestResult_userId_updatedAt_idx" ON "QuizUserBestResult"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizUserBestResult_quizId_userId_key" ON "QuizUserBestResult"("quizId", "userId");

-- CreateIndex
CREATE INDEX "CourseFeedback_status_createdAt_idx" ON "CourseFeedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFeedback_courseId_userId_key" ON "CourseFeedback"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSurveyTemplate_courseId_key" ON "CourseSurveyTemplate"("courseId");

-- CreateIndex
CREATE INDEX "CourseSurveyQuestion_templateId_orderIndex_idx" ON "CourseSurveyQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_createdAt_idx" ON "ReusableCourseSurveyTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_sourceCourseId_idx" ON "ReusableCourseSurveyTemplate"("sourceCourseId");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_createdById_idx" ON "ReusableCourseSurveyTemplate"("createdById");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyQuestion_templateId_orderIndex_idx" ON "ReusableCourseSurveyQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseSurveyResponse_courseId_createdAt_idx" ON "CourseSurveyResponse"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseSurveyResponse_userId_createdAt_idx" ON "CourseSurveyResponse"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSurveyResponse_courseId_userId_key" ON "CourseSurveyResponse"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseSurveyAnswer_questionId_idx" ON "CourseSurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "CourseSurveyAnswer_responseId_idx" ON "CourseSurveyAnswer"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseItemSurveyTemplate_courseItemId_key" ON "CourseItemSurveyTemplate"("courseItemId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyTemplate_courseId_idx" ON "CourseItemSurveyTemplate"("courseId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyQuestion_templateId_orderIndex_idx" ON "CourseItemSurveyQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseItemSurveyResponse_courseId_createdAt_idx" ON "CourseItemSurveyResponse"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseItemSurveyResponse_userId_createdAt_idx" ON "CourseItemSurveyResponse"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseItemSurveyResponse_courseItemId_userId_key" ON "CourseItemSurveyResponse"("courseItemId", "userId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyAnswer_questionId_idx" ON "CourseItemSurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyAnswer_responseId_idx" ON "CourseItemSurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "CourseLearnerState_userId_updatedAt_idx" ON "CourseLearnerState"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLearnerState_courseId_userId_key" ON "CourseLearnerState"("courseId", "userId");

-- CreateIndex
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEvent_createdAt_idx" ON "AuditLogEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEvent_actorId_createdAt_idx" ON "AuditLogEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEvent_action_createdAt_idx" ON "AuditLogEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEvent_objectType_objectId_idx" ON "AuditLogEvent"("objectType", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "HrNotificationPreference_userId_key" ON "HrNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "HrNotificationDispatch_userId_type_occurredAt_idx" ON "HrNotificationDispatch"("userId", "type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrNotificationDispatch_userId_notificationKey_key" ON "HrNotificationDispatch"("userId", "notificationKey");

-- CreateIndex
CREATE INDEX "HrNotificationDismissal_userId_type_dismissedAt_idx" ON "HrNotificationDismissal"("userId", "type", "dismissedAt");

-- CreateIndex
CREATE INDEX "HrNotificationDismissal_learnerId_idx" ON "HrNotificationDismissal"("learnerId");

-- CreateIndex
CREATE INDEX "HrNotificationDismissal_courseId_idx" ON "HrNotificationDismissal"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "HrNotificationDismissal_userId_notificationKey_key" ON "HrNotificationDismissal"("userId", "notificationKey");

-- CreateIndex
CREATE INDEX "HrReportSchedule_createdById_createdAt_idx" ON "HrReportSchedule"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "HrReportSchedule_isPaused_nextRunAt_idx" ON "HrReportSchedule"("isPaused", "nextRunAt");

-- CreateIndex
CREATE INDEX "HrReportSchedule_courseId_idx" ON "HrReportSchedule"("courseId");

-- CreateIndex
CREATE INDEX "HrReportScheduleDispatch_queuedAt_idx" ON "HrReportScheduleDispatch"("queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrReportScheduleDispatch_scheduleId_periodKey_key" ON "HrReportScheduleDispatch"("scheduleId", "periodKey");

-- CreateIndex
CREATE INDEX "EmailJob_status_nextAttemptAt_idx" ON "EmailJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailJob_createdAt_idx" ON "EmailJob"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_claimedAt_idx" ON "OutboxEvent"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_createdAt_idx" ON "OutboxEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CourseReminderDispatch_type_queuedAt_idx" ON "CourseReminderDispatch"("type", "queuedAt");

-- CreateIndex
CREATE INDEX "CourseReminderDispatch_userId_queuedAt_idx" ON "CourseReminderDispatch"("userId", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReminderDispatch_type_courseId_userId_periodKey_key" ON "CourseReminderDispatch"("type", "courseId", "userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_createdAt_idx" ON "ApiToken"("createdAt");

-- CreateIndex
CREATE INDEX "ApiToken_lastUsedAt_idx" ON "ApiToken"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_key_key" ON "StorageFile"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_url_key" ON "StorageFile"("url");

-- CreateIndex
CREATE INDEX "StorageFile_area_createdAt_idx" ON "StorageFile"("area", "createdAt");

-- CreateIndex
CREATE INDEX "StorageFile_sha256_idx" ON "StorageFile"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFile_area_sha256_sizeBytes_extension_key" ON "StorageFile"("area", "sha256", "sizeBytes", "extension");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTotpCredential" ADD CONSTRAINT "UserTotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUiPreference" ADD CONSTRAINT "UserUiPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleProfileId_fkey" FOREIGN KEY ("roleProfileId") REFERENCES "RoleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseUserAssignment" ADD CONSTRAINT "CourseUserAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseUserAssignment" ADD CONSTRAINT "CourseUserAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseUserAssignment" ADD CONSTRAINT "CourseUserAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGroupAssignment" ADD CONSTRAINT "CourseGroupAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGroupAssignment" ADD CONSTRAINT "CourseGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGroupAssignment" ADD CONSTRAINT "CourseGroupAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInvite" ADD CONSTRAINT "CourseInvite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInvite" ADD CONSTRAINT "CourseInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInvite" ADD CONSTRAINT "CourseInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivationInvite" ADD CONSTRAINT "UserActivationInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivationInvite" ADD CONSTRAINT "UserActivationInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItem" ADD CONSTRAINT "CourseItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItem" ADD CONSTRAINT "CourseItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemView" ADD CONSTRAINT "CourseItemView_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemView" ADD CONSTRAINT "CourseItemView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizUserBestResult" ADD CONSTRAINT "QuizUserBestResult_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizUserBestResult" ADD CONSTRAINT "QuizUserBestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizUserBestResult" ADD CONSTRAINT "QuizUserBestResult_bestAttemptId_fkey" FOREIGN KEY ("bestAttemptId") REFERENCES "QuizAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFeedback" ADD CONSTRAINT "CourseFeedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFeedback" ADD CONSTRAINT "CourseFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyTemplate" ADD CONSTRAINT "CourseSurveyTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyQuestion" ADD CONSTRAINT "CourseSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseSurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReusableCourseSurveyQuestion" ADD CONSTRAINT "ReusableCourseSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReusableCourseSurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyResponse" ADD CONSTRAINT "CourseSurveyResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseSurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyResponse" ADD CONSTRAINT "CourseSurveyResponse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyResponse" ADD CONSTRAINT "CourseSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyAnswer" ADD CONSTRAINT "CourseSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CourseSurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSurveyAnswer" ADD CONSTRAINT "CourseSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseSurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyTemplate" ADD CONSTRAINT "CourseItemSurveyTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyTemplate" ADD CONSTRAINT "CourseItemSurveyTemplate_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyQuestion" ADD CONSTRAINT "CourseItemSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseItemSurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyResponse" ADD CONSTRAINT "CourseItemSurveyResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseItemSurveyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyResponse" ADD CONSTRAINT "CourseItemSurveyResponse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyResponse" ADD CONSTRAINT "CourseItemSurveyResponse_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyResponse" ADD CONSTRAINT "CourseItemSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyAnswer" ADD CONSTRAINT "CourseItemSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CourseItemSurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseItemSurveyAnswer" ADD CONSTRAINT "CourseItemSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseItemSurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLearnerState" ADD CONSTRAINT "CourseLearnerState_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLearnerState" ADD CONSTRAINT "CourseLearnerState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLearnerState" ADD CONSTRAINT "CourseLearnerState_lastOpenedCourseItemId_fkey" FOREIGN KEY ("lastOpenedCourseItemId") REFERENCES "CourseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrNotificationPreference" ADD CONSTRAINT "HrNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrNotificationDispatch" ADD CONSTRAINT "HrNotificationDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrNotificationDismissal" ADD CONSTRAINT "HrNotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrReportSchedule" ADD CONSTRAINT "HrReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrReportSchedule" ADD CONSTRAINT "HrReportSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrReportScheduleDispatch" ADD CONSTRAINT "HrReportScheduleDispatch_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "HrReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReminderDispatch" ADD CONSTRAINT "CourseReminderDispatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReminderDispatch" ADD CONSTRAINT "CourseReminderDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
