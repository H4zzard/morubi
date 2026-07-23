import { useState } from "react";
import { LogoMark } from "@morubi/ui-tokens/logo";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <LogoMark className="mx-auto mb-3 h-10 w-10 text-brand-500" />
        <h1 className="text-lg font-semibold">Morubi</h1>
        <p className="text-xs text-ink-400">Entre com o login da sua empresa</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-graphite-950 hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
