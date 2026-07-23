import { requireUser } from "@/lib/auth";
import { computeOverview } from "@/lib/metrics";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/**
 * Agregados do dashboard: gestor vê o tenant; vendedor vê só os próprios dados.
 * `?insight=1` gera também o insight da IA (custa uma chamada de LLM, então fica
 * fora do caminho padrão para não encarecer polling).
 */
export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const withInsight = new URL(req.url).searchParams.get("insight") === "1";
    const body = await computeOverview({
      role: user.role,
      userId: user.id,
      tenantId: user.tenantId,
      withInsight,
      tenantName: user.tenant.name,
    });
    return ok(body);
  });
}
