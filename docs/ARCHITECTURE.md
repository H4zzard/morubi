# Arquitetura do Morubi (V1)

> Documento vivo. Gerado na Fase 0 e atualizado a cada fase.

## Visão geral

Morubi é um **gerente comercial de IA**. Duas peças, uma base compartilhada:

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Extensão Chrome (WXT)    │        │  SaaS Web (Next.js 15)   │
│  Side Panel do vendedor   │        │  Gestor + Vendedor        │
│  Adaptador WhatsApp Web    │        │  Dashboards, base, times  │
└─────────────┬────────────┘        └────────────┬─────────────┘
              │  @morubi/api-client (HTTP tipado) │
              └────────────────┬──────────────────┘
                               ▼
                 apps/web/app/api  (Route Handlers)
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                        ▼
  @morubi/db (Prisma)   @morubi/ai (LLM/RAG)   Supabase Auth
  Postgres + pgvector   Anthropic + Gemini      (sessão única)
```

## Princípios não-negociáveis

1. **Um schema de dados** — `packages/db` (Prisma). Todo tipo deriva daqui ou de Zod ao lado.
2. **Um cliente de API tipado** — `packages/api-client`. Web e extensão nunca fazem `fetch` cru.
3. **Um módulo de orquestração de IA** — `packages/ai`. Nenhuma rota chama o SDK da Anthropic/Gemini direto.
4. **Um adaptador de canal por vez** — `apps/extension/.../adapters`, atrás da interface `ChannelAdapter`.
5. **Uma paleta/design tokens** — `packages/ui-tokens`, consumida por um preset Tailwind compartilhado.
6. **Um provedor de auth** — Supabase Auth, mesma sessão em web e extensão.
7. **Uma API só** — dentro de `apps/web` (Route Handlers). Sem microsserviço separado.

## Pacotes

| Pacote | Responsabilidade |
|---|---|
| `@morubi/config` | tsconfig base, preset Tailwind, ESLint flat |
| `@morubi/ui-tokens` | cores (graphite + verde), radii, tipografia, helpers de cor |
| `@morubi/db` | schema Prisma, client singleton, helpers de embedding/RAG (único SQL cru) |
| `@morubi/api-client` | contratos Zod (request/response) + cliente HTTP tipado |
| `@morubi/ai` | prompts, RAG, `generateObject` (análise estruturada), embeddings, transcrição |

## Apps

| App | Stack | Papel |
|---|---|---|
| `apps/web` | Next.js 15 App Router + Tailwind | SaaS + API (Route Handlers) |
| `apps/extension` | WXT + React + Tailwind | Side Panel do vendedor, adaptador WhatsApp Web |

## Fluxo do copiloto (endpoint central `/api/conversations/:id/analyze`)

1. Extensão observa mensagens no WhatsApp Web (adaptador) → envia lote para `/messages`.
2. Extensão chama `/analyze`.
3. Servidor: busca últimas N mensagens → embedding da consulta → `matchKnowledge` (pgvector) → injeta correções (vendedor + tenant) com prioridade → 1 chamada `generateObject` ao Claude → persiste `Suggestion`.
4. Retorna `{ stage, probability, nextAction, objection?, objectionReply? }` — uma única chamada estruturada.

## Multi-tenancy

- Todo dado carrega `tenantId`. Vendedor vê só o próprio; gestor vê o tenant inteiro.
- `User.id` == id do usuário no Supabase Auth (sem tabela de credenciais própria).
- Tenant criado no primeiro login de um gestor (onboarding).

## Decisões de infra

- Deploy web/API: Vercel. Banco/Auth/Vetores: Supabase. Erros: Sentry.
- Extensão V1: build local carregado sem compactação no Chrome.

Ver `DECISIONS.md` para decisões pontuais tomadas durante a execução.
