// Registry de adaptadores — hoje com um item só (WhatsApp Web).
// O content script escolhe o que casa com a URL atual. Único ponto que sabe
// sobre canais. Adicionar um canal novo = criar o arquivo do adaptador +
// incluí-lo aqui na lista; content/index.ts e wxt.config.ts não mudam.
import type { ChannelAdapter } from "./types";
import { whatsappWebAdapter } from "./whatsapp-web";
import { kentroAdapter } from "./kentro";

const ADAPTERS: ChannelAdapter[] = [whatsappWebAdapter, kentroAdapter];

export function resolveAdapter(url: string): ChannelAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

/** Union de todos os host patterns dos adaptadores — usado no `matches` do content script. */
export const MATCHED_HOST_PATTERNS: string[] = ADAPTERS.flatMap((a) => a.hostPatterns);
