import type { TranscribeResponse } from "@morubi/api-client";
import { transcribe } from "@morubi/ai";
import { requireUser } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api-response";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Áudio pode ser grande; limite defensivo (Gemini aceita bem além disso, mas
// evita upload absurdo travando a função).
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB

export const OPTIONS = () => corsPreflight();

/** Recebe áudio (multipart) e retorna a transcrição (Gemini multimodal). */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    rateLimit(`transcribe:${user.id}`, LIMITS.transcribe.limit, LIMITS.transcribe.windowMs);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Arquivo de áudio ausente", 400);
    if (file.size > MAX_AUDIO_BYTES) return fail("Áudio grande demais (máx. 20 MB)", 413);

    const text = await transcribe(file);
    return ok<TranscribeResponse>({ text });
  });
}
