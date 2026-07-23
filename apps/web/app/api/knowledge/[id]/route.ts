import { UpdateKnowledgeRequestSchema, type KnowledgeItemDTO } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { ingestKnowledgeItem } from "@morubi/ai";
import { requireRole } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 30;

export const OPTIONS = () => corsPreflight();

/** Edita um item da base (reindexa o embedding). Só gestor, só do próprio tenant. */
export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const { id } = await params;
    const input = UpdateKnowledgeRequestSchema.parse(await req.json());

    const existing = await prisma.knowledgeItem.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return fail("Item não encontrado", 404);
    }

    const item = await prisma.knowledgeItem.update({
      where: { id },
      data: { title: input.title, content: input.content },
    });

    // Conteúdo mudou -> reindexa (best-effort: não bloqueia a edição).
    try {
      await ingestKnowledgeItem(item.id, `${item.title}\n\n${item.content}`);
    } catch (err) {
      console.error("[knowledge] falha ao reindexar embedding:", err);
    }

    const dto: KnowledgeItemDTO = {
      id: item.id,
      title: item.title,
      content: item.content,
      createdAt: item.createdAt.toISOString(),
    };
    return ok(dto);
  });
}

/** Exclui um item da base. Só gestor, só do próprio tenant. */
export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const { id } = await params;

    const existing = await prisma.knowledgeItem.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return fail("Item não encontrado", 404);
    }

    await prisma.knowledgeItem.delete({ where: { id } });
    return ok({ ok: true });
  });
}
