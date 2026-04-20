import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadAContactar {
  lead_id: string;
  nome: string | null;
  phone_e164: string | null;
  telefones_adicionais: string[] | null;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
}

export function useLeadsAContactar(campanhaPropostaId: string | null | undefined) {
  return useQuery({
    queryKey: ["leads-a-contactar", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async (): Promise<LeadAContactar[]> => {
      // 1. Pega status_proposta dos leads
      const { data: statusRows, error: e1 } = await (supabase as any)
        .from("vw_lead_status_por_proposta")
        .select("lead_id, status_proposta")
        .eq("campanha_proposta_id", campanhaPropostaId!)
        .eq("status_proposta", "a_contactar");
      if (e1) throw e1;

      let leadIds = Array.from(new Set((statusRows || []).map((r: any) => r.lead_id)));

      // Fallback: quando a proposta ainda não materializou status por canal,
      // usa os leads da lista vinculada e trata todos como "a contactar".
      if (leadIds.length === 0) {
        const { data: propostaRow, error: eLista } = await supabase
          .from("campanha_propostas")
          .select("lista_id")
          .eq("id", campanhaPropostaId!)
          .maybeSingle();

        if (eLista) throw eLista;

        if (propostaRow?.lista_id) {
          const { data: listaItems, error: eItems } = await supabase
            .from("disparo_lista_itens")
            .select("lead_id")
            .eq("lista_id", propostaRow.lista_id);

          if (eItems) throw eItems;
          leadIds = Array.from(new Set((listaItems || []).map((item: any) => item.lead_id)));
        }
      }

      if (leadIds.length === 0) return [];

      // 2. Busca dados dos leads
      const { data: leads, error: e2 } = await supabase
        .from("leads")
        .select("id, nome, phone_e164, telefones_adicionais, especialidade, uf, cidade")
        .in("id", leadIds)
        .is("merged_into_id", null);
      if (e2) throw e2;

      return (leads || []).map((l: any) => ({
        lead_id: l.id,
        nome: l.nome,
        phone_e164: l.phone_e164,
        telefones_adicionais: l.telefones_adicionais,
        especialidade: l.especialidade,
        uf: l.uf,
        cidade: l.cidade,
      }));
    },
  });
}