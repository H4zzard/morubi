# Decisões (log de execução)

Registro de decisões tomadas durante a construção que não estavam explícitas no prompt-fonte.

## Fase 0 — Fundação

- **`node-linker=isolated`** no `.npmrc`: layout padrão do pnpm; evita hoisting acidental que mascararia dependências não declaradas.
- **`DIRECT_URL`** adicionada ao `.env.example` além de `DATABASE_URL`: o Prisma Migrate precisa da conexão direta (porta 5432), enquanto o runtime usa o pooler (6543). Padrão recomendado do Supabase.
- **Campos extras no schema além do núcleo do prompt** (estrutura preservada, só campos acrescentados):
  - `Conversation.externalKey` + índice único `(userId, channel, externalKey)`: permite a extensão fazer upsert idempotente da conversa ativa a partir do identificador do chat no WhatsApp Web, sem duplicar conversas.
  - `Message.externalId` + único `(conversationId, externalId)`: dedupe de mensagens observadas em lotes repetidos.
  - Modelo `Invite`: convite de vendedor por e-mail antes do primeiro login (o vínculo com `User` acontece quando ele aceita/loga).
  - `KnowledgeItem.updatedAt` e `Correction.tenant`/`tenant` relation: consistência de auditoria e cascades.
- **Similaridade RAG via função SQL `match_knowledge`** (não SQL espalhado): centraliza a busca vetorial num único ponto, chamada por `matchKnowledge()` em `@morubi/db`. Índice `ivfflat` com `vector_cosine_ops`.
- **Embeddings 1536 dims**: `gemini-embedding-001` (Google) com `outputDimensionality: 1536`, mantendo a coluna `vector(1536)`.
- **Migration inicial hand-authored**: como o ambiente de construção não tem o banco Supabase provisionado, a migration `00000000000000_init` foi escrita à mão (equivalente ao que `prisma migrate dev` geraria) e inclui a extensão pgvector, a coluna `embedding` e a função RAG. Rode `pnpm db:migrate` (migrate deploy) apontando para o Supabase.

## Fase 1 — Auth e tenancy

- **`getAuthContext` unificado** resolve identidade por **Bearer** (extensão) OU **cookies** (web) no mesmo helper — um único mecanismo de sessão, como exige o §4/§15.
- **`User.id == id do Supabase Auth`**: sem tabela de credenciais própria. O `User` do banco é criado (a) no onboarding, para o gestor, ou (b) automaticamente no primeiro login do vendedor, consumindo um `Invite`.
- **Onboarding cria o tenant** no primeiro login de um gestor (usuário autenticado sem `User`/sem convite → vira GESTOR).
- **Guards por papel**: `requireUser` / `requireRole` nas rotas; `middleware.ts` protege as páginas.

## Fase 2 — SaaS básico

- **Convite de vendedor sem SMTP**: cria o usuário no Supabase Auth (`admin.createUser`) + registra um `Invite`, e **retorna uma senha temporária** na resposta para o gestor repassar. Evita depender de e-mail configurado na demo. O vínculo `User`↔`Tenant` acontece no primeiro login via `Invite`.
- **Páginas SSR leem o banco direto via `@morubi/db`** (não via self-HTTP); as **mutações no client** passam pelo `@morubi/api-client` (`browserApi`). Assim ninguém faz `fetch` cru, mantendo o §4.
- **Ingestão de embedding é best-effort** na criação do item: se a chave Gemini faltar, o item é salvo mesmo assim (a busca RAG só não encontra até reindexar).

### Troca OpenAI → Google Gemini (embeddings + transcrição)

- **Embeddings** passam a usar `gemini-embedding-001` com `outputDimensionality: 1536` (coluna pgvector inalterada) e `taskType` (`RETRIEVAL_DOCUMENT` na ingestão, `RETRIEVAL_QUERY` na consulta) para melhorar a recuperação.
- **Transcrição** passa a usar o `gemini-2.5-flash` (multimodal): o áudio vai como `inlineData` base64 + prompt de transcrição em PT-BR — não há endpoint Whisper separado.
- SDK: `@google/genai` (substitui `openai`). Geração de texto continua no Anthropic via Vercel AI SDK — só a "ferramenta certa por tarefa" mudou de provedor.
- Var de ambiente: `OPENAI_API_KEY` → `GEMINI_API_KEY`.
- **Atenção**: embeddings Gemini vivem num espaço vetorial diferente do OpenAI. Como a V1 é nova não há dados legados; se algum item já tiver sido indexado antes da troca, **reindexe** (recrie/edite os itens) para consistência.

## Fase 3 — Motor de IA

- **`AnalysisSchema` mora em `@morubi/api-client`** (contrato compartilhado) e é importado por `@morubi/ai` para o `generateObject` — definido uma única vez, sem duplicar entre o schema da LLM e o contrato de resposta de `/analyze`.
- **Persistência da `Suggestion` fica na rota** (camada de API), não em `@morubi/ai`, que permanece puro de orquestração.
- Enum `consideracao`/`negociacao` sem acento no valor (evita divergência de encoding entre camadas); o rótulo acentuado é só de UI.

## Fase 4/5 — Extensão

- **Áudio via base64 pelo runtime**: Blobs não sobrevivem à serialização de `chrome.runtime`, então o content script envia o áudio em base64; a **transcrição é feita pelo side panel** (onde vive o auth), mantendo um único ponto de autenticação.
- **Idempotência**: conversa por `externalKey` (nome do chat) e mensagens por `externalId` (hash de conteúdo) — reenvios não duplicam.
- **Todo DOM do WhatsApp isolado** em `whatsapp-web.ts`; o `registry` é o único ponto que conhece canais.

## Fase 6/7/8

- **Correção → reanálise imediata**: ao salvar uma correção, o side panel chama `/analyze` de novo para provar que o erro não se repete (critério de DoD #5).
- **Cálculo de métricas em `lib/metrics.ts`**, reutilizado pela rota `/metrics/overview` e pela página SSR do dashboard — sem duplicar a agregação.
- **CI único** (GitHub Actions) roda install → generate → typecheck → lint → build via Turborepo.

## Pós-V1 — Correções de bugs reportados em uso real

- **`ai@4`/`@ai-sdk/anthropic@1` → `ai@7`/`@ai-sdk/anthropic@4`**: modelos da geração atual (Sonnet 5) rejeitam `temperature` explícito (mesmo o default que o SDK v4 injetava). A v7 resolve isso nativamente — sem precisar do hack de habilitar "thinking" (que por sua vez conflita com `tool_choice` forçado, usado internamente por `generateObject`).
- **RAG `match_knowledge`**: cast explícito `${matchCount}::int` no `$queryRaw` — Prisma envia `number` como `bigint` por padrão, e a função SQL exigia `int` (erro de overload 42883 do Postgres).
- **Taxa de conversão do dashboard**: mudou de `ganhas / (ganhas + perdidas)` para `ganhas / total` — a primeira fórmula ignorava conversas em aberto, dando 100% com só 1 ganha e 5 em aberto.
- **Estado da extensão "grudando" entre conversas**: `outcomeDone`/`correcting` eram `useState` do componente `Copilot`, que não remonta ao trocar de chat (só `conversationId` muda por baixo) — corrigido com reset via `useEffect([conversationId])` e uma função `markOutcome` no hook que sempre referencia o id explícito da conversa, nunca "a última que resolveu".
- **Status "error" sumindo sozinho**: o painel reprocessa a cada mutação do DOM do WhatsApp (típing indicator, check azul etc.); um bug de closure obsoleta fazia isso resetar o status pra "syncing" mesmo depois de um erro real. Corrigido com uma ref `settled` que só permite mudar o status enquanto a conversa não chegou a um estado final.
- **Upload de arquivo na base de conhecimento**: adicionado `POST /api/knowledge/upload` (PDF via `pdf-parse` v2 — API baseada em classe `PDFParse`, não a função da v1 —, DOCX via `mammoth`, TXT/MD lidos direto). Lógica de criação+embedding extraída pra `lib/knowledge.ts`, compartilhada entre criação manual e upload.
- **Botão de correção pouco visível**: existia mas era um link de texto pequeno no canto; virou botão de verdade, e passou a valer também para `objectionReply` (antes só `nextAction` podia ser corrigido).

## Multi-canal — Adaptador Kentro/AtenderBem (CRM interno do cliente)

- **Arquitetura ficou mais dinâmica antes de adicionar o 2º canal**: `captureAudioBlob` saiu de uma função solta importada direto de `whatsapp-web.ts` (quebrava a regra de "content script não sabe de canais") para um método opcional na interface `ChannelAdapter`. `hostPatterns: string[]` foi adicionado à mesma interface, e `content/index.ts` usa `MATCHED_HOST_PATTERNS` (união dos `hostPatterns` de todos os adaptadores do registry) como `matches` do content script — confirmado via `manifest.json` gerado que isso funciona (WXT executa o entrypoint em sandbox pra extrair a config, não é só parsing estático). Adicionar um canal novo agora é **só** criar o arquivo do adaptador + registrá-lo em `registry.ts`; `wxt.config.ts` só precisa do `host_permissions` (permissão de runtime, não descoberta automaticamente).
- **`Channel` virou enum compartilhado** (`ChannelSchema` em `@morubi/api-client`, antes era `z.literal("whatsapp_web")`) — usado tanto pelo tipo `ChannelAdapter.id` quanto pela validação da API. `ConversationUpdate` (mensagem content script → side panel) ganhou o campo `channel`; a chave de "trocou de conversa?" no `useCopilot` virou composta (`${channel}:${externalKey}`) pra não colidir se dois canais tiverem por acaso a mesma externalKey.
- **Kentro é uma app Angular Material sem `data-testid`/`data-id`** (diferente do WhatsApp Web) — só classes utilitárias e hashes `ng-tns-*` instáveis entre builds. Seletores usáveis encontrados por inspeção ao vivo: `.message-in`/`.message-out` (mesma convenção que o WhatsApp Web usava há anos), `.message-time-label`.
- **Identificador de conversa (externalKey) não pode ser o nome de exibição**: muitos contatos aparecem sem nome cadastrado ("@..."). Solução: o `id` de cada mensagem é o **wamid do WhatsApp** (Kentro integra via API oficial), e decodificar esse id em base64 (`atob`) expõe o **telefone do contato em ASCII puro** dentro dos bytes — usado como `externalKey` estável independente de nome. Ganho colateral: `wamid` também vira o `externalId` de dedupe (mais robusto que o hash de conteúdo usado no WhatsApp Web puro).
- **Texto da mensagem do vendedor vem com prefixo `<b>Nome do agente:</b>`** embutido no mesmo bloco de texto (não é um campo separado) — removido na extração comparando o texto do `<b>` com o início do texto completo.
- **Sem container/rota estável para a lista de mensagens** (a URL não muda ao trocar de conversa) — `onChange()` observa `document.body` inteiro como fallback (mesmo padrão usado no WhatsApp Web quando nenhum container mais específico é confirmável).
- **Caixas de sistema/bot ignoradas de propósito**: avisos operacionais (ex.: "atendimento bloqueado por fim de janela de 24h") e respostas de fluxo automatizado (fora do horário de expediente) não têm confirmação de seletor próprio — como não usam `.message-in`/`.message-out`, ficam de fora da leitura. Simplificação deliberada, não bug.
- **Áudio do Kentro**: mesmo padrão do WhatsApp Web (busca `<audio src="...">` dentro da bolha) — não testado ao vivo com uma mensagem de voz real do Kentro; se não funcionar de primeira, precisa de mais uma rodada de diagnóstico.

## V2 — Memória por contato, chat com a IA e redesign

### Memória evolutiva por CONTATO (não por conversa)
- Novo modelo `ContactMemory`, chaveado por `(tenantId, channel, externalKey)` e **não** por
  conversa. Motivo: o histórico pertence ao lead, então sobrevive à conversa ser reaberta,
  trocar de vendedor ou o mesmo contato aparecer em outro canal.
- Guarda `summary` (resumo corrido, reescrito a cada análise) + `keyFacts` (fatos duráveis:
  orçamento, decisor, prazo) + `analysisCount`.
- O fluxo é **acumulativo, nunca reinicia**: `buildAnalysisContext` carrega a memória, o prompt
  manda partir dela e só substituir fato antigo quando o novo o contradiz, e a LLM devolve a
  versão já mesclada (`memorySummary`/`memoryKeyFacts`) que a rota persiste com `saveContactMemory`.
- O painel mostra "Retomando de onde parou · N análises deste contato" quando `analysisCount > 1`,
  para o vendedor saber que não é primeiro contato.
- Escritas de banco seguem na camada de API (a rota persiste), mantendo `@morubi/ai` livre de writes.

### Proibição de travessão
- Instrução no prompt não é garantia (o modelo reincide sob pressão de contexto), então há uma
  rede determinística: `stripDashes` em `packages/ai/src/sanitize.ts`, aplicada via `stripDashesDeep`
  em **toda** saída de LLM (análise, chat, insight) antes de sair do pacote.
- Preserva hífen legítimo ("follow-up", "pós-venda") e trata casos reais: aposto entre travessões
  vira vírgula, travessão de lista vira "- ", intervalo numérico ("100 – 200") vira "100 a 200".
  Verificado com casos concretos antes de integrar.

### Chat do vendedor com o Morubi (substitui o editor inline de correção)
- Novo modelo `CopilotChatMessage` + rota `GET/POST /api/conversations/:id/chat`.
- A correção deixou de ser um formulário: a IA **detecta** que a mensagem é uma correção
  (`isCorrection` na saída estruturada) e a rota grava o `Correction` correspondente. O vendedor
  só conversa naturalmente ("não é 7 dias, é 5") e a memória evolutiva se alimenta sozinha.
- Ao salvar correção, o painel dispara `reanalyze()` automaticamente para refletir o aprendizado.
- `useChat.send` **retorna** o resultado em vez de só setar estado: ler `lastCorrection` logo após
  o await pegaria o valor do render anterior (closure obsoleta), o mesmo tipo de bug já corrigido
  antes no `useCopilot`.

### Métricas novas e de onde saem
- `Suggestion.mistakes` (array de `SellerMistake`): a IA classifica erros de condução do vendedor
  por análise. É a fonte do card "Erros mais comuns" — antes não existia dado para isso.
- `Conversation.dealValue` (centavos, opcional, preenchido pelo vendedor ao marcar o desfecho):
  fonte de "Receita projetada" (ponderada pela probabilidade) e "Vendas em risco".
- "Leads quentes" = em aberto com probabilidade >= 70. "Em risco" = em aberto com objeção aberta
  ou parado há 2+ dias. "Equipe ativa" = vendedores com conversa atualizada nas últimas 24h.
- Insight do gestor é uma chamada de LLM, então fica atrás de `withInsight`/`?insight=1` e a página
  usa `revalidate = 300`, para não pagar LLM a cada F5 nem em polling da extensão.

### Identidade visual
- Logo reconstruída como SVG vetorial em `@morubi/ui-tokens/logo` (componente `LogoMark` inline,
  `currentColor`), usada no nav, telas de auth, favicon e painel da extensão. Ícones PNG da extensão
  (16/32/48/128) rasterizados a partir de uma variante quadrada com padding.
- Dashboard reconstruído no estilo dos mockups: cards com sparkline SVG inline (sem lib de chart),
  barras de progresso, ranking, leads em risco e atividade da equipe.
- Extensão passou a ter timeline (cliente → objeção → sugestão → pontos de atenção) e abas
  "Copiloto" / "Falar com o Morubi".

## Roadmap pós-V2 — Etapas de endurecimento

### Etapa 1 — CRUD completo
- `PATCH/DELETE /api/knowledge/[id]` (editar reindexando embedding; excluir) e `DELETE /api/users/[id]`
  (remover vendedor OU cancelar convite `invite:<id>`). Tudo GESTOR + escopo de tenant.
- Remover vendedor revoga o acesso no Supabase Auth e cascateia conversas; a memória por contato
  (por tenant) sobrevive. Gestor não pode remover a si mesmo. (Tradeoff conhecido: cascata apaga o
  histórico do vendedor do dashboard — trocar por soft-delete se precisar preservar.)

### Etapa 3 — Deploy-ready (Vercel + Chrome Web Store)
- **Prisma `binaryTargets = ["native", "rhel-openssl-3.0.x"]`**: sem o alvo da Vercel, toda rota de
  API quebra em produção (erro #1 de deploy de Prisma).
- `apps/web/vercel.json` fixa install/build do monorepo; `outputFileTracingRoot` já apontava pra raiz.
- Extensão: `build:prod`/`zip:prod` (mode `prod` → `.env.prod`, sem clobber do `.env` de dev, que é
  o mesmo diretório de saída). `host_permissions` cobre `*.vercel.app` out-of-the-box.
- Página pública `/privacy` (a Chrome Web Store exige URL de política de privacidade).
- `docs/DEPLOY.md` com o passo a passo. Alerta: rotas de IA levam 20-40s → precisa do plano **Pro**
  da Vercel (Hobby corta a função).

### Etapa 4 — Observabilidade (Sentry)
- `@sentry/nextjs` no web (server/edge/client configs + `instrumentation.ts` + `onRequestError`),
  captura no `handle()`. `@sentry/browser` no side panel. **Tudo inerte sem DSN** — nunca quebra
  quem não configurou. `withSentryConfig` é seguro sem authToken (só pula upload de source map).

### Etapa 5 — Estabilidade sob carga
- **Rate limiting** (`lib/rate-limit.ts`, janela fixa em memória, por usuário) em `analyze`/`chat`/
  `transcribe`. Limites generosos (30/30/20 por min). Retorna 429 com `Retry-After`. Limitação: é
  por-instância (não global em serverless) — trocar o Map por Upstash mantendo a assinatura para um
  limite forte em prod.
- **Timeout de LLM** (`llmAbortSignal`, 45s < maxDuration 60s) em analyze/chat/insight, convertendo
  abort/timeout num `LlmTimeoutError` amigável em vez de a Vercel matar a função.
- Guarda de tamanho: upload de áudio limitado a 20 MB (413).
- (Contexto: o pool do Prisma já tinha sido ampliado para `connection_limit=30&pool_timeout=60` após
  o P2024 observado em uso real.)
