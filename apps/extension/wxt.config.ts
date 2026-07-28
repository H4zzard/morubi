import { defineConfig } from "wxt";

// WXT — elimina boilerplate de Manifest V3, hot reload, suporte a Side Panel.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Morubi",
    description:
      "Seu gerente comercial de IA acompanhando a venda em tempo real.",
    permissions: ["sidePanel", "storage", "activeTab", "scripting"],
    host_permissions: [
      "https://web.whatsapp.com/*",
      // Kentro roda sobre a plataforma AtenderBem; cada empresa tem um
      // subdomínio próprio (ex.: mv8company.atenderbem.com) — liberamos o
      // domínio inteiro para não depender do subdomínio de um cliente só.
      "https://*.atenderbem.com/*",
      // CRMs lidos pelo adaptador genérico (Z-Pro etc.). Z-Pro é auto-hospedado:
      // cada empresa usa o próprio domínio. Mantenha em sincronia com
      // GENERIC_CRM_HOSTS (generic-chat.ts).
      "https://atendimento.cppem.com.br/*",
      // API em produção: cobre a URL padrão da Vercel out-of-the-box. Se usar
      // domínio próprio (ex.: app.morubi.com), troque por "https://app.morubi.com/*".
      "https://*.vercel.app/*",
      // Qualquer porta local: o dev server pode subir em 3000, 3100 etc.
      // dependendo do que já estiver ocupado na máquina.
      "http://localhost/*",
    ],
    action: { default_title: "Abrir Morubi" },
    side_panel: { default_path: "sidepanel.html" },
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  },
  // Abre o side panel ao clicar no ícone da extensão.
  runner: {
    startUrls: ["https://web.whatsapp.com"],
  },
});
