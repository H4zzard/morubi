// Background: abre o Side Panel ao clicar no ícone da extensão.
export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[morubi] sidePanel behavior:", err));
});
