# Prompt de Execução — Construir a V1 (MVP demonstrável) do Morubi

> **Como usar este arquivo:** cole o conteúdo abaixo inteiro como prompt inicial para uma sessão de agente de engenharia (Claude Code ou similar) em um repositório novo e vazio. O documento é autocontido — não depende de nenhum outro arquivo para fazer sentido.

---

## 0. Seu papel

Você é um **engenheiro de software sênior full-stack**, responsável por construir sozinho a primeira versão executável do **Morubi** — um produto real, não um protótipo descartável. O código que você escrever hoje será mantido e expandido por outros desenvolvedores depois de você. Otimize para **clareza, previsibilidade e ausência de duplicação** acima de qualquer atalho de curto prazo.

Regras de trabalho:
1. Este documento é a **fonte da verdade**. Onde houver ambiguidade, resolva a favor da opção mais simples que ainda funcione — não pergunte, decida e documente a decisão em `docs/DECISIONS.md`.
2. Trabalhe em **fases sequenciais** (seção 10). Não comece a fase N+1 sem a fase N funcionando de ponta a ponta.
3. Nunca duplique uma mesma responsabilidade em dois lugares (dois clientes HTTP, dois schemas de dados, duas paletas de cor, dois jeitos de chamar a LLM). Se perceber que está prestes a duplicar algo, pare e extraia para um pacote compartilhado.
4. Ao final de cada fase, rode build + typecheck e deixe o repositório em estado funcional antes de seguir.

---

## 1. O produto (contexto condensado)

**Morubi** é um **gerente comercial de IA**. Não é chatbot, não é CRM, não responde clientes no lugar do vendedor. Ele é composto por duas peças:

1. **Extensão de navegador (Chrome, Side Panel)** — abre um painel ao lado da aba onde o vendedor está atendendo, lê a conversa ativa (V1: **WhatsApp Web**), entende o contexto, calcula a **probabilidade de fechamento**, sugere **o que responder** e, havendo objeção, sugere **como contornar** com base na empresa. Nunca envia mensagem sozinha — só assiste.
2. **SaaS de backoffice (web)** — onde o **gestor** cria a empresa, alimenta a **base de conhecimento**, convida **vendedores** e vê **dashboards** de conversão (individual e macro). O mesmo login autentica a extensão.

Dois papéis: **Gestor** (compra, configura, vê tudo do tenant) e **Vendedor** (usa a extensão, vê só os próprios dados).

Diferencial central: **memória evolutiva**. A IA usa a base de conhecimento da empresa via RAG; quando erra ou "alucina", o vendedor corrige no chat, a correção é persistida e passa a valer dali pra frente — primeiro só para aquele vendedor, e o gestor pode "promover" a correção para toda a empresa.

Posicionamento: vende-se **resultado** (conversão, controle, previsibilidade), nunca "IA/GPT/LLM" — isso vale para copy voltada a usuário final. **Neste documento e no código**, os termos técnicos são usados livremente.

---

## 2. Objetivo desta entrega

Construir uma **V1 executável e demonstrável** — algo que rode de ponta a ponta em uma demo real: gestor cria conta, sobe base de conhecimento, convida um vendedor; vendedor loga na extensão, abre uma conversa real de WhatsApp Web, e recebe em tempo real: estágio da venda, probabilidade de fechamento, sugestão de resposta e contorno de objeção — tudo ancorado na base de conhecimento daquela empresa. Ao final, o desfecho é registrado e aparece no dashboard do gestor.

**Isto não é o produto completo do PRD.** É o menor recorte que já prova a tese central ("um gerente comercial de IA acompanhando a venda em tempo real") de forma real, não simulada.

---

## 3. Escopo desta V1

### Dentro
- Autenticação com dois papéis (Gestor, Vendedor), multi-tenant.
- SaaS web: onboarding da empresa, base de conhecimento (upload/edição de texto), convite de vendedores, dashboard (macro + individual).
- Extensão Chrome com Side Panel, **adaptador único: WhatsApp Web**.
- Copiloto em tempo real: estágio da venda, probabilidade de fechamento, sugestão de resposta, detecção/contorno de objeção — uma única chamada estruturada à LLM, ancorada em RAG.
- Transcrição de áudio do WhatsApp e uso no raciocínio.
- Memória evolutiva: correção humana em linha + promoção pelo gestor.
- Registro de desfecho (ganha/perdida) alimentando o dashboard.

### Fora (não construir agora — deixe a arquitetura pronta para receber depois, mas não implemente)
- Integração com ERP.
- Qualquer adaptador além de WhatsApp Web (CRMs ficam para depois — a arquitetura de adaptadores já suporta, só não implemente outro agora).
- Cobrança/checkout, planos, billing.
- SSO/SAML, múltiplos navegadores, app mobile.
- Envio automático de mensagem pelo canal.
- Mais de um provedor de LLM para geração de texto (só Anthropic — ver §5).
- Suite de testes exaustiva — cubra só o caminho crítico (§12).

Se ficar em dúvida se algo é V1 ou não: **não é**. Escopo pequeno e funcionando bate escopo grande e quebrado.

---

## 4. Princípios de arquitetura (para não duplicar nada)

- **Um schema de dados** (Prisma) — todo tipo usado por web, extensão e API deriva dele ou de schemas Zod ao lado. Nunca redeclare um "shape" de dado em mais de um lugar.
- **Um cliente de API tipado**, compartilhado por web e extensão — nenhuma das duas faz `fetch` cru direto.
- **Um módulo de orquestração de IA** — toda chamada à LLM (chat, scoring, transcrição) passa por ele. Nenhuma rota chama o SDK da Anthropic/OpenAI diretamente.
- **Um único adaptador de canal por vez** (WhatsApp Web), atrás de uma interface `ChannelAdapter` — adicionar um canal novo no futuro é criar um arquivo novo, não bifurcar o content script.
- **Uma paleta/design tokens**, compartilhada entre web e extensão — mesma identidade visual da landing já construída (graphite escuro + verde de destaque).
- **Um único provedor de auth** (Supabase Auth) — web e extensão usam exatamente o mesmo mecanismo de sessão, não um sistema de token customizado por cima.
- **Uma API só** — não crie um microsserviço separado para V1. A API vive dentro do app web (Next.js Route Handlers). Extração futura é possível, mas não é problema de hoje.

---

## 5. Stack tecnológico (decisões fechadas — não reabra essa discussão)

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Padrão de mercado, cache de build, um único lockfile |
| Web (SaaS) | **Next.js 15 (App Router) + TypeScript + Tailwind** | Mesma base já usada na landing page; full-stack em um app só |
| Extensão | **WXT** (framework moderno p/ extensões, sobre Vite) **+ React + TypeScript + Tailwind** | Elimina boilerplate de Manifest V3, hot reload, suporte nativo a Side Panel |
| Backend/API | **Next.js Route Handlers** (dentro de `apps/web`) | Evita um segundo serviço/deploy para uma V1 — API e web no mesmo app |
| Banco de dados | **PostgreSQL via Supabase** | Postgres gerenciado + `pgvector` + Auth + Storage no mesmo provedor — menos peças móveis |
| ORM | **Prisma** | Schema único, tipos gerados, migrations versionadas |
| Auth | **Supabase Auth** (email/senha) | Mesmo mecanismo de sessão para web e extensão, sem sistema de token próprio |
| Vetores (RAG) | **pgvector** (extensão do Postgres do Supabase) | Não introduz um banco vetorial à parte |
| LLM (geração/raciocínio) | **Anthropic Claude**, via **Vercel AI SDK** | Um único provedor de geração; AI SDK abstrai streaming e saída estruturada |
| Embeddings | **OpenAI `text-embedding-3-small`** | Anthropic não oferece embeddings; é normal misturar provedor de embedding com provedor de geração — não é duplicação, é a ferramenta certa para cada tarefa |
| Transcrição de áudio | **OpenAI Whisper API** | Maduro, custo baixo, bom suporte a PT-BR |
| Validação de dados | **Zod** | Mesmo schema valida no servidor e tipa no cliente |
| UI (web) | Componentes no estilo shadcn/ui já usados na landing (`components/ui`) | Reaproveitar, não recriar |
| Deploy do web/API | **Vercel** | Mesma plataforma da landing, zero-config para Next.js |
| Observabilidade | **Sentry** (front + back) | Uma ferramenta só para erros em todas as camadas |
| Gerenciador de pacotes | **pnpm** (fixo — não misturar com npm/yarn) | Consistência de lockfile no monorepo |

Não substitua nenhum item desta tabela sem necessidade forte — a decisão já foi tomada para permitir foco em construir, não em escolher.

---

## 6. Estrutura do repositório

```
morubi/
├── apps/
│   ├── web/                     # Next.js — SaaS + API (Route Handlers)
│   │   ├── app/
│   │   │   ├── (auth)/          # login, signup
│   │   │   ├── (app)/           # área logada: dashboard, base de conhecimento, vendedores
│   │   │   └── api/             # Route Handlers consumidos por web E extensão
│   │   └── ...
│   └── extension/                # WXT — Side Panel do vendedor
│       ├── entrypoints/
│       │   ├── background.ts
│       │   ├── sidepanel/        # UI do copiloto (React)
│       │   └── content/          # adaptadores de canal
│       │       └── adapters/
│       │           └── whatsapp-web.ts
│       └── ...
├── packages/
│   ├── db/                       # schema.prisma + client Prisma exportado
│   ├── api-client/                # cliente HTTP tipado (usado por web e extensão)
│   ├── ai/                        # orquestração de LLM, RAG, prompts, scoring estruturado
│   ├── ui-tokens/                 # cores, radii, tipografia — fonte única do design
│   └── config/                    # eslint, tsconfig, tailwind preset compartilhados
├── docs/
│   ├── PRD-Morubi.md              # (se disponível no repo de origem, copie para cá)
│   ├── ARCHITECTURE.md            # gerado por você na Fase 0
│   └── DECISIONS.md               # decisões tomadas ao longo da execução
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

Regra prática: se você está prestes a criar um segundo lugar que define "o que é uma Conversa" ou "como chamar a LLM", pare — isso já existe em `packages/db` ou `packages/ai`. Importe, não recrie.

---

## 7. Modelo de dados (núcleo — ajuste livremente os campos, não a estrutura)

```prisma
model Tenant {
  id             String          @id @default(cuid())
  name           String
  segment        String?
  createdAt      DateTime        @default(now())
  users          User[]
  knowledgeItems KnowledgeItem[]
  conversations  Conversation[]
}

enum Role {
  GESTOR
  VENDEDOR
}

model User {
  id        String   @id            // = id do usuário no Supabase Auth
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  role      Role
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
  conversations Conversation[]
  corrections   Correction[]
}

model KnowledgeItem {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  title     String
  content   String
  // embedding: vector(1536) — coluna pgvector, adicionada via migration SQL manual
  createdAt DateTime @default(now())
}

enum Outcome {
  EM_ABERTO
  GANHA
  PERDIDA
}

model Conversation {
  id          String       @id @default(cuid())
  tenantId    String
  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  userId      String
  user        User         @relation(fields: [userId], references: [id])
  channel     String       // "whatsapp_web"
  leadName    String?
  outcome     Outcome      @default(EM_ABERTO)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  messages    Message[]
  suggestions Suggestion[]
}

enum Sender { CLIENTE VENDEDOR }
enum MsgType { TEXTO AUDIO }

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  sender         Sender
  type           MsgType
  content        String       // texto, ou transcrição se for áudio
  timestamp      DateTime
}

model Suggestion {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  stage          String
  probability    Int
  nextAction     String
  objection      String?
  objectionReply String?
  usefulFeedback Boolean?
  createdAt      DateTime     @default(now())
}

enum CorrectionScope { VENDEDOR TENANT }

model Correction {
  id         String          @id @default(cuid())
  tenantId   String
  userId     String
  user       User            @relation(fields: [userId], references: [id])
  scope      CorrectionScope
  original   String
  corrected  String
  approvedBy String?
  createdAt  DateTime        @default(now())
}
```

Uma única migration inicial cria tudo isso + a extensão `pgvector` + a coluna `embedding` em `KnowledgeItem`.

---

## 8. Contratos de API (Route Handlers em `apps/web/app/api`)

Todos autenticados via Bearer token da sessão Supabase. Todos definidos uma vez em `packages/api-client` (tipos de request/response) e reexportados — nem web nem extensão redeclaram esses tipos.

| Rota | Método | Descrição |
|---|---|---|
| `/api/auth/session` | GET | Retorna usuário + tenant + papel logado |
| `/api/knowledge` | GET/POST | Lista / cria item da base de conhecimento (dispara embedding em background) |
| `/api/users` | GET/POST | Lista / convida vendedores (só gestor) |
| `/api/conversations` | POST | Cria/atualiza conversa ativa (chamado pela extensão) |
| `/api/conversations/:id/messages` | POST | Envia lote de novas mensagens observadas (texto ou referência de áudio) |
| `/api/conversations/:id/analyze` | POST | **Endpoint central do copiloto** — recebe o histórico recente, roda RAG + LLM, retorna `{ stage, probability, nextAction, objection?, objectionReply? }` em uma única chamada estruturada |
| `/api/conversations/:id/outcome` | POST | Registra desfecho (ganha/perdida) |
| `/api/corrections` | POST | Registra correção do vendedor |
| `/api/corrections/:id/promote` | POST | Gestor promove correção para o tenant |
| `/api/transcribe` | POST | Recebe áudio, retorna transcrição (Whisper) |
| `/api/metrics/overview` | GET | Dados agregados do dashboard (macro + individual) |

Não crie rota nova para algo que já cabe em uma dessas — prefira adicionar um campo à resposta existente a criar um novo endpoint paralelo.

---

## 9. Motor de IA (`packages/ai`)

Regra de ouro: **uma chamada estruturada faz o trabalho de quatro**. Em vez de um endpoint para estágio, outro para probabilidade, outro para sugestão e outro para objeção, use `generateObject` (Vercel AI SDK) com um único schema Zod:

```ts
const AnalysisSchema = z.object({
  stage: z.enum(["descoberta", "consideração", "negociação", "fechamento"]),
  probability: z.number().min(0).max(100),
  nextAction: z.string(),
  objection: z.string().nullable(),
  objectionReply: z.string().nullable(),
});
```

Pipeline de `/analyze`:
1. Buscar as últimas N mensagens da conversa.
2. Buscar top-K trechos da base de conhecimento do tenant via similaridade de embedding (pgvector) + correções ativas daquele vendedor/tenant com prioridade sobre o conteúdo padrão.
3. Montar um único prompt com: contexto da empresa, trechos recuperados, correções relevantes, histórico da conversa.
4. Uma chamada `generateObject` ao Claude retornando `AnalysisSchema`.
5. Persistir como `Suggestion` e devolver ao front.

Pipeline de ingestão da base de conhecimento (disparado ao criar/editar `KnowledgeItem`):
1. Gerar embedding do conteúdo (OpenAI).
2. Gravar na coluna `embedding` via SQL (Prisma não modela `vector` nativamente — usar `$executeRaw` num único helper, não espalhado pelo código).

Pipeline de correção (memória evolutiva):
- Correção nova → grava em `Correction` com `scope: VENDEDOR`.
- Na montagem do prompt (passo 3 acima), sempre buscar correções do vendedor + do tenant (se promovidas) e injetá-las **antes** do conteúdo genérico da base, deixando claro para o modelo que elas têm prioridade.
- Gestor promove: endpoint muda `scope` para `TENANT`, e a correção passa a valer para todos os vendedores daquele tenant.

Não crie um "serviço de memória" separado — a tabela `Correction` + a lógica de prioridade no prompt já é a memória evolutiva. Simples e suficiente para V1.

---

## 10. Extensão — arquitetura de adaptador único

```ts
// apps/extension/entrypoints/content/adapters/types.ts
export interface ChannelAdapter {
  id: string;
  matches(url: string): boolean;
  getMessages(): { sender: "cliente" | "vendedor"; text: string; audioBlob?: Blob }[];
  onNewMessage(callback: (msg: Message) => void): () => void;
}
```

- V1 implementa **só** `whatsapp-web.ts`.
- O content script importa um **registry** de adaptadores (hoje com um item só) e escolhe o que casa com a URL atual — isso é o único lugar que sabe sobre canais. O side panel e o backend não sabem, nem precisam saber, de onde a mensagem veio.
- Side panel se comunica com o content script via `chrome.runtime` messaging; se comunica com a API do backend via `packages/api-client`, usando a sessão Supabase persistida em `chrome.storage.local`.
- Login da extensão: formulário simples no próprio side panel usando o client JS do Supabase (mesmo projeto do web) — não construa um fluxo de auth próprio.

---

## 11. Infraestrutura e deploy

| Item | Onde |
|---|---|
| Repositório | GitHub, monorepo único |
| Web + API | Vercel (deploy automático por branch; `main` = produção) |
| Banco + Auth + Vetores | Supabase (um projeto por ambiente: `dev` e `prod`) |
| Segredos | Variáveis de ambiente na Vercel + `.env.local` local; único `.env.example` na raiz documentando todas |
| Extensão (V1) | Build local (`pnpm --filter extension build`) carregado via "carregar sem compactação" no Chrome para a demo; publicação na Chrome Web Store fica para depois |
| Erros/observabilidade | Sentry, um projeto para web+API, um para extensão |
| CI | GitHub Actions: lint + typecheck + build em todo PR (um workflow só, rodando os três apps via Turborepo) |

Variáveis de ambiente mínimas (`.env.example`):
```
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SENTRY_DSN=
```

---

## 12. Plano de execução por fases

Não pule fases. Cada fase termina com build passando e algo visivelmente funcionando.

1. **Fase 0 — Fundação:** scaffold do monorepo (Turborepo + pnpm), configs compartilhadas (`packages/config`), projeto Supabase criado, schema Prisma inicial migrado, deploy vazio na Vercel funcionando. Escrever `docs/ARCHITECTURE.md` com o que foi decidido.
2. **Fase 1 — Auth e tenancy:** login/cadastro (Supabase Auth), criação de tenant no primeiro login de um gestor, papéis Gestor/Vendedor, proteção de rotas por papel.
3. **Fase 2 — SaaS básico:** onboarding da empresa, CRUD da base de conhecimento (com ingestão de embedding), convite de vendedores por e-mail.
4. **Fase 3 — Motor de IA:** `packages/ai` completo, endpoint `/analyze` funcionando com dado de teste (sem extensão ainda) — validar via chamada manual/Postman que retorna `AnalysisSchema` coerente ancorado na base de conhecimento.
5. **Fase 4 — Extensão mínima:** scaffold WXT, Side Panel abre, login funcionando, adaptador WhatsApp Web lendo mensagens e enviando para `/conversations` + `/messages`, painel exibindo o retorno de `/analyze` em tempo real.
6. **Fase 5 — Áudio:** captura de áudio do WhatsApp Web no adaptador, upload para `/transcribe`, transcrição entrando no pipeline de análise.
7. **Fase 6 — Memória evolutiva:** UI de correção no side panel, endpoint de correção, lógica de prioridade no prompt, tela de curadoria (promover correção) no web para o gestor.
8. **Fase 7 — Dashboards:** `/metrics/overview`, tela de dashboard macro + individual + registro de desfecho a partir do side panel.
9. **Fase 8 — Polimento de demo:** dados de exemplo (seed), tratamento de erro visível (sem tela branca), README com passo a passo de "como rodar e demonstrar".

---

## 13. Critério de pronto (Definition of Done da V1)

A V1 está pronta quando, sem editar código, você consegue:
1. Logar como gestor, criar a empresa e subir 3–5 itens de base de conhecimento.
2. Convidar um vendedor e logar como ele.
3. Abrir uma conversa real no WhatsApp Web com a extensão instalada e ver o painel abrir ao lado.
4. Ver estágio, probabilidade, sugestão e (quando houver) contorno de objeção aparecendo em poucos segundos, citando informação da base de conhecimento cadastrada.
5. Corrigir uma resposta errada da IA e ver, na mensagem seguinte da mesma conversa, que ela não repete o erro.
6. Marcar o desfecho da conversa e ver o número refletido no dashboard do gestor.

Se qualquer um desses 6 passos não funcionar de ponta a ponta, a V1 não está pronta — não avance para polimento visual antes disso.

---

## 14. Riscos de execução e como não travar neles

| Risco | Mitigação prática |
|---|---|
| Layout do WhatsApp Web muda e quebra o adaptador | Isolar toda a leitura de DOM em `whatsapp-web.ts`; se quebrar, é o único arquivo a mexer |
| Latência da LLM atrapalha a demo | Uma chamada estruturada só (não encadear 4 chamadas); usar streaming de status ("analisando...") no side panel |
| Custo/latência de transcrição de áudio | Transcrever de forma assíncrona, não bloquear a análise de texto esperando o áudio |
| Auth da extensão divergir do auth do web | Nunca implementar dois mecanismos — mesmo client Supabase em ambos, sempre |
| Scope creep (querer construir tudo do PRD de uma vez) | Releia a §3 antes de começar qualquer coisa nova; se não está lá, não constrói agora |

---

## 15. O que NÃO fazer (reforço explícito)

- Não crie um segundo backend/microsserviço.
- Não use mais de um provedor de LLM para geração de texto.
- Não implemente outro adaptador de canal além de WhatsApp Web.
- Não construa fluxo de pagamento/checkout.
- Não crie um sistema de autenticação próprio por cima do Supabase.
- Não duplique tipos/schemas entre web, extensão e API — tudo vem de `packages/db`, `packages/api-client` ou Zod compartilhado.
- Não escreva SQL espalhado pelo código — tudo via Prisma, exceto o helper único de `embedding` (§9).
- Não faça a IA enviar mensagem automaticamente pelo canal — ela só sugere.

---

**Comece pela Fase 0.** Ao terminar cada fase, resuma em `docs/DECISIONS.md` o que foi construído e qualquer decisão que você tomou que não estava neste documento.
