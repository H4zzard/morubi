// Criação de item da base de conhecimento + ingestão de embedding — usado
// tanto pela criação manual (título+conteúdo) quanto pelo upload de arquivo.
import type { KnowledgeItemDTO } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { ingestKnowledgeItem } from "@morubi/ai";

export async function createKnowledgeItem(
  tenantId: string,
  title: string,
  content: string,
): Promise<KnowledgeItemDTO> {
  const item = await prisma.knowledgeItem.create({
    data: { tenantId, title, content },
  });

  // Ingestão de embedding (best-effort — não bloqueia a criação se a chave faltar).
  try {
    await ingestKnowledgeItem(item.id, `${item.title}\n\n${item.content}`);
  } catch (err) {
    console.error("[knowledge] falha ao gerar embedding:", err);
  }

  return {
    id: item.id,
    title: item.title,
    content: item.content,
    createdAt: item.createdAt.toISOString(),
  };
}
