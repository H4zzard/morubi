"use server";

import { redirect } from "next/navigation";
import { prisma } from "@morubi/db";
import { getIdentity, getAuthContext } from "@/lib/auth";

/** Cria a empresa (tenant) e vincula o usuário logado como GESTOR. */
export async function createCompany(formData: FormData) {
  const identity = await getIdentity();
  if (!identity) redirect("/login");

  const existing = await getAuthContext();
  if (existing?.user) redirect("/dashboard");

  const companyName = String(formData.get("companyName") ?? "").trim();
  const segment = String(formData.get("segment") ?? "").trim() || null;
  const userName = String(formData.get("userName") ?? "").trim() || identity.email.split("@")[0]!;

  if (!companyName) throw new Error("Nome da empresa é obrigatório");

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: companyName, segment },
    });
    await tx.user.create({
      data: {
        id: identity.id,
        tenantId: tenant.id,
        role: "GESTOR",
        name: userName,
        email: identity.email,
      },
    });
  });

  redirect("/dashboard");
}
