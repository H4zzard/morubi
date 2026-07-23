// ============================================================================
// Cliente HTTP tipado ÚNICO. Web e extensão o usam — nenhuma das duas faz
// `fetch` cru. A sessão (Bearer token do Supabase) é fornecida por um callback,
// para que web (cookies/SSR) e extensão (chrome.storage) injetem do seu jeito.
// ============================================================================
import {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeResponseSchema,
  ChatHistoryResponse,
  ChatHistoryResponseSchema,
  CoachingGenerateResponse,
  CoachingGenerateResponseSchema,
  CoachingListResponse,
  CoachingListResponseSchema,
  CoachingScheduleRequest,
  ConversationDTO,
  ConversationSchema,
  SendChatRequest,
  SendChatResponse,
  SendChatResponseSchema,
  CorrectionListResponse,
  CorrectionListResponseSchema,
  CreateCorrectionRequest,
  CreateKnowledgeRequest,
  UpdateKnowledgeRequest,
  InviteResult,
  InviteResultSchema,
  InviteUserRequest,
  KnowledgeItemDTO,
  KnowledgeItemSchema,
  KnowledgeListResponse,
  KnowledgeListResponseSchema,
  MetricsOverview,
  MetricsOverviewSchema,
  OutcomeRequest,
  PostMessagesRequest,
  PostMessagesResponse,
  PostMessagesResponseSchema,
  SessionResponse,
  SessionResponseSchema,
  TranscribeResponse,
  TranscribeResponseSchema,
  UpsertConversationRequest,
  UserDTO,
  UserListResponse,
  UserListResponseSchema,
  UserSchema,
} from "./contracts";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  /** Base URL do backend (ex.: http://localhost:3000). */
  baseUrl: string;
  /** Retorna o access token da sessão Supabase (ou null se deslogado). */
  getToken: () => Promise<string | null> | string | null;
}

export function createApiClient(opts: ApiClientOptions) {
  async function request<T>(
    path: string,
    init: RequestInit & { schema?: z.ZodType<T, z.ZodTypeDef, any>; rawBody?: boolean } = {},
  ): Promise<T> {
    const token = await opts.getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!init.rawBody && init.body) headers.set("Content-Type", "application/json");

    const res = await fetch(`${opts.baseUrl}${path}`, { ...init, headers });

    if (!res.ok) {
      let details: unknown;
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body?.error ?? message;
        details = body?.details;
      } catch {
        /* resposta sem corpo JSON */
      }
      throw new ApiError(res.status, message, details);
    }

    if (res.status === 204) return undefined as T;
    const json = await res.json();
    return init.schema ? init.schema.parse(json) : (json as T);
  }

  return {
    // Auth
    getSession: () => request<SessionResponse>("/api/auth/session", { schema: SessionResponseSchema }),

    // Knowledge
    listKnowledge: () =>
      request<KnowledgeListResponse>("/api/knowledge", { schema: KnowledgeListResponseSchema }),
    createKnowledge: (body: CreateKnowledgeRequest) =>
      request<KnowledgeItemDTO>("/api/knowledge", {
        method: "POST",
        body: JSON.stringify(body),
        schema: KnowledgeItemSchema,
      }),
    uploadKnowledgeFile: (file: File) => {
      const form = new FormData();
      form.append("file", file, file.name);
      return request<KnowledgeItemDTO>("/api/knowledge/upload", {
        method: "POST",
        body: form,
        rawBody: true,
        schema: KnowledgeItemSchema,
      });
    },
    updateKnowledge: (id: string, body: UpdateKnowledgeRequest) =>
      request<KnowledgeItemDTO>(`/api/knowledge/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        schema: KnowledgeItemSchema,
      }),
    deleteKnowledge: (id: string) =>
      request<void>(`/api/knowledge/${id}`, { method: "DELETE" }),

    // Users / invites
    listUsers: () => request<UserListResponse>("/api/users", { schema: UserListResponseSchema }),
    inviteUser: (body: InviteUserRequest) =>
      request<InviteResult>("/api/users", {
        method: "POST",
        body: JSON.stringify(body),
        schema: InviteResultSchema,
      }),
    /** Remove um vendedor (ou cancela um convite pendente). id = User.id ou "invite:<id>". */
    removeUser: (id: string) => request<void>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),

    // Conversations
    upsertConversation: (body: UpsertConversationRequest) =>
      request<ConversationDTO>("/api/conversations", {
        method: "POST",
        body: JSON.stringify(body),
        schema: ConversationSchema,
      }),
    postMessages: (conversationId: string, body: PostMessagesRequest) =>
      request<PostMessagesResponse>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
        schema: PostMessagesResponseSchema,
      }),
    analyze: (conversationId: string, body: AnalyzeRequest = {}) =>
      request<AnalyzeResponse>(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
        body: JSON.stringify(body),
        schema: AnalyzeResponseSchema,
      }),
    setOutcome: (conversationId: string, body: OutcomeRequest) =>
      request<void>(`/api/conversations/${conversationId}/outcome`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    // Chat do copiloto (vendedor <-> Morubi)
    getChat: (conversationId: string) =>
      request<ChatHistoryResponse>(`/api/conversations/${conversationId}/chat`, {
        schema: ChatHistoryResponseSchema,
      }),
    sendChat: (conversationId: string, body: SendChatRequest) =>
      request<SendChatResponse>(`/api/conversations/${conversationId}/chat`, {
        method: "POST",
        body: JSON.stringify(body),
        schema: SendChatResponseSchema,
      }),

    // Corrections
    listCorrections: () =>
      request<CorrectionListResponse>("/api/corrections", { schema: CorrectionListResponseSchema }),
    createCorrection: (body: CreateCorrectionRequest) =>
      request<void>("/api/corrections", { method: "POST", body: JSON.stringify(body) }),
    promoteCorrection: (correctionId: string) =>
      request<void>(`/api/corrections/${correctionId}/promote`, { method: "POST" }),

    // Transcription (multipart)
    transcribe: (audio: Blob, filename = "audio.ogg") => {
      const form = new FormData();
      form.append("file", audio, filename);
      return request<TranscribeResponse>("/api/transcribe", {
        method: "POST",
        body: form,
        rawBody: true,
        schema: TranscribeResponseSchema,
      });
    },

    // Metrics
    getMetricsOverview: () =>
      request<MetricsOverview>("/api/metrics/overview", { schema: MetricsOverviewSchema }),

    // Coaching (gestor)
    getCoaching: () =>
      request<CoachingListResponse>("/api/coaching", { schema: CoachingListResponseSchema }),
    generateCoaching: () =>
      request<CoachingGenerateResponse>("/api/coaching/generate", {
        method: "POST",
        schema: CoachingGenerateResponseSchema,
      }),
    setCoachingSchedule: (body: CoachingScheduleRequest) =>
      request<void>("/api/coaching/schedule", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
