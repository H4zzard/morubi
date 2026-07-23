// ============================================================================
// Sanitização de saída da LLM.
//
// Regra de produto: NENHUM texto que o vendedor lê (ou copia para o cliente)
// pode conter travessão. Instrução no prompt não é garantia — modelos voltam a
// usar travessão sob pressão de contexto. Aqui é a rede de segurança
// determinística, aplicada a TODA string gerada antes de sair do pacote.
//
// Importante: hífen comum (-) é preservado. "follow-up", "pós-venda" e listas
// com "- " continuam válidos; o alvo são travessão (—), meia-risca (–) e barra
// horizontal (―) usados como pontuação.
// ============================================================================

const DASHES = "\\u2014\\u2013\\u2015\\u2212"; // — – ― −

/** Remove travessões de um texto, preservando o sentido da frase. */
export function stripDashes(input: string): string {
  if (!input) return input;

  let out = input;

  // 1. Marcador de lista no início da linha: "— item" -> "- item"
  out = out.replace(new RegExp(`^[ \\t]*[${DASHES}][ \\t]+`, "gm"), "- ");

  // 2. Intervalo numérico: "100 – 200" -> "100 a 200"
  out = out.replace(new RegExp(`(\\d)\\s*[${DASHES}]\\s*(\\d)`, "g"), "$1 a $2");

  // 3. Travessão com espaços (aposto/pausa): "o produto — que é bom — vende"
  //    vira vírgula, que é a pontuação equivalente em PT-BR.
  out = out.replace(new RegExp(`\\s+[${DASHES}]\\s+`, "g"), ", ");

  // 4. Qualquer travessão restante (colado a palavra) vira vírgula + espaço.
  out = out.replace(new RegExp(`[${DASHES}]`, "g"), ", ");

  // 5. Limpeza da pontuação duplicada que os passos acima podem criar.
  out = out
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*([.;:!?])/g, "$1")
    .replace(/([.;:!?])\s*,/g, "$1 ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/gm, "")
    .replace(/[ \t]{2,}/g, " ");

  return out.trim();
}

/** Aplica stripDashes recursivamente em strings de um objeto/array. */
export function stripDashesDeep<T>(value: T): T {
  if (typeof value === "string") return stripDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map(stripDashesDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripDashesDeep(v);
    return out as T;
  }
  return value;
}
