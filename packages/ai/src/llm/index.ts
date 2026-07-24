// Porta única de geração. Todo o resto de packages/ai fala com estas duas
// funções; qual provedor responde é decidido por AI_PROVIDER.
import type { z } from "zod";
import type { LlmDriver, LlmObjectParams, LlmProviderName, LlmTextParams } from "./types";

export type { LlmDriver, LlmProviderName } from "./types";

const VALID: LlmProviderName[] = ["api", "cli", "mock"];

/** Provedor em uso. `api` é o padrão: sem configuração, nada muda. */
export function activeLlmProvider(): LlmProviderName {
  const raw = (process.env.AI_PROVIDER ?? "api").trim().toLowerCase();
  if ((VALID as string[]).includes(raw)) return raw as LlmProviderName;
  console.warn(`[ai] AI_PROVIDER="${raw}" desconhecido; usando "api".`);
  return "api";
}

async function load(): Promise<LlmDriver> {
  const provider = activeLlmProvider();

  // Trava dura: `cli` depende da assinatura pessoal de quem roda e `mock` não
  // chama IA nenhuma. Nenhum dos dois pode atender vendedor de verdade.
  if (provider !== "api" && process.env.NODE_ENV === "production") {
    throw new Error(
      `AI_PROVIDER="${provider}" não é permitido em produção. Use "api" com ANTHROPIC_API_KEY.`,
    );
  }

  if (provider !== "api") {
    console.warn(`[ai] gerando com o provedor "${provider}" (sem ANTHROPIC_API_KEY).`);
  }

  if (provider === "cli") return (await import("./claude-cli")).driver;
  if (provider === "mock") return (await import("./mock")).driver;
  return (await import("./anthropic")).driver;
}

// Resolvido uma vez por processo: trocar de provedor exige reiniciar o dev server.
let cached: Promise<LlmDriver> | null = null;
function driver(): Promise<LlmDriver> {
  if (!cached) cached = load();
  return cached;
}

/** Geração estruturada: devolve o objeto já validado pelo `schema`. */
export async function llmObject<S extends z.ZodTypeAny>(
  params: LlmObjectParams<S>,
): Promise<z.infer<S>> {
  return (await driver()).object(params);
}

/** Geração de texto livre. */
export async function llmText(params: LlmTextParams): Promise<string> {
  return (await driver()).text(params);
}
