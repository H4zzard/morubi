import { OutcomeRequestSchema } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireUser } from "@/lib/auth";
import { requireOwnedConversation } from "@/lib/conversation";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Registra o desfecho (ganha/perdida) da conversa — alimenta o dashboard. */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireUser(req);
    const { id } = await params;
    await requireOwnedConversation(id, ctx);

    const { outcome, dealValue } = OutcomeRequestSchema.parse(await req.json());
    await prisma.conversation.update({
      where: { id },
      data: { outcome, ...(dealValue != null ? { dealValue } : {}) },
    });

    return ok({ ok: true });
  });
}
