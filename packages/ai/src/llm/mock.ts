// Driver `mock`: nenhuma rede, nenhum custo, resposta instantânea. Serve para
// mexer em UI, dashboard e fluxo de onboarding sem queimar cota de nada.
//
// Não tenta adivinhar o schema: gera um valor a partir da própria forma do
// schema Zod, de modo que qualquer contrato novo continua funcionando sem
// mexer aqui.
import { z } from "zod";
import type { LlmDriver, LlmObjectParams, LlmTextParams } from "./types";

const MOCK_TEXT = `**O que está indo bem**
- Resposta rápida e tom consultivo nas primeiras mensagens.

**O que precisa melhorar**
- Resposta gerada pelo driver mock: nenhuma IA foi chamada.

**Follow ups pra fazer agora**
- (mock) ligue para o lead de exemplo.`;

/** Constrói um valor plausível para qualquer schema Zod, recursivamente. */
function sample(schema: z.ZodTypeAny, key: string, depth = 0): unknown {
  if (depth > 8) return null;

  if (schema instanceof z.ZodDefault) return schema._def.defaultValue();
  if (schema instanceof z.ZodOptional) return sample(schema.unwrap(), key, depth + 1);
  if (schema instanceof z.ZodNullable) return null;
  if (schema instanceof z.ZodEffects) return sample(schema.innerType(), key, depth + 1);
  if (schema instanceof z.ZodEnum) return schema.options[0];
  if (schema instanceof z.ZodLiteral) return schema.value;
  if (schema instanceof z.ZodBoolean) return false;
  if (schema instanceof z.ZodNumber) return 50;
  if (schema instanceof z.ZodString) return `[mock] ${key}`;
  if (schema instanceof z.ZodArray) return [];
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return Object.fromEntries(
      Object.entries(shape).map(([field, inner]) => [field, sample(inner, field, depth + 1)]),
    );
  }
  return null;
}

export const driver: LlmDriver = {
  async object<S extends z.ZodTypeAny>({ schema }: LlmObjectParams<S>): Promise<z.infer<S>> {
    // Passa pelo parse de propósito: se o mock deixar de satisfazer o contrato,
    // é melhor quebrar em dev do que mascarar um schema inválido.
    return schema.parse(sample(schema, "campo"));
  },

  async text(_params: LlmTextParams): Promise<string> {
    return MOCK_TEXT;
  },
};
