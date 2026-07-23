-- ============================================================================
-- Morubi — Migration inicial
-- Cria todas as tabelas + extensão pgvector + coluna embedding + índice/RPC RAG.
-- ============================================================================

-- Extensão de vetores
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE "Role" AS ENUM ('GESTOR', 'VENDEDOR');
CREATE TYPE "Outcome" AS ENUM ('EM_ABERTO', 'GANHA', 'PERDIDA');
CREATE TYPE "Sender" AS ENUM ('CLIENTE', 'VENDEDOR');
CREATE TYPE "MsgType" AS ENUM ('TEXTO', 'AUDIO');
CREATE TYPE "CorrectionScope" AS ENUM ('VENDEDOR', 'TENANT');

-- Tenant
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- Invite
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VENDEDOR',
    "name" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invite_tenantId_email_key" ON "Invite"("tenantId", "email");
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- KnowledgeItem (+ coluna embedding pgvector)
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeItem_tenantId_idx" ON "KnowledgeItem"("tenantId");
-- Índice ANN para similaridade por cosseno
CREATE INDEX "KnowledgeItem_embedding_idx" ON "KnowledgeItem"
    USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Conversation
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalKey" TEXT,
    "leadName" TEXT,
    "outcome" "Outcome" NOT NULL DEFAULT 'EM_ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Conversation_userId_channel_externalKey_key" ON "Conversation"("userId", "channel", "externalKey");
CREATE INDEX "Conversation_tenantId_idx" ON "Conversation"("tenantId");
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- Message
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "Sender" NOT NULL,
    "type" "MsgType" NOT NULL,
    "content" TEXT NOT NULL,
    "externalId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- Suggestion
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "nextAction" TEXT NOT NULL,
    "objection" TEXT,
    "objectionReply" TEXT,
    "usefulFeedback" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Suggestion_conversationId_idx" ON "Suggestion"("conversationId");

-- Correction
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "CorrectionScope" NOT NULL DEFAULT 'VENDEDOR',
    "original" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Correction_tenantId_idx" ON "Correction"("tenantId");
CREATE INDEX "Correction_userId_idx" ON "Correction"("userId");

-- Foreign keys
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Função de busca por similaridade (RAG). Chamada por packages/ai via $queryRaw.
-- Retorna os top-K itens da base de conhecimento de UM tenant por distância
-- de cosseno em relação ao embedding de consulta.
-- ============================================================================
CREATE OR REPLACE FUNCTION match_knowledge(
    query_embedding vector(1536),
    match_tenant_id text,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id text,
    title text,
    content text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        ki.id,
        ki.title,
        ki.content,
        1 - (ki.embedding <=> query_embedding) AS similarity
    FROM "KnowledgeItem" ki
    WHERE ki."tenantId" = match_tenant_id
      AND ki.embedding IS NOT NULL
    ORDER BY ki.embedding <=> query_embedding
    LIMIT match_count;
$$;
