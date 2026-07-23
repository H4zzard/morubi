import { CoachingScheduleRequestSchema } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireRole } from "@/lib/auth";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Define em quais dias da semana (0=dom ... 6=sáb) o coaching roda sozinho. */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const { days } = CoachingScheduleRequestSchema.parse(await req.json());

    // Normaliza: sem repetidos, ordenado.
    const unique = [...new Set(days)].sort((a, b) => a - b);

    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { coachingDays: unique },
    });

    return ok({ ok: true, days: unique });
  });
}
