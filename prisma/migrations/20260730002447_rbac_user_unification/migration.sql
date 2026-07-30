-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENTE', 'BARBEIRO', 'DONO', 'ADMIN');

-- Drop FKs before renaming Admin/Client (re-added at the end pointing at "User")
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_adminId_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clientId_fkey";

-- Rename Admin -> User, preserving existing rows and ids (staff accounts keep working)
ALTER TABLE "Admin" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "Admin_pkey" TO "User_pkey";
ALTER INDEX "Admin_email_key" RENAME TO "User_email_key";

-- Bring the renamed table in line with the unified schema.
-- Existing accounts (today's "Admin") become DONO by default; the column's
-- steady-state default then matches schema.prisma (@default(CLIENTE)).
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'DONO';
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CLIENTE';
ALTER TABLE "User" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Temporary bridge column to remap Appointment.clientId after merging Client rows in
ALTER TABLE "User" ADD COLUMN "_old_client_id" INTEGER;

-- Merge Client rows into User with fresh ids, role CLIENTE
INSERT INTO "User" ("name", "email", "phone", "password", "role", "createdAt", "updatedAt", "_old_client_id")
SELECT "name", "email", "phone", COALESCE("password", ''), 'CLIENTE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "id"
FROM "Client";

-- Point existing appointments at the new User id of their client
UPDATE "Appointment" a
SET "clientId" = u."id"
FROM "User" u
WHERE u."_old_client_id" = a."clientId";

-- Drop the temporary bridge column and the old Client table
ALTER TABLE "User" DROP COLUMN "_old_client_id";
DROP TABLE "Client";

-- Recreate the foreign keys pointing at the unified User table
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
