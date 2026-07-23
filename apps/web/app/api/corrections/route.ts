import {
  CreateCorrectionRequestSchema,
  type CorrectionListResponse,
} from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireUser } from "@/lib/auth";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

/** Lista correções: gestor vê o tenant; vendedor vê as próprias + as promovidas. */
export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const where =
      user.role === "GESTOR"
        ? { tenantId: user.tenantId }
        : { tenantId: user.tenantId, OR: [{ scope: "TENANT" as const }, { userId: user.id }] };

    const corrections = await prisma.correction.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const body: CorrectionListResponse = {
      corrections: corrections.map((c) => ({
        id: c.id,
        scope: c.scope,
        original: c.original,
        corrected: c.corrected,
        userName: c.user.name,
        createdAt: c.createdAt.toISOString(),
      })),
    };
    return ok(body);
  });
}

/** Registra correção do vendedor (memória evolutiva) com scope VENDEDOR. */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const input = CreateCorrectionRequestSchema.parse(await req.json());

    await prisma.correction.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        scope: "VENDEDOR",
        original: input.original,
        corrected: input.corrected,
      },
    });

    return ok({ ok: true }, 201);
  });
}
