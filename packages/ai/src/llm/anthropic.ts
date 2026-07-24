// Driver `api`: Anthropic via ANTHROPIC_API_KEY. É o caminho de produção e o
// comportamento continua idêntico ao que existia antes da porta `llm/`.
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { AI_CONFIG, llmAbortSignal } from "../config";
import type { LlmDriver, LlmObjectParams, LlmTextParams } from "./types";

export const driver: LlmDriver = {
  async object<S extends z.ZodTypeAny>({
    schema,
    system,
    prompt,
  }: LlmObjectParams<S>): Promise<z.infer<S>> {
    const { object } = await generateObject({
      model: anthropic(AI_CONFIG.generationModel),
      schema,
      system,
      prompt,
      abortSignal: llmAbortSignal(),
    });
    return object;
  },

  async text({ system, prompt }: LlmTextParams): Promise<string> {
    const { text } = await generateText({
      model: anthropic(AI_CONFIG.generationModel),
      system,
      prompt,
      abortSignal: llmAbortSignal(),
    });
    return text;
  },
};
