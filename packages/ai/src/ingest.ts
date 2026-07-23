// Ingestão da base de conhecimento: gera embedding e grava via helper único.
import { setKnowledgeEmbedding } from "@morubi/db";
import { embed } from "./gemini";

/** Gera e persiste o embedding de um KnowledgeItem (chamado ao criar/editar). */
export async function ingestKnowledgeItem(id: string, content: string): Promise<void> {
  const embedding = await embed(content, "RETRIEVAL_DOCUMENT");
  await setKnowledgeEmbedding(id, embedding);
}
