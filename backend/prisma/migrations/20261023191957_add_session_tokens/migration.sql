-- Bestehende Sitzungen haben weder Tokens noch IAM-Rechte; sie werden beendet und die Nutzer
-- melden sich einmal neu an (ADR-20).
DELETE FROM "auth_sessions";

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "accessCheckedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "accessToken" TEXT NOT NULL,
ADD COLUMN     "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "organizationName" TEXT NOT NULL,
ADD COLUMN     "permissions" TEXT[],
ADD COLUMN     "refreshToken" TEXT NOT NULL;
