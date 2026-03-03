-- CreateEnum
CREATE TYPE "PagoAdminStatus" AS ENUM ('PENDING_ADMIN', 'RPA_STARTING', 'RPA_AUTHENTICATING', 'RPA_NAVIGATING', 'RPA_PSE_PROCESS', 'AWAITING_ADMIN_INPUT', 'VERIFYING_PAYMENT', 'DOWNLOADING_RECEIPT', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "pago_admin_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "taskId" TEXT,
    "status" "PagoAdminStatus" NOT NULL DEFAULT 'PENDING_ADMIN',
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "banco" TEXT NOT NULL DEFAULT 'BANCOLOMBIA',
    "browserSessionId" TEXT,
    "lastScreenshot" TEXT,
    "screenshotHistory" JSONB,
    "adminId" TEXT,
    "adminLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "awaitingAdminAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "adminTimeoutMinutes" INTEGER NOT NULL DEFAULT 10,
    "timeoutAt" TIMESTAMP(3),
    "success" BOOLEAN,
    "transactionId" TEXT,
    "errorMessage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_admin_sessions_sessionId_key" ON "pago_admin_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "pago_admin_sessions_sessionId_idx" ON "pago_admin_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "pago_admin_sessions_status_idx" ON "pago_admin_sessions"("status");

-- CreateIndex
CREATE INDEX "pago_admin_sessions_planillaId_idx" ON "pago_admin_sessions"("planillaId");

-- CreateIndex
CREATE INDEX "pago_admin_sessions_adminId_idx" ON "pago_admin_sessions"("adminId");

-- CreateIndex
CREATE INDEX "pago_admin_sessions_createdAt_idx" ON "pago_admin_sessions"("createdAt");

-- AddForeignKey
ALTER TABLE "pago_admin_sessions" ADD CONSTRAINT "pago_admin_sessions_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "PilaPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_admin_sessions" ADD CONSTRAINT "pago_admin_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
