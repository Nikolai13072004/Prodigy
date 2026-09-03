CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleProfileId" TEXT NOT NULL,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleProfileId_fkey" FOREIGN KEY ("roleProfileId") REFERENCES "RoleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserRole_userId_roleProfileId_key" ON "UserRole"("userId", "roleProfileId");
CREATE INDEX "UserRole_roleProfileId_idx" ON "UserRole"("roleProfileId");

INSERT INTO "UserRole" ("id", "userId", "roleProfileId")
SELECT lower(hex(randomblob(16))), "User"."id", "RoleProfile"."id"
FROM "User"
INNER JOIN "RoleProfile" ON "RoleProfile"."name" = "User"."role"
WHERE "User"."role" IS NOT NULL
  AND "User"."role" <> ''
ON CONFLICT("userId", "roleProfileId") DO NOTHING;
