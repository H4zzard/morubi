"use client";

import { useState } from "react";
import type { KnowledgeItemDTO } from "@morubi/api-client";
import { browserApi } from "@/lib/api-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

const ACCEPTED = ".pdf,.docx,.txt,.md";

export function KnowledgeManager({ initialItems }: { initialItems: KnowledgeItemDTO[] }) {
  const [items, setItems] = useState(initialItems);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const created = await browserApi().uploadKnowledgeFile(file);
        setItems((prev) => [created, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card className="h-fit">
          <h2 className="mb-3 text-base font-semibold text-ink-100">Subir arquivo</h2>
          <p className="mb-4 text-sm text-ink-400">
            PDF, Word (.docx), TXT ou Markdown. Preços, contratos, manuais, FAQ, políticas —
            qualquer documento que o time use para vender.
          </p>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-brand-500 bg-brand-500/5" : "border-graphite-600 hover:border-graphite-500"
            }`}
          >
            <input
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="text-sm text-ink-200">
              {uploading ? "Enviando e indexando..." : "Arraste um arquivo ou clique para escolher"}
            </span>
            <span className="mt-1 text-xs text-ink-500">PDF · DOCX · TXT · MD</span>
          </label>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </Card>

        <Card>
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="w-full text-left text-sm text-ink-400 hover:text-ink-100"
          >
            {manualOpen ? "▾" : "▸"} Ou escreva manualmente
          </button>
          {manualOpen && (
            <ManualEntryForm
              onCreated={(item) => {
                setItems((prev) => [item, ...prev]);
                setManualOpen(false);
              }}
            />
          )}
        </Card>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-400">Nenhum item ainda. Comece subindo um arquivo ao lado.</p>
          </Card>
        ) : (
          items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              onUpdated={(updated) =>
                setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
              }
              onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KnowledgeCard({
  item,
  onUpdated,
  onDeleted,
}: {
  item: KnowledgeItemDTO;
  onUpdated: (item: KnowledgeItemDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await browserApi().updateKnowledge(item.id, { title, content });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await browserApi().deleteKnowledge(item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card className="space-y-3">
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Conteúdo</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy || !title.trim() || !content.trim()}>
            {busy ? "Salvando e reindexando..." : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setTitle(item.title);
              setContent(item.content);
              setError(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="group">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-ink-100">{item.title}</h3>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-graphite-600 px-2 py-1 text-xs text-ink-300 hover:bg-graphite-800 hover:text-ink-100"
          >
            Editar
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger hover:bg-danger/20 disabled:opacity-50"
              >
                {busy ? "Excluindo..." : "Confirmar"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-graphite-600 px-2 py-1 text-xs text-ink-400 hover:bg-graphite-800"
              >
                Não
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded border border-graphite-600 px-2 py-1 text-xs text-ink-400 hover:border-danger/40 hover:text-danger"
            >
              Excluir
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-ink-300">
        {item.content}
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function ManualEntryForm({ onCreated }: { onCreated: (item: KnowledgeItemDTO) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const created = await browserApi().createKnowledge({ title, content });
      onCreated(created);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Título</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="content">Conteúdo</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          required
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Salvando e indexando..." : "Adicionar à base"}
      </Button>
    </form>
  );
}
