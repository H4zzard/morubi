import { redirect } from "next/navigation";
import { prisma } from "@morubi/db";
import type { CoachingReportDTO } from "@morubi/api-client";
import { getAuthContext } from "@/lib/auth";
import { toReportDTO } from "@/lib/coaching";
import { CoachingManager } from "./coaching-manager";

export default async function CoachingPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.user.role !== "GESTOR") redirect("/dashboard");

  const [reports, tenant] = await Promise.all([
    prisma.coachingReport.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.tenant.findUnique({
      where: { id: ctx.user.tenantId },
      select: { coachingDays: true },
    }),
  ]);

  const list: CoachingReportDTO[] = reports.map(toReportDTO);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Coaching do time</h1>
        <p className="text-sm text-ink-400">
          O Morubi analisa as conversas de cada vendedor e aponta o que está acertando, o que
          precisa melhorar e quais leads precisam de follow up.
        </p>
      </div>
      <CoachingManager initialReports={list} initialDays={tenant?.coachingDays ?? []} />
    </div>
  );
}
