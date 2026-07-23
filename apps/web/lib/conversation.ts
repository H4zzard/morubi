// Carrega uma conversa garantindo que pertence ao usuário (ou ao tenant, p/ gestor).
import { prisma } from "@morubi/db";
import { AuthError, type AuthContext } from "./auth";

export async function requireOwnedConversation(id: string, ctx: AuthContext) {
  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) throw new AuthError(403, "Conversa não encontrada");

  const isOwner = conversation.userId === ctx.user.id;
  const isTenantGestor =
    ctx.user.role === "GESTOR" && conversation.tenantId === ctx.user.tenantId;
  if (!isOwner && !isTenantGestor) throw new AuthError(403, "Sem acesso a esta conversa");

  return conversation;
}
