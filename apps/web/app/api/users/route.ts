import {
  InviteUserRequestSchema,
  type InviteResult,
  type UserListResponse,
} from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireUser, requireRole } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ok, fail, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const [users, invites] = await Promise.all([
      prisma.user.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.invite.findMany({
        where: { tenantId: user.tenantId, accepted: false },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const active: UserListResponse["users"] = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      pending: false,
    }));
    const pending: UserListResponse["users"] = invites
      .filter((i) => !users.some((u) => u.email === i.email))
      .map((i) => ({
        id: `invite:${i.id}`,
        name: i.name,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        pending: true,
      }));

    return ok<UserListResponse>({ users: [...active, ...pending] });
  });
}

function tempPassword(): string {
  // Senha temporária legível (sem depender de crypto do edge runtime).
  const part = () => Math.random().toString(36).slice(2, 6);
  return `mrb-${part()}-${part()}`;
}

export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const input = InviteUserRequestSchema.parse(await req.json());

    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("Já existe um usuário com esse e-mail", 409);

    const admin = createSupabaseAdmin();

    // O Invite é o que vincula o vendedor ao tenant no primeiro login, então
    // gravamos antes de qualquer caminho de criação do usuário no Auth.
    await prisma.invite.upsert({
      where: { tenantId_email: { tenantId: user.tenantId, email } },
      update: { name: input.name },
      create: { tenantId: user.tenantId, email, name: input.name, role: "VENDEDOR" },
    });

    // Caminho preferido: convite por e-mail, o vendedor define a própria senha.
    const origin = new URL(req.url).origin;
    const redirectTo = `${origin}/auth/callback?next=/update-password`;

    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { name: input.name },
    });

    if (!invited.error && invited.data?.user) {
      const result: InviteResult = {
        user: {
          id: invited.data.user.id,
          name: input.name,
          email,
          role: "VENDEDOR",
          createdAt: new Date().toISOString(),
          pending: true,
        },
        emailSent: true,
        tempPassword: null,
        fallbackReason: null,
      };
      return ok(result, 201);
    }

    // Fallback: sem SMTP configurado (ou limite de e-mail atingido), criamos o
    // usuário com senha temporária para o gestor repassar. Nunca trava o convite.
    const password = tempPassword();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });

    if (created.error && !created.error.message.includes("already registered")) {
      return fail(`Falha ao criar usuário: ${created.error.message}`, 500);
    }

    const result: InviteResult = {
      user: {
        id: created.data?.user?.id ?? `invite:${email}`,
        name: input.name,
        email,
        role: "VENDEDOR",
        createdAt: new Date().toISOString(),
        pending: true,
      },
      emailSent: false,
      tempPassword: created.error ? null : password,
      fallbackReason:
        invited.error?.message ?? "Não foi possível enviar o e-mail de convite.",
    };
    return ok(result, 201);
  });
}
