// Registry de adaptadores — hoje com um item só (WhatsApp Web).
// O content script escolhe o que casa com a URL atual. Único ponto que sabe
// sobre canais. Adicionar um canal novo = criar o arquivo do adaptador +
// incluí-lo aqui na lista; content/index.ts e wxt.config.ts não mudam.
import type { ChannelAdapter } from "./types";
import { whatsappWebAdapter } from "./whatsapp-web";
import { kentroAdapter } from "./kentro";
import { genericChatAdapter } from "./generic-chat";

// Ordem importa: adaptadores ESPECÍFICOS (seletores afinados) primeiro; o
// genérico é o ÚLTIMO, como fallback para CRMs que não têm adaptador próprio.
const ADAPTERS: ChannelAdapter[] = [whatsappWebAdapter, kentroAdapter, genericChatAdapter];

export function resolveAdapter(url: string): ChannelAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

/** Union de todos os host patterns dos adaptadores — usado no `matches` do content script. */
export const MATCHED_HOST_PATTERNS: string[] = ADAPTERS.flatMap((a) => a.hostPatterns);
