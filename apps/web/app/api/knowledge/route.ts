import { CreateKnowledgeRequestSchema, type KnowledgeListResponse } from "@morubi/api-client";
import { prisma } from "@morubi/db";
import { requireUser, requireRole } from "@/lib/auth";
import { createKnowledgeItem } from "@/lib/knowledge";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 30;

export const OPTIONS = () => corsPreflight();

export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const items = await prisma.knowledgeItem.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
    });
    const body: KnowledgeListResponse = {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        content: i.content,
        createdAt: i.createdAt.toISOString(),
      })),
    };
    return ok(body);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);
    const input = CreateKnowledgeRequestSchema.parse(await req.json());
    const dto = await createKnowledgeItem(user.tenantId, input.title, input.content);
    return ok(dto, 201);
  });
}
