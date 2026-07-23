import {
  SendChatRequestSchema,
  type ChatHistoryResponse,
  type SendChatResponse,
} from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { chatWithCopilot } from "@morubi/ai";
import { requireUser } from "@/lib/auth";
import { requireOwnedConversation } from "@/lib/conversation";
import { ok, handle } from "@/lib/api-response";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

const HISTORY_WINDOW = 20;

export const OPTIONS = () => corsPreflight();

/** Histórico do chat do vendedor com o Morubi nesta conversa. */
export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireUser(req);
    const { id } = await params;
    await requireOwnedConversation(id, ctx);

    const messages = await prisma.copilotChatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
    });

    const body: ChatHistoryResponse = {
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        savedCorrection: !!m.correctionId,
      })),
    };
    return ok(body);
  });
}

/**
 * Vendedor manda uma mensagem para o Morubi. Além de responder, a IA detecta
 * quando a mensagem é uma CORREÇÃO e nós a persistimos como `Correction`
 * (escopo VENDEDOR), que passa a valer nas próximas análises.
 */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireUser(req);
    rateLimit(`chat:${ctx.user.id}`, LIMITS.chat.limit, LIMITS.chat.windowMs);
    const { id } = await params;
    const conversation = await requireOwnedConversation(id, ctx);

    const { message } = SendChatRequestSchema.parse(await req.json());

    const [history, lastSuggestion] = await Promise.all([
      prisma.copilotChatMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_WINDOW,
      }),
      prisma.suggestion.findFirst({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        select: { nextAction: true, probability: true },
      }),
    ]);

    // Grava a mensagem do vendedor antes de chamar a IA (não se perde se falhar).
    await prisma.copilotChatMessage.create({
      data: { conversationId: id, role: "VENDEDOR", content: message },
    });

    const result = await chatWithCopilot({
      conversationId: id,
      tenantId: conversation.tenantId,
      userId: conversation.userId,
      channel: conversation.channel,
      externalKey: conversation.externalKey,
      message,
      history: history.reverse().map((m) => ({ role: m.role, content: m.content })),
      lastSuggestion,
    });

    // Correção detectada: vira memória evolutiva de verdade.
    let correctionId: string | null = null;
    if (result.correction) {
      const created = await prisma.correction.create({
        data: {
          tenantId: conversation.tenantId,
          userId: ctx.user.id,
          scope: "VENDEDOR",
          original: result.correction.original,
          corrected: result.correction.corrected,
        },
        select: { id: true },
      });
      correctionId = created.id;
    }

    const reply = await prisma.copilotChatMessage.create({
      data: {
        conversationId: id,
        role: "ASSISTENTE",
        content: result.reply,
        correctionId,
      },
    });

    const body: SendChatResponse = {
      reply: {
        id: reply.id,
        role: reply.role,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
        savedCorrection: !!correctionId,
      },
      savedCorrection: result.correction,
    };
    return ok(body, 201);
  });
}
