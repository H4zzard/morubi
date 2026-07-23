// Cliente Supabase com service role — SÓ no servidor, para validar Bearer tokens
// vindos da extensão e para operações administrativas de auth (convites).
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
