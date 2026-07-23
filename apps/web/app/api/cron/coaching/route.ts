import { prisma } from "@morubi/db";
import { generateCoachingForTenant } from "@/lib/coaching";
import { ok, fail, handle } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron diário (configurado em vercel.json). Roda todo dia e, para cada tenant,
 * gera o coaching apenas se HOJE estiver entre os dias escolhidos pelo gestor.
 *
 * Proteção: se CRON_SECRET estiver definido, exige
 * `Authorization: Bearer <CRON_SECRET>` (a Vercel envia esse header nos crons).
 * Sem o secret definido (dev local), a rota fica aberta para teste manual.
 */
export function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) return fail("Não autorizado", 401);
    }

    // Dia da semana no fuso de São Paulo (o negócio é brasileiro; usar UTC
    // faria o relatório cair no dia errado perto da meia-noite).
    const todaySP = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
    );
    const weekday = todaySP.getDay(); // 0=domingo ... 6=sábado

    const tenants = await prisma.tenant.findMany({
      where: { coachingDays: { has: weekday } },
      select: { id: true, name: true },
    });

    let generated = 0;
    for (const tenant of tenants) {
      try {
        const reports = await generateCoachingForTenant(tenant.id, "auto");
        generated += reports.length;
      } catch (err) {
        // Um tenant que falha não pode impedir os outros.
        console.error(`[cron/coaching] falha no tenant ${tenant.name}:`, err);
      }
    }

    return ok({ weekday, tenants: tenants.length, reports: generated });
  });
}
