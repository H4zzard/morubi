// Config da extensão. Vars expostas pelo WXT/Vite precisam do prefixo WXT_.
// Defina em apps/extension/.env (ver .env.example).
export const CONFIG = {
  supabaseUrl: import.meta.env.WXT_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.WXT_SUPABASE_ANON_KEY as string,
  apiBaseUrl: (import.meta.env.WXT_API_BASE_URL as string) || "http://localhost:3000",
};
