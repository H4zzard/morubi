// ============================================================================
// Contratos de API (Zod) — DEFINIDOS UMA ÚNICA VEZ aqui.
// Web, extensão e Route Handlers importam destes schemas; ninguém redeclara
// o "shape" de request/response. Os enums espelham packages/db (Prisma) mas em
// forma de string literal (a fronteira HTTP é textual).
// ============================================================================
import { z } from "zod";

// --- Enums compartilhados (espelham o schema Prisma) ---
export const RoleSchema = z.enum(["GESTOR", "VENDEDOR"]);
export type Role = z.infer<typeof RoleSchema>;

export const OutcomeSchema = z.enum(["EM_ABERTO", "GANHA", "PERDIDA"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const SenderSchema = z.enum(["cliente", "vendedor"]);
export type Sender = z.infer<typeof SenderSchema>;

export const MsgTypeSchema = z.enum(["texto", "audio"]);
export type MsgType = z.infer<typeof MsgTypeSchema>;

export const CorrectionScopeSchema = z.enum(["VENDEDOR", "TENANT"]);
export type CorrectionScope = z.infer<typeof CorrectionScopeSchema>;

// ============================================================================
// AnalysisSchema — saída estruturada do copiloto.
// É o contrato da resposta de /analyze E o schema que packages/ai passa ao
// generateObject. Definido aqui para existir num único lugar; packages/ai o importa.
// ============================================================================
/// Erros de condução do vendedor que a IA detecta. Alimenta o card
/// "Erros mais comuns" do dashboard do gestor. Valores estáveis (persistidos).
export const SellerMistakeSchema = z.enum([
  "preco_cedo_demais",
  "follow_up_perdido",
  "ignorou_sinal_compra",
  "nao_qualificou",
  "resposta_generica",
  "demorou_responder",
  "desconto_sem_necessidade",
]);
export type SellerMistake = z.infer<typeof SellerMistakeSchema>;

export const SELLER_MISTAKE_LABEL: Record<SellerMistake, string> = {
  preco_cedo_demais: "Falou de preço cedo demais",
  follow_up_perdido: "Follow-up perdido",
  ignorou_sinal_compra: "Ignorou sinal de compra",
  nao_qualificou: "Não qualificou o lead",
  resposta_generica: "Resposta genérica",
  demorou_responder: "Demorou a responder",
  desconto_sem_necessidade: "Deu desconto sem necessidade",
};

export const AnalysisSchema = z.object({
  stage: z.enum(["descoberta", "consideracao", "negociacao", "fechamento"]),
  probability: z.number().int().min(0).max(100),
  nextAction: z.string(),
  /// Por que esta é a próxima ação (1 frase). Aparece acima da sugestão no painel.
  reasoning: z.string(),
  objection: z.string().nullable(),
  objectionReply: z.string().nullable(),
  /// Erros cometidos pelo vendedor NESTA conversa (vazio se nenhum).
  mistakes: z.array(SellerMistakeSchema).default([]),
  /// Memória do contato REESCRITA acumulando o que já existia (nunca do zero).
  memorySummary: z.string(),
  /// Fatos duráveis sobre o lead, acumulados (sem repetir).
  memoryKeyFacts: z.array(z.string()).default([]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// --- /api/auth/session ---
export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: RoleSchema,
  }),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    segment: z.string().nullable(),
  }),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// --- /api/knowledge ---
export const KnowledgeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type KnowledgeItemDTO = z.infer<typeof KnowledgeItemSchema>;

export const CreateKnowledgeRequestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
});
export type CreateKnowledgeRequest = z.infer<typeof CreateKnowledgeRequestSchema>;

export const UpdateKnowledgeRequestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
});
export type UpdateKnowledgeRequest = z.infer<typeof UpdateKnowledgeRequestSchema>;

export const KnowledgeListResponseSchema = z.object({
  items: z.array(KnowledgeItemSchema),
});
export type KnowledgeListResponse = z.infer<typeof KnowledgeListResponseSchema>;

// --- /api/users ---
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  createdAt: z.string(),
  pending: z.boolean().default(false),
});
export type UserDTO = z.infer<typeof UserSchema>;

export const InviteUserRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;

// Resposta do convite. Preferimos mandar um e-mail de convite (o vendedor define
// a própria senha). Se o envio falhar (SMTP não configurado, limite do Supabase),
// caímos para a senha temporária, que o gestor repassa manualmente.
export const InviteResultSchema = z.object({
  user: UserSchema,
  /// true = e-mail de convite enviado; o vendedor define a senha pelo link.
  emailSent: z.boolean().default(false),
  /// Preenchido só quando o e-mail NÃO foi enviado (fallback manual).
  tempPassword: z.string().nullable(),
  /// Motivo do fallback, para o gestor entender o que aconteceu.
  fallbackReason: z.string().nullable().default(null),
});
export type InviteResult = z.infer<typeof InviteResultSchema>;

export const UserListResponseSchema = z.object({
  users: z.array(UserSchema),
});
export type UserListResponse = z.infer<typeof UserListResponseSchema>;

// --- /api/conversations ---
// Um valor por adaptador de canal na extensão (packages/extension/.../adapters).
export const ChannelSchema = z.enum(["whatsapp_web", "kentro"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const UpsertConversationRequestSchema = z.object({
  channel: ChannelSchema,
  externalKey: z.string().min(1),
  leadName: z.string().nullable().optional(),
});
export type UpsertConversationRequest = z.infer<typeof UpsertConversationRequestSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  channel: z.string(),
  externalKey: z.string().nullable(),
  leadName: z.string().nullable(),
  outcome: OutcomeSchema,
  dealValue: z.number().nullable().default(null),
  createdAt: z.string(),
  /// Quantas análises já existem para este CONTATO (memória evolutiva).
  /// 0 = primeiro contato; > 0 = o painel mostra "retomando de onde parou".
  memoryAnalysisCount: z.number().default(0),
});
export type ConversationDTO = z.infer<typeof ConversationSchema>;

// --- /api/conversations/:id/messages ---
export const MessageInputSchema = z.object({
  externalId: z.string().nullable().optional(),
  sender: SenderSchema,
  type: MsgTypeSchema,
  content: z.string(), // texto, ou transcrição se áudio
  timestamp: z.string(), // ISO
});
export type MessageInput = z.infer<typeof MessageInputSchema>;

export const PostMessagesRequestSchema = z.object({
  messages: z.array(MessageInputSchema).min(1).max(100),
});
export type PostMessagesRequest = z.infer<typeof PostMessagesRequestSchema>;

export const PostMessagesResponseSchema = z.object({
  inserted: z.number(),
});
export type PostMessagesResponse = z.infer<typeof PostMessagesResponseSchema>;

// --- /api/conversations/:id/analyze ---
export const AnalyzeRequestSchema = z.object({
  // opcional: mensagens ainda não persistidas para incluir na análise imediata.
  recentMessages: z.array(MessageInputSchema).optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = AnalysisSchema.extend({
  suggestionId: z.string(),
  citedKnowledge: z.array(z.object({ title: z.string() })).default([]),
  /// Nº de análises acumuladas para este contato APÓS esta (>= 1).
  memoryAnalysisCount: z.number().default(1),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// --- /api/conversations/:id/outcome ---
export const OutcomeRequestSchema = z.object({
  outcome: z.enum(["GANHA", "PERDIDA"]),
  /// Valor do negócio em centavos (opcional) — alimenta receita do dashboard.
  dealValue: z.number().int().min(0).nullable().optional(),
});
export type OutcomeRequest = z.infer<typeof OutcomeRequestSchema>;

// --- /api/conversations/:id/chat ---
export const ChatRoleSchema = z.enum(["VENDEDOR", "ASSISTENTE"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string(),
  /// true quando esta troca gerou uma correção persistida (a IA "aprendeu").
  savedCorrection: z.boolean().default(false),
});
export type ChatMessageDTO = z.infer<typeof ChatMessageSchema>;

export const ChatHistoryResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
});
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;

export const SendChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});
export type SendChatRequest = z.infer<typeof SendChatRequestSchema>;

export const SendChatResponseSchema = z.object({
  reply: ChatMessageSchema,
  /// Preenchido quando a IA entendeu a mensagem como uma correção e a gravou.
  savedCorrection: z
    .object({ original: z.string(), corrected: z.string() })
    .nullable()
    .default(null),
});
export type SendChatResponse = z.infer<typeof SendChatResponseSchema>;

// --- /api/corrections ---
export const CreateCorrectionRequestSchema = z.object({
  conversationId: z.string().optional(),
  suggestionId: z.string().optional(),
  original: z.string().min(1),
  corrected: z.string().min(1),
});
export type CreateCorrectionRequest = z.infer<typeof CreateCorrectionRequestSchema>;

export const CorrectionSchema = z.object({
  id: z.string(),
  scope: CorrectionScopeSchema,
  original: z.string(),
  corrected: z.string(),
  userName: z.string(),
  createdAt: z.string(),
});
export type CorrectionDTO = z.infer<typeof CorrectionSchema>;

export const CorrectionListResponseSchema = z.object({
  corrections: z.array(CorrectionSchema),
});
export type CorrectionListResponse = z.infer<typeof CorrectionListResponseSchema>;

// --- /api/transcribe ---
export const TranscribeResponseSchema = z.object({
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// --- /api/metrics/overview ---
export const MetricsOverviewSchema = z.object({
  macro: z.object({
    totalConversations: z.number(),
    won: z.number(),
    lost: z.number(),
    open: z.number(),
    winRate: z.number(), // 0..100
    /// Variação da conversão vs. os 7 dias anteriores, em pontos percentuais.
    winRateTrend: z.number(),
    avgProbability: z.number(),
    /// Série da conversão nos últimos 7 dias (para o sparkline).
    winRateSeries: z.array(z.number()).default([]),
    /// Receita projetada (centavos): soma de dealValue ponderada pela probabilidade.
    projectedRevenue: z.number(),
    projectedRevenueTrend: z.number(),
    /// Leads quentes = em aberto com probabilidade >= 70.
    hotLeads: z.number(),
    hotLeadsNew: z.number(),
    /// % dos leads quentes por faixa (para as barrinhas do card).
    highIntentPct: z.number(),
    negotiatingPct: z.number(),
    /// Vendas em risco (centavos) e nº de negócios.
    atRiskRevenue: z.number(),
    atRiskDeals: z.number(),
    /// Objeções abertas sem resposta (banner de alerta).
    openObjections: z.number(),
  }),
  perSeller: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      totalConversations: z.number(),
      won: z.number(),
      lost: z.number(),
      winRate: z.number(),
      /// Variação de negócios ganhos vs. período anterior (+6, -4 ...).
      trend: z.number(),
      /// Ativo nas últimas 24h (card "Equipe ativa").
      active: z.boolean().default(false),
    }),
  ),
  /// Erros mais comuns do time, ordenados por frequência.
  commonMistakes: z.array(
    z.object({
      mistake: SellerMistakeSchema,
      label: z.string(),
      /// % das análises em que o erro apareceu.
      pct: z.number(),
      count: z.number(),
    }),
  ),
  /// Leads que estão esfriando (sem resposta / objeção aberta).
  atRiskLeads: z.array(
    z.object({
      conversationId: z.string(),
      leadName: z.string(),
      reason: z.string(),
      probability: z.number(),
    }),
  ),
  team: z.object({
    online: z.number(),
    total: z.number(),
    /// Atividade por dia nos últimos 7 dias (barrinhas do card).
    activitySeries: z.array(z.number()).default([]),
  }),
  /// Insight gerado pela IA sobre o time (null enquanto não houver dado suficiente).
  insight: z.string().nullable().default(null),
});
export type MetricsOverview = z.infer<typeof MetricsOverviewSchema>;

// --- /api/coaching ---
export const CoachingReportSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  content: z.string(),
  conversationsAnalyzed: z.number(),
  source: z.string(),
  createdAt: z.string(),
});
export type CoachingReportDTO = z.infer<typeof CoachingReportSchema>;

export const CoachingListResponseSchema = z.object({
  reports: z.array(CoachingReportSchema),
  /// Dias da semana configurados (0=domingo ... 6=sábado).
  days: z.array(z.number().int().min(0).max(6)),
});
export type CoachingListResponse = z.infer<typeof CoachingListResponseSchema>;

export const CoachingGenerateResponseSchema = z.object({
  reports: z.array(CoachingReportSchema),
});
export type CoachingGenerateResponse = z.infer<typeof CoachingGenerateResponseSchema>;

export const CoachingScheduleRequestSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
});
export type CoachingScheduleRequest = z.infer<typeof CoachingScheduleRequestSchema>;

// --- Erro padrão (corpo de resposta) ---
export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;
