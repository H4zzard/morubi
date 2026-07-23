import type { SessionResponse } from "@morubi/api-client";
import { requireUser } from "@/lib/auth";
import { ok, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export const OPTIONS = () => corsPreflight();

export function GET(req: Request) {
  return handle(async () => {
    const { user } = await requireUser(req);
    const body: SessionResponse = {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: user.tenant.id, name: user.tenant.name, segment: user.tenant.segment },
    };
    return ok(body);
  });
}
