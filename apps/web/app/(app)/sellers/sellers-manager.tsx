"use client";

import { useState } from "react";
import type { UserDTO } from "@morubi/api-client";
import { browserApi } from "@/lib/api-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SellersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserDTO[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    email: string;
    emailSent: boolean;
    pass: string | null;
    reason: string | null;
  } | null>(null);

  async function removeUser(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      await browserApi().removeUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover");
    } finally {
      setRemovingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await browserApi().inviteUser({ name, email });
      setUsers((prev) => [...prev, result.user]);
      setLastInvite({
        email: result.user.email,
        emailSent: result.emailSent,
        pass: result.tempPassword,
        reason: result.fallbackReason,
      });
      setName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao convidar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <form onSubmit={onSubmit} className="space-y-4">
          <h2 className="text-base font-semibold text-ink-100">Convidar vendedor</h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Convidando..." : "Convidar"}
          </Button>
        </form>

        {lastInvite?.emailSent && (
          <div className="mt-4 rounded-md border border-brand-500/40 bg-brand-500/10 p-3 text-sm">
            <p className="font-medium text-brand-300">Convite enviado ✓</p>
            <p className="mt-1 text-ink-200">
              Mandamos um e-mail para <span className="font-mono text-xs">{lastInvite.email}</span>.
              Ele clica no link e define a própria senha.
            </p>
          </div>
        )}

        {lastInvite && !lastInvite.emailSent && lastInvite.pass && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium text-warning">Repasse estas credenciais</p>
            <p className="mt-1 text-ink-200">
              Não foi possível enviar o e-mail de convite, então criamos uma senha temporária.
              Passe para o vendedor (ele troca depois em "Trocar senha"):
            </p>
            <p className="mt-2 font-mono text-xs text-ink-100">
              {lastInvite.email}
              <br />
              {lastInvite.pass}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Para o convite sair por e-mail, configure o SMTP no Supabase (veja docs/DEPLOY.md).
            </p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <Card key={u.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-100">{u.name}</div>
                <div className="truncate text-sm text-ink-400">{u.email}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={u.role === "GESTOR" ? "success" : "default"}>{u.role}</Badge>
                {u.pending && <Badge tone="warning">pendente</Badge>}
                {!isSelf &&
                  (confirmId === u.id ? (
                    <>
                      <button
                        onClick={() => removeUser(u.id)}
                        disabled={removingId === u.id}
                        className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger hover:bg-danger/20 disabled:opacity-50"
                      >
                        {removingId === u.id
                          ? "Removendo..."
                          : u.pending
                            ? "Cancelar convite"
                            : "Remover"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded border border-graphite-600 px-2 py-1 text-xs text-ink-400 hover:bg-graphite-800"
                      >
                        Não
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(u.id)}
                      className="rounded border border-graphite-600 px-2 py-1 text-xs text-ink-400 hover:border-danger/40 hover:text-danger"
                    >
                      {u.pending ? "Cancelar" : "Remover"}
                    </button>
                  ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
