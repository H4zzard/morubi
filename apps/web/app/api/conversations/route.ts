import { UpsertConversationRequestSchema, type ConversationDTO } from "@morubi/api-client";
import { prisma, getContactMemoryCount } from "@morubi/db";
import { requireUser } from "@/lib/auth";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Cria/atualiza a conversa ativa (idempotente por externalKey). Chamado pela extensão. */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const input = UpsertConversationRequestSchema.parse(await req.json());

    const conversation = await prisma.conversation.upsert({
      where: {
        userId_channel_externalKey: {
          userId: user.id,
          channel: input.channel,
          externalKey: input.externalKey,
        },
      },
      update: { leadName: input.leadName ?? undefined },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        channel: input.channel,
        externalKey: input.externalKey,
        leadName: input.leadName ?? null,
      },
    });

    // Quantas análises este CONTATO já acumulou (memória evolutiva) — o painel
    // usa para mostrar "retomando de onde parou" em vez de parecer 1º contato.
    const memoryAnalysisCount = await getContactMemoryCount({
      tenantId: user.tenantId,
      channel: conversation.channel,
      externalKey: conversation.externalKey,
    });

    const dto: ConversationDTO = {
      id: conversation.id,
      channel: conversation.channel,
      externalKey: conversation.externalKey,
      leadName: conversation.leadName,
      outcome: conversation.outcome,
      dealValue: conversation.dealValue,
      createdAt: conversation.createdAt.toISOString(),
      memoryAnalysisCount,
    };
    return ok(dto);
  });
}
