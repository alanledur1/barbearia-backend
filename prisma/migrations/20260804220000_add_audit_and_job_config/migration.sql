-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateTable
CREATE TABLE "AuditSettings" (
    "id" SERIAL NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "enabledModules" TEXT NOT NULL DEFAULT 'USERS,BUSINESS_HOURS,HOLIDAYS,PLANS',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobConfig" (
    "id" SERIAL NOT NULL,
    "jobKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobConfig_jobKey_key" ON "JobConfig"("jobKey");

-- Seed default rows (dados apenas, idempotente — não é uma operação destrutiva)
INSERT INTO "AuditSettings" ("id", "retentionDays", "enabledModules", "updatedAt")
VALUES (1, 90, 'USERS,BUSINESS_HOURS,HOLIDAYS,PLANS', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO "JobConfig" ("jobKey", "enabled", "cronExpression", "updatedAt")
VALUES
  ('appointmentReminder', false, '0 9 * * *', CURRENT_TIMESTAMP),
  ('auditLogCleanup', false, '30 3 * * *', CURRENT_TIMESTAMP)
ON CONFLICT ("jobKey") DO NOTHING;
