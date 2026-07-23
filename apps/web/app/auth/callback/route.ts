import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Destino dos links de e-mail do Supabase (convite de vendedor e recuperação de
 * senha). Troca o `code` por uma sessão e manda o usuário para `next`
 * (normalmente /update-password, onde ele define a própria senha).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/update-password";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link-invalido", url.origin));
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Link expirado ou já usado: manda pedir outro.
    return NextResponse.redirect(new URL("/forgot-password?error=link-expirado", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
