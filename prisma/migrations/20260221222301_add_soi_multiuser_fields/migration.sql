-- CreateEnum
CREATE TYPE "SOIAccountStatus" AS ENUM ('NOT_LINKED', 'PENDING_CREATION', 'CREATING', 'ACTIVE', 'CREDENTIALS_ERROR', 'BLOCKED');

-- AlterTable
ALTER TABLE "EnlaceUser" ADD COLUMN     "apellidos" TEXT,
ADD COLUMN     "celular" TEXT,
ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "soiAccountStatus" "SOIAccountStatus" NOT NULL DEFAULT 'NOT_LINKED',
ADD COLUMN     "soiLastLoginAt" TIMESTAMP(3),
ADD COLUMN     "soiLinkedAt" TIMESTAMP(3),
ADD COLUMN     "soiPassword" TEXT,
ADD COLUMN     "soiPasswordIV" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateIndex
CREATE INDEX "EnlaceUser_soiAccountStatus_idx" ON "EnlaceUser"("soiAccountStatus");
