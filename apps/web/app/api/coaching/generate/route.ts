import type { CoachingGenerateResponse } from "@morubi/api-client";
import { requireRole } from "@/lib/auth";
import { generateCoachingForTenant } from "@/lib/coaching";
import { rateLimit } from "@/lib/rate-limit";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
// Gera um relatório por vendedor: várias chamadas de LLM em sequência.
export const maxDuration = 300;

export const OPTIONS = () => corsPreflight();

/** "Gerar agora": produz o coaching de todos os vendedores do tenant. */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    // Caro (N chamadas de LLM): poucas execuções por hora.
    rateLimit(`coaching:${user.tenantId}`, 4, 60 * 60 * 1000);

    const reports = await generateCoachingForTenant(user.tenantId, "manual");
    return ok<CoachingGenerateResponse>({ reports });
  });
}
