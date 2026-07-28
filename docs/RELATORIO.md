# Relatório do Morubi — estado atual

> Snapshot de tudo que existe hoje no produto. Gerado a partir do código, não de memória.

---

## 1. O que é

O **Morubi** é um **gerente comercial de IA** que acompanha as vendas em tempo real. Ele não é
chatbot nem responde o cliente: **assiste o vendedor** durante o atendimento e sugere o próximo
passo. São duas peças sobre uma base compartilhada:

- **SaaS web** — o gestor cria a empresa, sobe a base de conhecimento, convida vendedores, vê
  dashboards e recebe o coaching do time.
- **Extensão de navegador** — um painel lateral que lê a conversa aberta (WhatsApp Web ou o CRM
  Kentro/AtenderBem) e mostra, em segundos: estágio da venda, probabilidade de fechamento,
  sugestão de resposta e contorno de objeção, tudo ancorado na base da empresa.

Dois papéis: **Gestor** (compra, configura, vê tudo do tenant) e **Vendedor** (usa a extensão, vê
só os próprios dados). O mesmo login vale para o web e a extensão.

---

## 2. Stack e arquitetura

Monorepo **pnpm + Turborepo**. Cada responsabilidade mora num lugar só (sem duplicação):

| Camada | Tecnologia |
|---|---|
| Web + API | Next.js 15 (App Router) + Tailwind |
| Extensão | WXT + React + Tailwind |
| Banco / Auth / Vetores | Supabase (Postgres + Auth + pgvector) |
| ORM | Prisma |
| Geração de texto (IA) | Anthropic Claude via camada própria (API, CLI ou mock) |
| Embeddings + transcrição | Google Gemini |
| Observabilidade | Sentry (inerte sem DSN) |
| Deploy | VM Ubuntu na DigitalOcean (web/API) + Chrome Web Store (extensão) |

**Pacotes compartilhados:**
- `@morubi/db` — schema Prisma, client, helpers de pgvector e memória (único lugar com SQL cru)
- `@morubi/api-client` — contratos Zod + cliente HTTP tipado (usado por web E extensão)
- `@morubi/ai` — orquestração de IA (análise, chat, coaching, insight, embeddings, transcrição)
- `@morubi/ui-tokens` — cores, tipografia e a logo (fonte única de identidade visual)
- `@morubi/config` — tsconfig, preset Tailwind e ESLint compartilhados

---

## 3. Funcionalidades — SaaS web

Páginas: `login`, `signup`, `forgot-password`, `update-password`, `onboarding`, `dashboard`,
`coaching`, `knowledge`, `sellers`, `corrections`, `privacy`.

- **Autenticação e multi-tenancy** — login único (Supabase), criação da empresa no primeiro acesso
  do gestor, papéis Gestor/Vendedor, proteção de rotas por papel.
- **Convite de vendedores** — por e-mail (o vendedor define a própria senha pelo link). Se o SMTP
  não estiver configurado, cai automaticamente numa **senha temporária** que o gestor repassa.
- **Recuperação e troca de senha** — "esqueci minha senha" (por e-mail) e troca voluntária (não
  depende de e-mail).
- **Base de conhecimento** — criação manual (título+conteúdo) **e upload de arquivo** (PDF, DOCX,
  TXT, MD, com extração de texto). Editar e excluir itens, com reindexação automática do embedding.
- **Gestão de vendedores** — convidar, remover (revoga o acesso) e cancelar convites pendentes.
- **Dashboard do gestor** — conversão com tendência e mini-gráfico, receita projetada, leads
  quentes, vendas em risco, ranking de vendedores, erros mais comuns do time, leads em risco,
  equipe ativa e um **insight do Morubi** gerado por IA.
- **Curadoria de correções** — o gestor vê as correções feitas pelos vendedores e pode **promover**
  uma correção para valer em toda a empresa.
- **Coaching do time** *(novo)* — relatório por vendedor no estilo de um coordenador comercial:
  o que está acertando, o que precisa melhorar e **quais leads precisam de follow up** (com o
  telefone de cada um). Pode ser gerado na hora ("gerar agora") ou automaticamente nos **dias da
  semana escolhidos** pelo gestor (cron na Vercel).

---

## 4. Funcionalidades — extensão (copiloto)

Painel lateral (Side Panel) com duas abas:

- **Copiloto** — timeline da conversa: última fala do cliente → objeção detectada → sugestão do
  Morubi (com o porquê) → pontos de atenção. Mostra estágio da venda e a **chance de fechamento**.
  No rodapé, registra o desfecho (**ganha/perdida**) com valor opcional do negócio.
- **Falar com o Morubi** — chat livre para o vendedor tirar dúvidas e **corrigir a IA**. Quando a
  mensagem é uma correção ("não é 7 dias, é 5"), o Morubi detecta, grava e passa a acertar dali pra
  frente (aparece "correção salva na memória").

Detalhes:
- **Memória evolutiva por contato** — o histórico é por lead (não por conversa), então ao reabrir
  uma conversa o painel mostra *"retomando de onde parou · N análises deste contato"* e a IA
  continua de onde estava em vez de reiniciar.
- **Áudio** — mensagens de voz são capturadas, transcritas (Gemini) e entram na análise.
- **Login único** — a extensão usa a mesma sessão Supabase do web.

---

## 5. Canais suportados (adaptadores)

Arquitetura de adaptador único por canal, atrás de uma interface `ChannelAdapter`. Adicionar um
canal novo é criar um arquivo e registrá-lo — o resto do sistema não sabe de onde a mensagem veio.

- **WhatsApp Web** (`whatsapp-web.ts`)
- **Kentro / AtenderBem** (`kentro.ts`) — CRM de fila compartilhada. Identifica o contato pelo
  telefone (via wamid) ou pelo cabeçalho da conversa, distingue vendedor de cliente pelo prefixo
  do nome, e lê mensagens de voz.

O `background.ts` injeta o content script nas abas já abertas (não precisa de F5 após instalar).

---

## 6. Motor de IA (`@morubi/ai`)

- **Uma única chamada estruturada** por análise devolve estágio + probabilidade + próxima ação +
  objeção + erros do vendedor + memória atualizada.
- **RAG** — busca na base de conhecimento por similaridade (pgvector) + correções ativas (com
  prioridade) montam o contexto.
- **Camada de provedor de IA** (`AI_PROVIDER`): `api` (Anthropic, padrão e único válido em
  produção), `cli` (usa a assinatura do Claude Code na máquina, para dev sem gastar crédito de API)
  e `mock` (respostas fixas, sem rede).
- **Sem travessão** — garantia determinística que remove travessões de toda saída da IA.
- **Erros traduzidos** — falhas de provedor (sem crédito, chave inválida, sobrecarga) viram
  mensagem clara em vez de "Erro interno".

---

## 7. Modelo de dados (Prisma)

`Tenant`, `User`, `Invite`, `KnowledgeItem` (com embedding pgvector), `Conversation`, `Message`,
`Suggestion` (com erros detectados), `Correction`, `ContactMemory` (memória por contato),
`CopilotChatMessage` (chat do copiloto) e `CoachingReport`. Migrations aplicadas: `init`,
`memory_and_chat`, `coaching`.

---

## 8. Estabilidade e produção

- **Rate limiting** nas rotas de IA (por usuário) para conter loops e proteger o crédito.
- **Timeout de LLM** para falhar limpo em vez de pendurar.
- **Pool de conexões** do Prisma ampliado (evita o erro de esgotamento sob carga).
- **Prisma com binário da Vercel** (`rhel-openssl-3.0.x`) — deploy não quebra.
- **Observabilidade** via Sentry, inerte sem DSN.
- Guia completo em `docs/DEPLOY.md` (Supabase, Vercel, SMTP, Chrome Web Store).

---

## 9. O que já funciona x o que falta

**Funciona hoje (validado):**
- Fluxo completo do copiloto no WhatsApp Web e no Kentro, incluindo áudio.
- Memória evolutiva, chat/correção, dashboard, coaching, CRUD completo, senhas.
- Rodando local com a assinatura do Claude (`AI_PROVIDER=cli`).

**Depende de ação sua (documentado em `docs/DEPLOY.md`):**
- **Deploy numa VM Ubuntu na DigitalOcean** (2 vCPU / 4 GB recomendado; sem limite de tempo de
  função, então as chamadas de IA de 20-40s rodam sem cortar).
- **SMTP no Supabase** para o convite/recuperação saírem por e-mail de verdade.
- **Publicação da extensão** na Chrome Web Store.

**Fora do escopo atual (por decisão):**
- Integração com ERP, billing/checkout, SSO/SAML, app mobile, envio automático de mensagem.

---

## 10. Observações honestas

- O provedor `cli` (assinatura) e `mock` são **só para dev**; produção usa `api` com a chave da
  Anthropic. O código bloqueia os outros em produção de propósito.
- O adaptador do Kentro foi ajustado várias vezes contra o DOM real; se o layout do Kentro mudar,
  é o único arquivo a mexer.
- Não há suíte de testes automatizados ainda (cobre-se o caminho crítico manualmente).
