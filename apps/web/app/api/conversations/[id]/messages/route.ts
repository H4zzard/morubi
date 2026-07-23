import { PostMessagesRequestSchema, type PostMessagesResponse } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireUser } from "@/lib/auth";
import { requireOwnedConversation } from "@/lib/conversation";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Recebe um lote de mensagens observadas (dedupe por externalId). */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireUser(req);
    const { id } = await params;
    await requireOwnedConversation(id, ctx);

    const { messages } = PostMessagesRequestSchema.parse(await req.json());

    const data = messages.map((m) => ({
      conversationId: id,
      sender: (m.sender === "cliente" ? "CLIENTE" : "VENDEDOR") as "CLIENTE" | "VENDEDOR",
      type: (m.type === "audio" ? "AUDIO" : "TEXTO") as "AUDIO" | "TEXTO",
      content: m.content,
      externalId: m.externalId ?? null,
      timestamp: new Date(m.timestamp),
    }));

    // createMany com skipDuplicates dedupa via índice único (conversationId, externalId).
    const result = await prisma.message.createMany({ data, skipDuplicates: true });
    await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });

    return ok<PostMessagesResponse>({ inserted: result.count });
  });
}
