# Morubi — Gerente comercial de IA (V1)

Copiloto de vendas em tempo real. Duas peças sobre uma base compartilhada:

- **SaaS web** (`apps/web`) — gestor cria a empresa, sobe a base de conhecimento, convida vendedores e vê dashboards.
- **Extensão Chrome** (`apps/extension`) — Side Panel que lê a conversa (WhatsApp Web ou Kentro/AtenderBem) e sugere estágio, probabilidade, resposta e contorno de objeção, ancorado na base da empresa.

> Vende-se **resultado** (conversão, controle). Os termos técnicos abaixo são só para quem constrói.

## Stack

pnpm + Turborepo · Next.js 15 (web + API) · WXT + React (extensão) · Supabase (Postgres + Auth + pgvector) · Prisma · Anthropic Claude (via Vercel AI SDK) · Google Gemini (embeddings + transcrição de áudio) · Zod · Tailwind.

## Estrutura

```
apps/web         # SaaS + API (Route Handlers)
apps/extension   # Side Panel + adaptadores de canal (WhatsApp Web, Kentro/AtenderBem)
packages/db      # schema Prisma + client + helpers de pgvector (único SQL cru)
packages/api-client  # contratos Zod + cliente HTTP tipado (web E extensão)
packages/ai      # RAG + generateObject + embeddings + transcrição
packages/ui-tokens   # cores/tipografia (fonte única de design)
packages/config  # tsconfig, tailwind preset, eslint compartilhados
```

Ver `docs/ARCHITECTURE.md` e `docs/DECISIONS.md`.

## Pré-requisitos

- Node 20+, pnpm 9+
- Um projeto **Supabase** (Postgres + Auth)
- Chaves **Anthropic** e **Google Gemini**

## Setup

### 1. Instalar

```bash
pnpm install
```

### 2. Configurar ambiente

```bash
cp .env.example apps/web/.env.local
cp apps/extension/.env.example apps/extension/.env
```

Preencha `apps/web/.env.local` com as credenciais do Supabase e as chaves de LLM
(ver `.env.example`). Preencha `apps/extension/.env` com `WXT_SUPABASE_URL`,
`WXT_SUPABASE_ANON_KEY` e `WXT_API_BASE_URL` (mesmo projeto Supabase do web).

No painel do Supabase, em **Authentication → Providers → Email**, para facilitar a
demo desative "Confirm email" (assim o cadastro do gestor já cria sessão).

### 3. Banco de dados

```bash
pnpm db:generate     # gera o Prisma Client
pnpm db:migrate      # aplica a migration inicial (cria tabelas + pgvector + RAG)
pnpm db:seed         # (opcional) tenant + base de conhecimento de exemplo
```

> A migration inicial já cria a extensão `pgvector`, a coluna `embedding` e a
> função `match_knowledge` usada no RAG.

### 4. Rodar o web

```bash
pnpm --filter @morubi/web dev
# http://localhost:3000
```

### 5. Rodar/instalar a extensão

```bash
pnpm --filter @morubi/extension dev      # abre o Chrome com a extensão em hot-reload
# ou build para carregar manualmente:
pnpm --filter @morubi/extension build
```

Para carregar manualmente: Chrome → `chrome://extensions` → ative o **Modo do
desenvolvedor** → **Carregar sem compactação** → selecione
`apps/extension/.output/chrome-mv3`.

## Como demonstrar (roteiro da V1)

1. Acesse `http://localhost:3000`, **crie a conta de gestor** e a empresa (onboarding).
2. Em **Base de conhecimento**, adicione 3–5 itens (preços, garantia, diferenciais).
3. Em **Vendedores**, convide um vendedor — anote as **credenciais temporárias** exibidas.
4. Abra o **WhatsApp Web**, clique no ícone do Morubi para abrir o Side Panel e **logue como o vendedor**.
5. Abra uma conversa real: em segundos aparecem **estágio, probabilidade, sugestão** e, se houver, **contorno de objeção** citando a base.
6. Clique em **Corrigir** numa sugestão errada, salve — a próxima análise **não repete o erro**.
   No web, em **Curadoria**, o gestor pode **promover** a correção para toda a empresa.
7. Marque **Ganha/Perdida** no Side Panel e veja o número no **Dashboard** do gestor.

## Scripts úteis

```bash
pnpm build       # build de tudo (turbo)
pnpm typecheck   # typecheck de todos os pacotes/apps
pnpm lint        # lint
```

## Limitações conhecidas (V1)

- Os adaptadores (WhatsApp Web em `whatsapp-web.ts`, Kentro/AtenderBem em `kentro.ts`,
  ambos em `apps/extension/entrypoints/content/adapters/`) dependem do DOM atual de cada
  plataforma; se o layout mudar, é o único arquivo a ajustar por canal.
- Convite de vendedor entrega **senha temporária** na tela (sem SMTP) para a demo.
- Captura de áudio é best-effort (depende de a mídia estar carregada); não testada ao
  vivo com uma mensagem de voz real do Kentro.
- No Kentro, avisos de sistema (ex.: "atendimento bloqueado") e respostas de bot
  automatizado não são lidos como mensagens — só o que vem de `.message-in`/`.message-out`.
