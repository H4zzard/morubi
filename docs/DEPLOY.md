# Deploy do Morubi

Guia de produção: o **web/API** vai para a **Vercel** e a **extensão** para a **Chrome Web Store**.
O banco/auth continua no **Supabase**.

> O código já está preparado para deploy (Prisma com binário da Vercel, `vercel.json`,
> build de produção da extensão, página `/privacy`). Os passos abaixo são as ações que
> dependem das suas contas.

---

## 1. Supabase de produção

Você pode **reusar o projeto atual** ou criar um separado para produção (recomendado ter
`dev` e `prod` separados). Para cada ambiente:

1. **Migrations**: com a `DATABASE_URL`/`DIRECT_URL` do ambiente no seu `.env.local`, rode:
   ```bash
   pnpm db:migrate
   ```
2. **Auth → e-mail**: em Authentication → Providers → Email. Para a demo, "Confirm email"
   pode ficar desligado.
3. Anote da aba **Connect / Settings → Database**: `DATABASE_URL` (Transaction pooler, porta
   6543, com `?pgbouncer=true&connection_limit=30&pool_timeout=60`) e `DIRECT_URL` (Session
   pooler, porta 5432).

---

## 2. Vercel (web + API)

1. Suba o repositório no GitHub (monorepo inteiro).
2. Em vercel.com → **Add New → Project** → importe o repositório.
3. **Root Directory**: selecione `apps/web`.
4. Em **Settings → General**, ative **"Include files outside of the Root Directory in the
   Build Step"** (necessário porque o app importa `../../packages`).
5. **Environment Variables** (Production): adicione todas:
   ```
   DATABASE_URL
   DIRECT_URL
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ANTHROPIC_API_KEY
   GEMINI_API_KEY
   ```
6. **Deploy**. O `vercel.json` já define o build (`pnpm run build`, que roda `prisma generate`
   antes do `next build`) e o timeout das rotas de IA.

> ⚠️ **Plano da Vercel**: as rotas `/analyze`, `/chat` e `/transcribe` chamam a LLM e podem
> levar 20-40s. O plano **Hobby limita funções a ~10-60s** e pode cortar essas chamadas. Para
> produção estável use o plano **Pro** (permite até 300s). Em teste, se a análise cortar por
> timeout, é isso.

Ao final você terá uma URL tipo `https://morubi-xxxx.vercel.app` (ou seu domínio próprio).

---

## 3. Extensão (Chrome Web Store)

### 3.1 Build de produção
1. Copie `apps/extension/.env.prod.example` para `apps/extension/.env.prod` e preencha:
   - `WXT_API_BASE_URL` = a URL da Vercel (ou seu domínio).
   - `WXT_SUPABASE_URL` / `WXT_SUPABASE_ANON_KEY` = do projeto Supabase de produção.
2. Se usar **domínio próprio** (ex.: `app.morubi.com`), troque em `apps/extension/wxt.config.ts`
   a linha `"https://*.vercel.app/*"` por `"https://app.morubi.com/*"`. Com a URL padrão da
   Vercel (`*.vercel.app`) já funciona sem mexer.
3. Gere o pacote:
   ```bash
   pnpm --filter @morubi/extension zip:prod
   ```
   O `.zip` sai em `apps/extension/.output/`.

### 3.2 Publicação
1. Crie uma conta de desenvolvedor no [Chrome Web Store Dashboard](https://chrome.google.com/webstore/devconsole) (taxa única de US$ 5).
2. **New item** → suba o `.zip`.
3. **Privacy**:
   - **Privacy policy URL**: `https://SUA-URL-DA-VERCEL/privacy` (a página já existe no app).
   - **Single purpose**: "Assistir o vendedor durante o atendimento, sugerindo o próximo passo
     da venda a partir da conversa aberta na tela."
   - **Permissions justification**:
     - `sidePanel` — exibir o copiloto ao lado da conversa.
     - `storage` — guardar a sessão de login.
     - `activeTab`/`scripting` — ler a conversa aberta na aba de atendimento.
     - host permissions (whatsapp/atenderbem) — ler as mensagens dessas telas.
4. **Store listing**: nome, descrição, ícone (já embutido) e **capturas de tela** (obrigatório;
   tire prints do painel em uso).
5. Envie para revisão. A aprovação costuma levar de horas a alguns dias.

> Enquanto não publica, dá para usar em "Carregar sem compactação" apontando para
> `apps/extension/.output/chrome-mv3`. **Atenção:** dev (`build`) e produção (`build:prod`)
> gravam nessa MESMA pasta, então o último comando rodado é o que vale. Para voltar a testar
> local, rode `pnpm --filter @morubi/extension build` de novo (aponta para o localhost do `.env`).

---

## 4. E-mail (convite de vendedor e recuperação de senha)

O sistema já funciona **sem** configurar nada: se o e-mail não sair, o convite cai
automaticamente na **senha temporária** exibida na tela para o gestor repassar.

Para o convite sair por e-mail de verdade (o vendedor clica no link e define a própria
senha), configure o SMTP no Supabase:

1. Supabase → **Project Settings → Authentication → SMTP Settings** → *Enable Custom SMTP*.
2. Preencha com um provedor de envio (Resend, SendGrid, Amazon SES, Mailgun, Brevo...):
   host, porta, usuário, senha, e o **remetente** (ex.: `nao-responda@suaempresa.com.br`).
3. Em **Authentication → URL Configuration**:
   - **Site URL**: a URL do seu deploy (ex.: `https://morubi.vercel.app`).
   - **Redirect URLs**: adicione `https://SUA-URL/auth/callback`.
     Sem isso, o link do e-mail é recusado por segurança.
4. Em **Authentication → Email Templates**, dá para personalizar os textos de
   "Invite user" e "Reset password".

> Sem SMTP próprio, o Supabase usa um serviço de e-mail interno com **limite baixo**
> (poucos envios por hora) e só serve para teste. Para produção, configure o SMTP.

Fluxos que passam a funcionar:
- **Convidar vendedor** → ele recebe o e-mail, clica e define a senha em `/update-password`.
- **Esqueci minha senha** (`/forgot-password`) → e-mail com link de recuperação.
- **Trocar senha** (link "Senha" no topo) → funciona sempre, não depende de e-mail.

---

## 5. Checklist pós-deploy

- [ ] `https://SUA-URL/login` abre e o cadastro de gestor funciona.
- [ ] `https://SUA-URL/privacy` abre (URL da política de privacidade).
- [ ] Dashboard carrega sem erro de conexão (Prisma) — se der erro de binário, confira o
      `binaryTargets` no `schema.prisma` e refaça o deploy.
- [ ] Extensão de produção loga e analisa uma conversa real (chamando a API da Vercel).
- [ ] Se a análise cortar por timeout, subir para o plano Pro da Vercel.

---

## Variáveis extras (opcionais)

- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — observabilidade. Sem elas, o Sentry fica inerte.
- `CRON_SECRET` — protege `/api/cron/coaching`. Defina na Vercel e o cron passa a exigir
  `Authorization: Bearer <valor>` (a Vercel envia automaticamente).
