-- CreateEnum
CREATE TYPE "EnlaceUserStatus" AS ENUM ('PENDING', 'REGISTERING', 'REGISTERED', 'ERROR');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REGISTRO', 'LIQUIDACION', 'COMPROBANTE', 'FULL_FLOW', 'PAGO_PSE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING');

-- CreateEnum
CREATE TYPE "PagoStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'PAGADA', 'RECHAZADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "PseStatus" AS ENUM ('AWAITING_CODE', 'CODE_RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "EnlaceUser" (
    "id" TEXT NOT NULL,
    "uleUserId" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "enlaceUserId" TEXT,
    "enlaceStatus" "EnlaceUserStatus" NOT NULL DEFAULT 'PENDING',
    "eps" TEXT,
    "pension" TEXT,
    "arl" TEXT,
    "registeredAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnlaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "uleUserId" TEXT NOT NULL,
    "enlaceUserId" TEXT,
    "paymentId" TEXT,
    "inputData" JSONB NOT NULL,
    "resultData" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilaPlanilla" (
    "id" TEXT NOT NULL,
    "uleUserId" TEXT NOT NULL,
    "enlaceUserId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "numeroPlanilla" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "ingresoBase" INTEGER NOT NULL,
    "ibc" INTEGER NOT NULL,
    "salud" INTEGER NOT NULL,
    "pension" INTEGER NOT NULL,
    "arl" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "estadoPago" "PagoStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fechaLiquidacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilaPlanilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "uleUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedToUle" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "screenshot" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "id" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL,
    "cookies" JSONB NOT NULL,
    "localStorage" JSONB,
    "sessionData" JSONB,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pse_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "PseStatus" NOT NULL DEFAULT 'AWAITING_CODE',
    "valorTotal" INTEGER NOT NULL,
    "numeroPlanilla" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "codeEnteredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dynamicCode" TEXT,
    "codeValid" BOOLEAN,
    "success" BOOLEAN,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pse_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnlaceUser_uleUserId_key" ON "EnlaceUser"("uleUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EnlaceUser_numeroDocumento_key" ON "EnlaceUser"("numeroDocumento");

-- CreateIndex
CREATE INDEX "EnlaceUser_uleUserId_idx" ON "EnlaceUser"("uleUserId");

-- CreateIndex
CREATE INDEX "EnlaceUser_numeroDocumento_idx" ON "EnlaceUser"("numeroDocumento");

-- CreateIndex
CREATE INDEX "Task_type_status_idx" ON "Task"("type", "status");

-- CreateIndex
CREATE INDEX "Task_uleUserId_idx" ON "Task"("uleUserId");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilaPlanilla_numeroPlanilla_key" ON "PilaPlanilla"("numeroPlanilla");

-- CreateIndex
CREATE INDEX "PilaPlanilla_uleUserId_periodo_idx" ON "PilaPlanilla"("uleUserId", "periodo");

-- CreateIndex
CREATE INDEX "PilaPlanilla_numeroPlanilla_idx" ON "PilaPlanilla"("numeroPlanilla");

-- CreateIndex
CREATE INDEX "PilaPlanilla_estadoPago_idx" ON "PilaPlanilla"("estadoPago");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_planillaId_key" ON "Comprobante"("planillaId");

-- CreateIndex
CREATE INDEX "Comprobante_uleUserId_idx" ON "Comprobante"("uleUserId");

-- CreateIndex
CREATE INDEX "TaskLog_taskId_timestamp_idx" ON "TaskLog"("taskId", "timestamp");

-- CreateIndex
CREATE INDEX "TaskLog_level_idx" ON "TaskLog"("level");

-- CreateIndex
CREATE INDEX "BotSession_sessionType_isValid_idx" ON "BotSession"("sessionType", "isValid");

-- CreateIndex
CREATE UNIQUE INDEX "pse_sessions_sessionId_key" ON "pse_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "pse_sessions_sessionId_idx" ON "pse_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "pse_sessions_status_idx" ON "pse_sessions"("status");

-- CreateIndex
CREATE INDEX "pse_sessions_expiresAt_idx" ON "pse_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "pse_sessions_planillaId_idx" ON "pse_sessions"("planillaId");

-- CreateIndex
CREATE INDEX "pse_sessions_taskId_idx" ON "pse_sessions"("taskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_enlaceUserId_fkey" FOREIGN KEY ("enlaceUserId") REFERENCES "EnlaceUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilaPlanilla" ADD CONSTRAINT "PilaPlanilla_enlaceUserId_fkey" FOREIGN KEY ("enlaceUserId") REFERENCES "EnlaceUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "PilaPlanilla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pse_sessions" ADD CONSTRAINT "pse_sessions_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "PilaPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pse_sessions" ADD CONSTRAINT "pse_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
