// ============================================================================
// Utilidades de leitura de DOM compartilhadas pelos adaptadores de chat.
// Centraliza o que é comum a QUALQUER CRM baseado em conversa (Kentro, Z-Pro,
// genérico...), para não reimplementar em cada arquivo.
// ============================================================================

export function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

/** Hash estável (djb2) — id de mensagem sem id próprio, fingerprint de conversa. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Formata "5587996612518" -> "+55 87 99661-2518" (cai pro bruto se não bater). */
export function formatPhone(digits: string): string {
  const m = digits.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return `+${digits}`;
  const [, ddi, ddd, part1, part2] = m;
  return `+${ddi} ${ddd} ${part1}-${part2}`;
}

// --- Áudio -----------------------------------------------------------------

/**
 * Mensagem de voz? Não basta olhar a tag <audio>: muitos players só a criam ao
 * apertar play. Reconhecemos também a "cara" do player (duração, tamanho do
 * arquivo, botão de play).
 */
export function looksLikeAudio(row: Element): boolean {
  if (row.querySelector("audio")) return true;
  if (
    row.querySelector(
      '[data-icon*="play" i], [aria-label*="play" i], [aria-label*="reproduzir" i], app-custom-audio',
    )
  ) {
    return true;
  }
  const text = textOf(row);
  if (/\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(text)) return true; // 00:00 / 01:22
  if (/\d+([.,]\d+)?\s*(KB|MB)\b/i.test(text)) return true; // 189.45 KB
  return false;
}

/**
 * URL do arquivo de áudio. Cuidado: alguns CRMs (Kentro) põem o src num
 * <source> filho, não no <audio> — por isso olhamos os dois.
 */
export function audioSourceUrl(row: Element): string | null {
  const audioEl = row.querySelector("audio");
  if (!audioEl) return null;
  const direct = audioEl.getAttribute("src");
  if (direct) return direct;
  return audioEl.querySelector("source")?.getAttribute("src") ?? null;
}

// --- Limpeza de "cromo" (interface, não conteúdo) --------------------------

/** Trechos que são interface do player/UI, não o que a pessoa falou. */
const CHROME_PATTERNS = [
  /^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/, // 00:04  ou  00:00 / 00:04
  /^\d+([.,]\d+)?\s*(KB|MB)$/i, // 23.55 KB
  /^\d+(\.\d+)?x$/i, // 1x (velocidade do áudio)
];

export function isChromeText(t: string): boolean {
  return CHROME_PATTERNS.some((re) => re.test(t.trim()));
}

/**
 * Texto "limpo" de um balão: remove players de áudio e junta só os pedaços que
 * não são cromo de interface. Preserva a ordem visual das falas.
 */
export function cleanBubbleText(bubble: Element): string {
  const clone = bubble.cloneNode(true) as Element;
  clone.querySelectorAll("audio, app-custom-audio, [contenteditable]").forEach((el) => el.remove());

  const parts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = (node.textContent ?? "").trim();
    if (t && !isChromeText(t)) parts.push(t);
    node = walker.nextNode();
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// --- Timestamp (best-effort, vários formatos) ------------------------------

const MONTHS_PT: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

/** Extrai data/hora de um texto solto, em vários formatos comuns de CRM. */
export function parseTimeLoose(text: string): string | null {
  // DD/MM/AAAA [·|,| ] HH:MM[:SS]
  const full = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]{0,3}(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (full) {
    const [, dd, MM, yyyy, hh, mm, ss] = full;
    const d = new Date(+yyyy, +MM - 1, +dd, +hh, +mm, +(ss ?? 0));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // "10 jun HH:MM" (data por extenso curta)
  const named = text.match(/(\d{1,2})\s+([a-z]{3})\.?[^\d]{0,3}(\d{1,2}):(\d{2})/i);
  if (named && MONTHS_PT[named[2]!.toLowerCase()] !== undefined) {
    const now = new Date();
    const d = new Date(now.getFullYear(), MONTHS_PT[named[2]!.toLowerCase()]!, +named[1]!, +named[3]!, +named[4]!);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}
