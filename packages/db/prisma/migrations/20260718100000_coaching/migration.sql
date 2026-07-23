-- ============================================================================
-- Coaching: dias configurados por tenant + relatórios de coaching por vendedor.
-- Migration ADITIVA.
-- ============================================================================

ALTER TABLE "Tenant" ADD COLUMN "coachingDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE TABLE "CoachingReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "conversationsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachingReport_tenantId_idx" ON "CoachingReport"("tenantId");
CREATE INDEX "CoachingReport_tenantId_userId_idx" ON "CoachingReport"("tenantId", "userId");
ALTER TABLE "CoachingReport" ADD CONSTRAINT "CoachingReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
