import { redirect } from "next/navigation";
import { prisma } from "@morubi/db";
import { getAuthContext } from "@/lib/auth";
import { SellersManager } from "./sellers-manager";
import type { UserDTO } from "@morubi/api-client";

export default async function SellersPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.user.role !== "GESTOR") redirect("/dashboard");

  const [users, invites] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: ctx.user.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.invite.findMany({
      where: { tenantId: ctx.user.tenantId, accepted: false },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const list: UserDTO[] = [
    ...users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      pending: false,
    })),
    ...invites
      .filter((i) => !users.some((u) => u.email === i.email))
      .map((i) => ({
        id: `invite:${i.id}`,
        name: i.name,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        pending: true,
      })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Vendedores</h1>
        <p className="text-sm text-ink-400">Convide seu time. Eles usam o mesmo login na extensão.</p>
      </div>
      <SellersManager initialUsers={list} currentUserId={ctx.user.id} />
    </div>
  );
}
