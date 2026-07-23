import { redirect } from "next/navigation";
import { prisma } from "@morubi/db";
import { getAuthContext } from "@/lib/auth";
import { CorrectionsManager } from "./corrections-manager";
import type { CorrectionDTO } from "@morubi/api-client";

export default async function CorrectionsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.user.role !== "GESTOR") redirect("/dashboard");

  const corrections = await prisma.correction.findMany({
    where: { tenantId: ctx.user.tenantId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const list: CorrectionDTO[] = corrections.map((c) => ({
    id: c.id,
    scope: c.scope,
    original: c.original,
    corrected: c.corrected,
    userName: c.user.name,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Curadoria de correções</h1>
        <p className="text-sm text-ink-400">
          Correções que os vendedores fizeram. Promova as boas para valer em toda a empresa.
        </p>
      </div>
      <CorrectionsManager initialCorrections={list} />
    </div>
  );
}
