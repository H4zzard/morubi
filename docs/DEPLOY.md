# Deploy do Morubi

Guia de produção: o **web/API** roda numa **VM Ubuntu na DigitalOcean** e a **extensão** vai para a
**Chrome Web Store**. O banco/auth continua no **Supabase**.

> Vantagem de rodar na sua própria VM: **não existe limite de tempo de função**. As chamadas de IA
> (analyze/chat/transcribe) levam 20-40s e rodam sem cortar, diferente da Vercel (que exigiria o
> plano Pro). Em compensação, você cuida do servidor (Node, Nginx, HTTPS, cron).

---

## 0. Máquina na DigitalOcean (o essencial)

**Sistema:** Ubuntu 24.04 LTS.

O Morubi web **não é pesado de CPU** — o trabalho duro (a IA) acontece nas APIs da Anthropic e do
Google, o servidor só espera a resposta. O que consome recurso é o **build** do Next.js (o
`next build` é guloso de memória). Então o gargalo é RAM, não processador.

| Perfil | Droplet | Para quê |
|---|---|---|
| **Mínimo** | 1 vCPU · **2 GB RAM** · 50 GB SSD | Funciona, mas o build é lento e exige **swap** (passo 3.2). Abaixo de 2 GB o `next build` dá OOM (mata o processo). |
| **Recomendado** | 2 vCPU · **4 GB RAM** · 80 GB SSD | Build tranquilo e folga para picos de atendimento simultâneo. É o que eu recomendo. |

Na DigitalOcean isso é o plano **Basic (Shared CPU)** — a opção de 4 GB/2 vCPU costuma ficar em
torno de US$ 24/mês (confira o preço atual). Disco: o projeto (node_modules + build) ocupa poucos
GB; 50 GB já sobra.

**Região:** a DigitalOcean não tem datacenter no Brasil. O banco (Supabase) está em São Paulo
(`sa-east-1`), e o servidor conversa bastante com ele, então escolha a região de **menor latência
até o Supabase** entre as disponíveis (NYC costuma ser um meio-termo razoável). Não é bloqueante,
mas afeta a velocidade percebida.

**Extras que você vai querer no droplet:** um **domínio** apontando para o IP (ex.:
`app.morubi.com.br`) — necessário para o HTTPS e para os links de e-mail do Supabase.

---

## 1. Supabase de produção

Você pode **reusar o projeto atual** ou criar um separado para produção (recomendado ter `dev` e
`prod` separados). Para cada ambiente:

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

## 2. Preparar o servidor (uma vez)

Conecte por SSH como root e instale o básico.

### 2.1 Usuário, firewall e fuso
```bash
adduser morubi && usermod -aG sudo morubi        # usuário sem ser root
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
timedatectl set-timezone America/Sao_Paulo        # cron do coaching no horário certo
```

### 2.2 Node 20 + pnpm + Nginx + Git
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo corepack enable && sudo corepack prepare pnpm@9.15.0 --activate
```

---

## 3. Subir a aplicação

Faça como o usuário `morubi` (não root).

### 3.1 Clonar e configurar o ambiente
```bash
sudo mkdir -p /opt/morubi && sudo chown morubi:morubi /opt/morubi
git clone https://github.com/H4zzard/morubi.git /opt/morubi
cd /opt/morubi
```

Crie **`apps/web/.env.local`** com TODAS as variáveis (é lido tanto no build quanto em runtime;
as `NEXT_PUBLIC_*` são embutidas no build, por isso precisam existir ANTES de buildar):
```
DATABASE_URL=postgresql://...6543...?pgbouncer=true&connection_limit=30&pool_timeout=60
DIRECT_URL=postgresql://...5432...
NEXT_PUBLIC_SUPABASE_URL=https://SEU-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
AI_PROVIDER=api
CRON_SECRET=uma-frase-secreta-qualquer
# opcionais (observabilidade):
# SENTRY_DSN=...
# NEXT_PUBLIC_SENTRY_DSN=...
```

> `AI_PROVIDER=api` é **obrigatório em produção** (o código bloqueia `cli`/`mock` fora do dev).

### 3.2 (Só na máquina de 2 GB) criar swap para o build não morrer
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.3 Instalar, migrar e buildar
```bash
cd /opt/morubi
pnpm install --frozen-lockfile
pnpm db:migrate                          # aplica as migrations no Supabase
pnpm --filter @morubi/web build          # roda prisma generate + next build
```

O Prisma gera o binário nativo do próprio Ubuntu no `generate`, então não precisa mexer em
`binaryTargets`.

### 3.4 Rodar como serviço (systemd)
Crie `/etc/systemd/system/morubi.service`:
```ini
[Unit]
Description=Morubi web/API
After=network.target

[Service]
Type=simple
User=morubi
WorkingDirectory=/opt/morubi/apps/web
# Aponta direto para o binário do Next (não depende do pnpm no PATH do systemd).
ExecStart=/opt/morubi/apps/web/node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now morubi
sudo systemctl status morubi          # deve estar "active (running)"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # espera 307
```

### 3.5 Nginx como proxy reverso + HTTPS
Crie `/etc/nginx/sites-available/morubi`:
```nginx
server {
    server_name app.SEU-DOMINIO.com.br;
    client_max_body_size 25m;              # uploads de arquivo/áudio
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;           # análises longas não podem cortar
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/morubi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# HTTPS grátis (Let's Encrypt):
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.SEU-DOMINIO.com.br
```

Pronto: o app fica em `https://app.SEU-DOMINIO.com.br`.

### 3.6 Coaching automático (cron do sistema)
A execução agendada do coaching (que na Vercel seria um "cron job") aqui é um **crontab**. Ele bate
diariamente no endpoint, que decide sozinho se hoje é um dos dias escolhidos pelo gestor.
```bash
crontab -e
# adicione (8h, fuso já é São Paulo):
0 8 * * * curl -s -X GET https://app.SEU-DOMINIO.com.br/api/cron/coaching -H "Authorization: Bearer SUA-CRON-SECRET"
```

### 3.7 Atualizar o Morubi depois (novo deploy)
```bash
cd /opt/morubi && git pull
pnpm install --frozen-lockfile
pnpm db:migrate                    # se houver migration nova
pnpm --filter @morubi/web build
sudo systemctl restart morubi
```

---

## 4. Extensão (Chrome Web Store)

### 4.1 Build de produção
1. Copie `apps/extension/.env.prod.example` para `apps/extension/.env.prod` e preencha:
   - `WXT_API_BASE_URL` = `https://app.SEU-DOMINIO.com.br` (a URL do servidor).
   - `WXT_SUPABASE_URL` / `WXT_SUPABASE_ANON_KEY` = do projeto Supabase de produção.
2. Em `apps/extension/wxt.config.ts`, troque a linha `"https://*.vercel.app/*"` por
   `"https://app.SEU-DOMINIO.com.br/*"` (a extensão precisa de permissão para falar com a sua API).
3. Gere o pacote:
   ```bash
   pnpm --filter @morubi/extension zip:prod
   ```
   O `.zip` sai em `apps/extension/.output/`.

### 4.2 Publicação
1. Crie uma conta de desenvolvedor no [Chrome Web Store Dashboard](https://chrome.google.com/webstore/devconsole) (taxa única de US$ 5).
2. **New item** → suba o `.zip`.
3. **Privacy**:
   - **Privacy policy URL**: `https://app.SEU-DOMINIO.com.br/privacy` (a página já existe no app).
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

## 5. E-mail (convite de vendedor e recuperação de senha)

O sistema já funciona **sem** configurar nada: se o e-mail não sair, o convite cai automaticamente
na **senha temporária** exibida na tela para o gestor repassar.

Para o convite sair por e-mail de verdade (o vendedor clica no link e define a própria senha),
configure o SMTP no Supabase:

1. Supabase → **Project Settings → Authentication → SMTP Settings** → *Enable Custom SMTP*.
2. Preencha com um provedor de envio (Resend, SendGrid, Amazon SES, Mailgun, Brevo...):
   host, porta, usuário, senha, e o **remetente** (ex.: `nao-responda@suaempresa.com.br`).
3. Em **Authentication → URL Configuration**:
   - **Site URL**: `https://app.SEU-DOMINIO.com.br`.
   - **Redirect URLs**: adicione `https://app.SEU-DOMINIO.com.br/auth/callback`.
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

## 6. Checklist pós-deploy

- [ ] `systemctl status morubi` mostra **active (running)**.
- [ ] `https://app.SEU-DOMINIO.com.br/login` abre e o cadastro de gestor funciona.
- [ ] `https://app.SEU-DOMINIO.com.br/privacy` abre (URL da política de privacidade).
- [ ] Dashboard carrega sem erro de conexão com o Supabase.
- [ ] Extensão de produção loga e analisa uma conversa real (chamando a sua API).
- [ ] Uma análise real completa sem cortar (na VM não há timeout de função como na Vercel).
- [ ] `curl` no `/api/cron/coaching` com o header do CRON_SECRET responde 200.

Logs em tempo real: `journalctl -u morubi -f`.

---

## Variáveis extras (opcionais)

- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — observabilidade. Sem elas, o Sentry fica inerte.
- `CRON_SECRET` — protege `/api/cron/coaching`. Defina no `.env.local` e use o mesmo valor no
  header `Authorization: Bearer <valor>` do crontab (passo 3.6).

> O arquivo `apps/web/vercel.json` no repositório é ignorado neste deploy (só vale se um dia você
> usar a Vercel). Pode deixá-lo como está.
