// Cliente Google Gemini compartilhado (embeddings + transcrição). Único ponto de acesso.
// Geração de texto continua no Anthropic (ver analyze.ts) — aqui é só a ferramenta
// certa para embedding e áudio.
import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "./config";

let _client: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Gera o embedding de um texto (para ingestão da base ou consulta RAG).
 * `outputDimensionality` mantém a saída em 1536 dims, compatível com a coluna
 * pgvector existente. `taskType` melhora a recuperação (documento vs. consulta).
 */
export async function embed(text: string, taskType?: EmbedTaskType): Promise<number[]> {
  const res = await client().models.embedContent({
    model: AI_CONFIG.embeddingModel,
    contents: text.slice(0, 8000),
    config: {
      outputDimensionality: AI_CONFIG.embeddingDimensions,
      ...(taskType ? { taskType } : {}),
    },
  });
  const values = res.embeddings?.[0]?.values;
  if (!values) throw new Error("Falha ao gerar embedding");
  return values;
}

/** Transcreve um áudio usando o Gemini multimodal. Recebe um File/Blob pronto. */
export async function transcribe(file: File): Promise<string> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const res = await client().models.generateContent({
    model: AI_CONFIG.transcriptionModel,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: file.type || "audio/ogg", data: base64 } },
          {
            text: "Transcreva este áudio em português do Brasil. Responda APENAS com a transcrição, sem comentários nem formatação.",
          },
        ],
      },
    ],
  });
  return (res.text ?? "").trim();
}
