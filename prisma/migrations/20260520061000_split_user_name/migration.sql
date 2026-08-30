ALTER TABLE "User" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
UPDATE "User" SET "firstName" = trim("name") WHERE trim("firstName") = '';
