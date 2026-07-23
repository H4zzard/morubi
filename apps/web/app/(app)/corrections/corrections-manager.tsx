"use client";

import { useState } from "react";
import type { CorrectionDTO } from "@morubi/api-client";
import { browserApi } from "@/lib/api-browser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CorrectionsManager({
  initialCorrections,
}: {
  initialCorrections: CorrectionDTO[];
}) {
  const [corrections, setCorrections] = useState(initialCorrections);
  const [promoting, setPromoting] = useState<string | null>(null);

  async function promote(id: string) {
    setPromoting(id);
    try {
      await browserApi().promoteCorrection(id);
      setCorrections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, scope: "TENANT" } : c)),
      );
    } finally {
      setPromoting(null);
    }
  }

  if (corrections.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-400">
          Nenhuma correção ainda. Quando um vendedor corrigir a IA na extensão, aparece aqui.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {corrections.map((c) => (
        <Card key={c.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-400">
              por <span className="text-ink-200">{c.userName}</span>
            </div>
            {c.scope === "TENANT" ? (
              <Badge tone="success">valendo p/ empresa</Badge>
            ) : (
              <Badge tone="warning">só o vendedor</Badge>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
              <div className="mb-1 text-xs font-medium text-danger">A IA dizia (errado)</div>
              <p className="text-sm text-ink-200">{c.original}</p>
            </div>
            <div className="rounded-md border border-brand-500/30 bg-brand-500/5 p-3">
              <div className="mb-1 text-xs font-medium text-brand-300">Correção</div>
              <p className="text-sm text-ink-200">{c.corrected}</p>
            </div>
          </div>
          {c.scope === "VENDEDOR" && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => promote(c.id)} disabled={promoting === c.id}>
                {promoting === c.id ? "Promovendo..." : "Promover p/ empresa"}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
