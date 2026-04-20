import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusProposta = "a_contactar" | "em_aberto" | "contactado" | "fechado_proposta";

export interface LeadStatusPropostaRow {
  campanha_proposta_id: string;
  lead_id: string;
  status_proposta: StatusProposta;
  ultima_decisao_em: string | null;
  ultimo_motivo: string | null;
  bloqueado_blacklist: boolean;
  bloqueado_temp: boolean;
  bloqueado_janela_7d: boolean;
  ultimo_disparo: string | null;
}

export function useLeadStatusProposta(campanhaPropostaId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead-status-proposta", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_lead_status_por_proposta")
        .select("*")
        .eq("campanha_proposta_id", campanhaPropostaId!);
      if (error) throw error;
      const map = new Map<string, LeadStatusPropostaRow>();
      for (const r of ((data || []) as unknown as LeadStatusPropostaRow[])) {
        map.set(r.lead_id, r);
      }
      return map;
    },
  });
}
