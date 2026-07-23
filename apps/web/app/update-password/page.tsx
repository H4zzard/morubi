"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@morubi/ui-tokens/logo";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

/**
 * Define uma nova senha. Serve para três fluxos:
 * 1. Vendedor convidado que chegou pelo link do e-mail (define a 1ª senha).
 * 2. Quem clicou em "esqueci minha senha".
 * 3. Usuário logado que quer trocar a senha.
 * Em todos, o usuário já tem sessão (o link do e-mail passa pelo /auth/callback).
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        setHasSession(!!data.session);
        setChecking(false);
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    setSaving(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    // Deixa a confirmação visível antes de seguir.
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark className="mx-auto mb-3 h-12 w-12 text-brand-500" />
          <h1 className="text-xl font-semibold text-ink-100">Definir senha</h1>
          <p className="mt-1 text-sm text-ink-400">Escolha a senha que você vai usar para entrar.</p>
        </div>

        <Card>
          {checking ? (
            <p className="text-sm text-ink-400">Carregando...</p>
          ) : !hasSession ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-300">
                Seu link expirou ou você abriu esta página direto. Peça um novo link para definir a
                senha.
              </p>
              <Link href="/forgot-password">
                <Button className="w-full">Pedir novo link</Button>
              </Link>
            </div>
          ) : done ? (
            <p className="text-sm text-brand-300">Senha alterada. Redirecionando...</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Repita a senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando..." : "Salvar senha"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
