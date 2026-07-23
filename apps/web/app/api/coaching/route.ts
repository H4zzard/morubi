import type { CoachingListResponse } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireRole } from "@/lib/auth";
import { toReportDTO } from "@/lib/coaching";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Lista os relatórios de coaching do tenant + os dias agendados. */
export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);

    const [reports, tenant] = await Promise.all([
      prisma.coachingReport.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { coachingDays: true },
      }),
    ]);

    const body: CoachingListResponse = {
      reports: reports.map(toReportDTO),
      days: tenant?.coachingDays ?? [],
    };
    return ok(body);
  });
}
