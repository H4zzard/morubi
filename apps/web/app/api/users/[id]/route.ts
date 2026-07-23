import { prisma } from "@morubi/db";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, fail, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/**
 * Remove um vendedor OU cancela um convite pendente.
 * - `invite:<id>` -> apaga só o Invite (nenhum dado de conversa envolvido).
 * - `<userId>`   -> revoga o acesso (apaga o usuário no Supabase Auth) e remove
 *   o User do banco. As conversas dele são removidas em cascata; a memória por
 *   contato (ContactMemory) é por tenant, então sobrevive.
 * Só gestor, só do próprio tenant. Não permite remover a si mesmo.
 */
export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const { id } = await params;

    // Cancelar convite pendente
    if (id.startsWith("invite:")) {
      const inviteId = id.slice("invite:".length);
      const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.tenantId !== user.tenantId) {
        return fail("Convite não encontrado", 404);
      }
      await prisma.invite.delete({ where: { id: inviteId } });
      return ok({ ok: true });
    }

    // Remover vendedor de verdade
    if (id === user.id) return fail("Você não pode remover a si mesmo", 400);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.tenantId !== user.tenantId) {
      return fail("Vendedor não encontrado", 404);
    }

    // Revoga o acesso no Supabase Auth (best-effort: mesmo que falhe, removemos
    // do banco para ele sumir do tenant).
    try {
      await createSupabaseAdmin().auth.admin.deleteUser(id);
    } catch (err) {
      console.error("[users] falha ao remover usuário no Supabase Auth:", err);
    }

    // Limpa também um eventual Invite pendente com o mesmo e-mail.
    await prisma.$transaction([
      prisma.invite.deleteMany({ where: { tenantId: user.tenantId, email: target.email } }),
      prisma.user.delete({ where: { id } }),
    ]);

    return ok({ ok: true });
  });
}
