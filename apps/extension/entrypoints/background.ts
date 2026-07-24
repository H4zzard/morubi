// Background: abre o Side Panel ao clicar no ícone e garante que o content
// script esteja presente nas abas de atendimento.
export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[morubi] sidePanel behavior:", err));

  // O Chrome só injeta content script em páginas carregadas DEPOIS da
  // instalação/atualização da extensão. Sem isto, quem já estava com o Kentro
  // ou o WhatsApp Web aberto vê o painel preso em "abra uma conversa" até
  // apertar F5 — parece bug do produto, mas é só a injeção que faltou.
  void injectIntoOpenTabs();
  chrome.runtime.onInstalled.addListener(() => void injectIntoOpenTabs());
});

/** (Re)injeta os content scripts declarados no manifest nas abas já abertas. */
async function injectIntoOpenTabs() {
  const scripts = chrome.runtime.getManifest().content_scripts ?? [];

  for (const script of scripts) {
    const matches = script.matches ?? [];
    const files = script.js ?? [];
    if (matches.length === 0 || files.length === 0) continue;

    let tabs: chrome.tabs.Tab[] = [];
    try {
      tabs = await chrome.tabs.query({ url: matches });
    } catch (err) {
      console.error("[morubi] falha ao listar abas:", err);
      continue;
    }

    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
      } catch {
        // Aba protegida (chrome://, web store) ou fechada no meio: ignorar.
      }
    }
  }
}
