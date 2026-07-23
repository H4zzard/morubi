// API client configurado para o browser (web). Usa o token da sessão Supabase.
// Mesma biblioteca (@morubi/api-client) que a extensão usa — sem fetch cru.
import { createApiClient } from "@morubi/api-client";
import { createSupabaseBrowser } from "./supabase/client";

let cached: ReturnType<typeof createApiClient> | null = null;

export function browserApi() {
  if (cached) return cached;
  const supabase = createSupabaseBrowser();
  cached = createApiClient({
    baseUrl: "", // mesma origem
    getToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
  });
  return cached;
}
