// Driver `cli`: delega a geração ao Claude Code instalado na máquina, em modo
// headless (`claude -p`). A autenticação usada é a da assinatura do CLI, então
// nenhuma chamada passa pela ANTHROPIC_API_KEY.
//
// Só para desenvolvimento e demo local. Produção continua no driver `api`:
// a cota de assinatura é pessoal e não serve para atender vendedores reais.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { AI_CONFIG, LlmError, LlmTimeoutError } from "../config";
import { toAnthropicJsonSchema } from "./json-schema";
import type { LlmDriver, LlmObjectParams, LlmTextParams } from "./types";

/**
 * Cada chamada é um processo Node completo (~2s só de partida). Sem teto, uma
 * rajada de vendedores no side panel abriria dezenas de processos e derrubaria
 * a máquina de dev.
 */
const MAX_CONCURRENCY = Number(process.env.CLAUDE_CLI_CONCURRENCY ?? 2);

/**
 * Teto próprio, bem maior que o `AI_CONFIG.llmTimeoutMs`. Aquele existe por
 * causa do limite de 60s de função da Vercel, que não vale em localhost — e o
 * CLI é bem mais lento que a API: ele roda um harness agêntico completo (a
 * saída estruturada gasta um turno extra). Medido: ~23s numa análise pequena.
 */
const TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS ?? 180_000);

let active = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<() => void> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
    waiting.shift()?.();
  };
}

/**
 * Localiza o executável. No Windows o que está no PATH é `claude.cmd`, que o
 * `spawn` não consegue executar sem shell (e shell + prompt com aspas/quebras
 * de linha é pedido de bug). O pacote instala um binário nativo de verdade —
 * apontar direto para ele evita shell inteiramente.
 */
let cachedBin: string | null = null;
function resolveBin(): { command: string; shell: boolean } {
  if (process.env.CLAUDE_CLI_PATH) return { command: process.env.CLAUDE_CLI_PATH, shell: false };

  if (cachedBin) return { command: cachedBin, shell: false };

  if (process.platform === "win32" && process.env.APPDATA) {
    const candidate = join(
      process.env.APPDATA,
      "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe",
    );
    if (existsSync(candidate)) {
      cachedBin = candidate;
      return { command: candidate, shell: false };
    }
    // Último recurso no Windows: resolver pelo PATH exige shell.
    return { command: "claude", shell: true };
  }

  return { command: "claude", shell: false };
}

/** Diretório neutro de trabalho: evita que o CLI leia o CLAUDE.md do repo. */
let cachedCwd: string | null = null;
function workdir(): string {
  if (!cachedCwd) {
    cachedCwd = join(tmpdir(), "morubi-llm-cli");
    mkdirSync(cachedCwd, { recursive: true });
  }
  return cachedCwd;
}

/** Envelope de `--output-format json`. Só os campos que consumimos. */
interface CliEnvelope {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

function baseArgs(system: string): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--model",
    AI_CONFIG.generationModel,
    "--system-prompt",
    system,
    // Geração pura: sem Bash/Edit/Read, o CLI não deve tocar em nada.
    "--tools",
    "",
    // Isola a geração da configuração pessoal de quem roda.
    //
    // `--safe-mode` não existe no CLI 2.x. O substituto óbvio seria `--bare`,
    // mas ele NÃO serve aqui: a doc dele diz que a auth passa a ser
    // "strictly ANTHROPIC_API_KEY (OAuth and keychain are never read)", ou seja,
    // desligaria justamente o login da assinatura que este driver existe para
    // usar. Ficamos com o isolamento que não mexe em autenticação; a execução
    // já roda num diretório temporário, então não há CLAUDE.md do projeto por perto.
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
}

function runCli(args: string[], prompt: string): Promise<CliEnvelope> {
  return new Promise((resolve, reject) => {
    const { command, shell } = resolveBin();

    // A ANTHROPIC_API_KEY é removida de propósito: com ela presente o CLI
    // cobraria da API, que é exatamente o que este driver existe para evitar.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const child = spawn(command, args, { cwd: workdir(), env, shell, windowsHide: true });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new LlmError(
          `Não consegui executar o Claude CLI (${command}). Instale o Claude Code ou defina CLAUDE_CLI_PATH. Detalhe: ${err.message}`,
          502,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new LlmTimeoutError());
      if (code !== 0) {
        return reject(new Error(`claude cli saiu com código ${code}: ${stderr.trim() || stdout.trim()}`));
      }
      try {
        const envelope = JSON.parse(stdout) as CliEnvelope;
        if (envelope.is_error) {
          return reject(new Error(`claude cli retornou erro: ${envelope.result ?? "sem detalhe"}`));
        }
        resolve(envelope);
      } catch {
        reject(new Error(`resposta do claude cli não é JSON válido: ${stdout.slice(0, 500)}`));
      }
    });

    // Prompt sempre por stdin, nunca por argv: no Windows a linha de comando
    // tem limite de ~32KB e os prompts com RAG passam disso.
    child.stdin.end(prompt, "utf8");
  });
}

export const driver: LlmDriver = {
  async object<S extends z.ZodTypeAny>({
    schema,
    system,
    prompt,
  }: LlmObjectParams<S>): Promise<z.infer<S>> {
    const release = await acquire();
    try {
      const jsonSchema = toAnthropicJsonSchema(schema);
      const envelope = await runCli(
        [...baseArgs(system), "--json-schema", JSON.stringify(jsonSchema)],
        prompt,
      );

      // O CLI já valida contra o schema e devolve o objeto pronto em
      // `structured_output`; `result` é o mesmo dado serializado.
      const raw =
        envelope.structured_output ??
        (envelope.result ? (JSON.parse(envelope.result) as unknown) : undefined);

      if (raw === undefined) {
        throw new Error("claude cli não devolveu saída estruturada");
      }

      // O Zod continua sendo a fonte de verdade do tipo.
      return schema.parse(raw);
    } finally {
      release();
    }
  },

  async text({ system, prompt }: LlmTextParams): Promise<string> {
    const release = await acquire();
    try {
      const envelope = await runCli(baseArgs(system), prompt);
      return envelope.result ?? "";
    } finally {
      release();
    }
  },
};
