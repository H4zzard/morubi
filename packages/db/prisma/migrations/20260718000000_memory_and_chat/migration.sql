-- ============================================================================
-- Memória evolutiva por contato + chat do copiloto + campos de dashboard.
-- Migration ADITIVA: não altera nem remove nada existente.
-- ============================================================================

-- Valor do negócio (centavos) para receita projetada / em risco
ALTER TABLE "Conversation" ADD COLUMN "dealValue" INTEGER;

-- Erros do vendedor detectados por análise (alimenta "Erros mais comuns")
ALTER TABLE "Suggestion" ADD COLUMN "mistakes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Memória evolutiva por contato
CREATE TABLE "ContactMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "leadName" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "keyFacts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "analysisCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactMemory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactMemory_tenantId_channel_externalKey_key" ON "ContactMemory"("tenantId", "channel", "externalKey");
CREATE INDEX "ContactMemory_tenantId_idx" ON "ContactMemory"("tenantId");
ALTER TABLE "ContactMemory" ADD CONSTRAINT "ContactMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chat do copiloto (vendedor <-> Morubi)
CREATE TYPE "ChatRole" AS ENUM ('VENDEDOR', 'ASSISTENTE');

CREATE TABLE "CopilotChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "correctionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CopilotChatMessage_conversationId_idx" ON "CopilotChatMessage"("conversationId");
ALTER TABLE "CopilotChatMessage" ADD CONSTRAINT "CopilotChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
