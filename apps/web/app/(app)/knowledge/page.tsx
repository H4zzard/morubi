import { redirect } from "next/navigation";
import { prisma } from "@morubi/db";
import { getAuthContext } from "@/lib/auth";
import { KnowledgeManager } from "./knowledge-manager";

export default async function KnowledgePage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.user.role !== "GESTOR") redirect("/dashboard");

  const items = await prisma.knowledgeItem.findMany({
    where: { tenantId: ctx.user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Base de conhecimento</h1>
        <p className="text-sm text-ink-400">
          O que a IA usa para responder e contornar objeções. Suba preços, garantias, diferenciais,
          FAQ.
        </p>
      </div>
      <KnowledgeManager
        initialItems={items.map((i) => ({
          id: i.id,
          title: i.title,
          content: i.content,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
