import type { Metadata } from "next";
import { LogoMark } from "@morubi/ui-tokens/logo";

export const metadata: Metadata = {
  title: "Política de Privacidade — Morubi",
  description: "Como o Morubi coleta, usa e protege os dados.",
};

// Página pública (fora das rotas protegidas pelo middleware) — serve como URL
// da política de privacidade exigida pela Chrome Web Store.
export default function PrivacyPage() {
  const updated = "18 de julho de 2026";

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark className="h-7 w-7 text-brand-500" />
        <span className="text-lg font-semibold text-ink-100">Morubi</span>
      </div>

      <h1 className="text-2xl font-semibold text-ink-100">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-ink-500">Última atualização: {updated}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-300">
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">O que é o Morubi</h2>
          <p>
            O Morubi é um assistente de vendas para empresas. Ele é composto por um painel web
            (usado pelo gestor) e uma extensão de navegador (usada pelo vendedor), que lê a conversa
            de atendimento aberta na tela e sugere, em tempo real, o melhor próximo passo da venda.
            O Morubi nunca envia mensagens no seu lugar: ele apenas assiste e sugere.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Dados que coletamos</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-200">Conta:</strong> nome e e-mail do usuário, usados
              para autenticação e para vincular você à sua empresa.
            </li>
            <li>
              <strong className="text-ink-200">Conteúdo das conversas atendidas:</strong> quando a
              extensão está ativa em uma aba de atendimento (por exemplo WhatsApp Web ou o CRM da
              empresa), ela lê o texto das mensagens visíveis daquela conversa e, quando houver, o
              áudio das mensagens de voz, para gerar as sugestões.
            </li>
            <li>
              <strong className="text-ink-200">Base de conhecimento:</strong> os documentos e textos
              que o gestor cadastra sobre a empresa (preços, políticas, materiais).
            </li>
            <li>
              <strong className="text-ink-200">Dados de uso comercial:</strong> estágio da venda,
              probabilidade estimada, desfecho (ganha/perdida) e valor do negócio, para os relatórios
              do gestor.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Como usamos</h2>
          <p>
            Os dados são usados exclusivamente para gerar as sugestões de venda, manter a memória do
            relacionamento com cada contato e produzir os relatórios do gestor da sua empresa. Não
            vendemos seus dados nem os usamos para publicidade.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Compartilhamento com terceiros</h2>
          <p>Para funcionar, o Morubi processa dados nos seguintes provedores:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-200">Supabase</strong> — banco de dados e autenticação.
            </li>
            <li>
              <strong className="text-ink-200">Anthropic (Claude)</strong> — geração das análises e
              respostas do assistente.
            </li>
            <li>
              <strong className="text-ink-200">Google (Gemini)</strong> — indexação da base de
              conhecimento e transcrição de áudios.
            </li>
          </ul>
          <p className="mt-2">
            O conteúdo enviado a esses provedores serve apenas para produzir a resposta solicitada.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Permissões da extensão</h2>
          <p>
            A extensão só lê o conteúdo das páginas de atendimento que ela suporta (WhatsApp Web e o
            CRM configurado). Ela não acessa nem monitora outras abas ou sites. A sua sessão de login
            fica armazenada localmente no seu navegador.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Retenção e exclusão</h2>
          <p>
            Os dados ficam guardados enquanto a conta estiver ativa. O gestor pode excluir itens da
            base de conhecimento e remover usuários a qualquer momento. Para excluir todos os dados da
            sua empresa, entre em contato pelo e-mail abaixo.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-ink-100">Contato</h2>
          <p>
            Dúvidas sobre privacidade: escreva para{" "}
            <span className="text-brand-300">contato@morubi.com.br</span> (ajuste para o e-mail
            oficial da sua empresa).
          </p>
        </section>
      </div>
    </div>
  );
}
