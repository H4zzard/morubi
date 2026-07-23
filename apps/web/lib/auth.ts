// ============================================================================
// Contexto de autenticação/tenancy ÚNICO.
// Resolve o usuário Supabase a partir de: (a) header Bearer (extensão) OU
// (b) cookies de sessão (web). Depois carrega/sincroniza o User+Tenant do banco.
// Route handlers e páginas usam este módulo — não há um segundo mecanismo.
// ============================================================================
import { prisma, type Role } from "@morubi/db";
import { createSupabaseServer } from "./supabase/server";
import { createSupabaseAdmin } from "./supabase/admin";

export interface SupabaseIdentity {
  id: string;
  email: string;
}

/** Extrai a identidade Supabase de um Request (Bearer) ou dos cookies (web). */
export async function getIdentity(req?: Request): Promise<SupabaseIdentity | null> {
  const authHeader = req?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  }

  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

export type DbUser = Awaited<ReturnType<typeof loadDbUser>>;

async function loadDbUser(identity: SupabaseIdentity) {
  return prisma.user.findUnique({
    where: { id: identity.id },
    include: { tenant: true },
  });
}

export interface AuthContext {
  identity: SupabaseIdentity;
  user: NonNullable<DbUser>;
}

/**
 * Retorna o contexto completo (identity + User+Tenant do banco).
 * `null` se não autenticado; `{ identity, user: null }` se autenticado mas ainda
 * não vinculado a um tenant (precisa de onboarding).
 */
export async function getAuthContext(
  req?: Request,
): Promise<{ identity: SupabaseIdentity; user: NonNullable<DbUser> | null } | null> {
  const identity = await getIdentity(req);
  if (!identity) return null;

  // Sincroniza convites pendentes: se há um Invite para este e-mail e o usuário
  // ainda não tem User, cria o vínculo (aceita o convite no primeiro login).
  let user = await loadDbUser(identity);
  if (!user) {
    const invite = await prisma.invite.findFirst({
      where: { email: identity.email, accepted: false },
    });
    if (invite) {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            id: identity.id,
            tenantId: invite.tenantId,
            role: invite.role,
            name: invite.name,
            email: identity.email,
          },
          include: { tenant: true },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { accepted: true } });
        return created;
      });
    }
  }

  return { identity, user };
}

/** Garante um usuário autenticado e com tenant; lança AuthError caso contrário. */
export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(req?: Request): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new AuthError(401, "Não autenticado");
  if (!ctx.user) throw new AuthError(403, "Usuário sem empresa (onboarding pendente)");
  return { identity: ctx.identity, user: ctx.user };
}

export async function requireRole(role: Role, req?: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (ctx.user.role !== role) throw new AuthError(403, `Requer papel ${role}`);
  return ctx;
}
