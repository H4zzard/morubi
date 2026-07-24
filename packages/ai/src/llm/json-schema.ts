// Zod -> JSON Schema no dialeto que a saída estruturada da Anthropic aceita.
// Só o driver `cli` usa isto: o AI SDK faz a mesma conversão internamente no
// driver `api`.
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

/**
 * Palavras-chave que a saída estruturada da Anthropic NÃO suporta. Deixá-las
 * no schema faz a chamada falhar inteira; removê-las não perde garantia
 * nenhuma, porque quem valida de verdade do nosso lado é o `schema.parse()`
 * do Zod depois que a resposta chega.
 */
const UNSUPPORTED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
] as const;

type JsonNode = Record<string, unknown>;

function isNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normaliza o schema recursivamente:
 * 1. remove as palavras-chave não suportadas;
 * 2. força `additionalProperties: false` em todo objeto;
 * 3. força TODAS as propriedades como obrigatórias.
 *
 * O item 3 é exigência do modo estrito da Anthropic. Consequência prática:
 * campos com `.default()` no Zod passam a ser emitidos explicitamente pelo
 * modelo (o default continua valendo como rede de segurança no parse). Se um
 * dia algum contrato precisar de campo realmente ausente, use `.nullable()`,
 * não `.optional()`.
 */
function normalize(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) normalize(item);
    return;
  }
  if (!isNode(node)) return;

  for (const keyword of UNSUPPORTED_KEYWORDS) delete node[keyword];

  if (isNode(node.properties)) {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties);
  }

  for (const value of Object.values(node)) normalize(value);
}

/** Converte um schema Zod para o JSON Schema aceito por `claude --json-schema`. */
export function toAnthropicJsonSchema(schema: z.ZodTypeAny): JsonNode {
  // $refStrategy "none" inlineia tudo: um schema autocontido é mais previsível
  // de depurar quando o modelo devolve algo inesperado.
  const json = zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }) as JsonNode;
  delete json.$schema;
  normalize(json);
  return json;
}
