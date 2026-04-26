import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConversaOrigem = "manual" | "massa" | "trafego_pago" | "inbound";

export interface OrigemInfo {
  origem: ConversaOrigem;
  campanha_nome: string | null;
  campanha_proposta_id: string | null;
  ultimo_envio_at: string | null;
}

export function useSigzapConversationOrigem(conversationIds: string[]) {
  const ids = [...new Set(conversationIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["sigzap-conversation-origem", ids],
    queryFn: async (): Promise<Record<string, OrigemInfo>> => {
      if (ids.length === 0) return {};
      const { data, error } = await (supabase as any)
        .from("vw_sigzap_conversation_origem")
        .select("conversation_id, origem, campanha_nome, campanha_proposta_id, ultimo_envio_at")
        .in("conversation_id", ids);
      if (error) throw error;
      const map: Record<string, OrigemInfo> = {};
      (data || []).forEach((r: any) => {
        map[r.conversation_id] = {
          origem: (r.origem || "inbound") as ConversaOrigem,
          campanha_nome: r.campanha_nome,
          campanha_proposta_id: r.campanha_proposta_id,
          ultimo_envio_at: r.ultimo_envio_at,
        };
      });
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
