"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`;
    const { error } = await createSupabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    // Sempre confirmamos, mesmo se o e-mail não existir (não vaza quem tem conta).
    setSent(true);
  }

  return (
    <Card>
      {sent ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-200">
            Se existir uma conta com <strong className="text-ink-100">{email}</strong>, enviamos um
            link para definir uma nova senha.
          </p>
          <p className="text-xs text-ink-500">
            O link vale por pouco tempo. Não achou? Confira o spam ou peça outro.
          </p>
          <Link href="/login" className="block">
            <Button variant="outline" className="w-full">
              Voltar para o login
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Seu e-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-400">
            Lembrou?{" "}
            <Link href="/login" className="text-brand-400 hover:underline">
              Entrar
            </Link>
          </p>
        </>
      )}
    </Card>
  );
}
