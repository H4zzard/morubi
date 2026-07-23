import { prisma } from "@morubi/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Gestor promove uma correção para valer em todo o tenant (scope -> TENANT). */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const { id } = await params;

    const correction = await prisma.correction.findUnique({ where: { id } });
    if (!correction || correction.tenantId !== user.tenantId) {
      return fail("Correção não encontrada", 404);
    }

    await prisma.correction.update({
      where: { id },
      data: { scope: "TENANT", approvedBy: user.id },
    });

    return ok({ ok: true });
  });
}
