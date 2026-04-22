import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusProposta = "a_contactar" | "contactado" | "fechado_proposta";

export interface LeadStatusPropostaRow {
  campanha_proposta_id: string;
  lead_id: string;
  status_proposta: StatusProposta;
  tem_raia_aberta: boolean;
  ultima_decisao_em: string | null;
  ultimo_motivo: string | null;
  bloqueado_blacklist: boolean;
  bloqueado_temp: boolean;
  bloqueado_janela_7d: boolean;
  ultimo_disparo: string | null;
}

export function useLeadStatusProposta(campanhaPropostaId: string | null | undefined) {
  const qc = useQueryClient();

  const carregarFallbackPorCanais = async (id: string) => {
    const { data: canais, error: canaisError } = await supabase
      .from("campanha_proposta_lead_canais")
      .select("id, lead_id, entrou_em, status_final, motivo_saida")
      .eq("campanha_proposta_id", id)
      .order("entrou_em", { ascending: true });

    if (canaisError) throw canaisError;

    const map = new Map<string, LeadStatusPropostaRow>();

    for (const canal of (canais || []) as Array<{
      id: string;
      lead_id: string;
      entrou_em: string;
      status_final: string;
      motivo_saida: string | null;
    }>) {
      const atual = map.get(canal.lead_id);

      if (!atual) {
        map.set(canal.lead_id, {
          campanha_proposta_id: id,
          lead_id: canal.lead_id,
          status_proposta: canal.status_final === "fechado" ? "fechado_proposta" : "contactado",
          tem_raia_aberta: canal.status_final === "aberto",
          ultima_decisao_em: canal.status_final === "aberto" ? null : canal.entrou_em,
          ultimo_motivo: canal.status_final === "aberto" ? null : canal.motivo_saida,
          bloqueado_blacklist: false,
          bloqueado_temp: false,
          bloqueado_janela_7d: false,
          ultimo_disparo: null,
        });
        continue;
      }

      const temRaiaAberta = atual.tem_raia_aberta || canal.status_final === "aberto";
      const fechadoProposta =
        atual.status_proposta === "fechado_proposta" || canal.status_final === "fechado";

      map.set(canal.lead_id, {
        ...atual,
        status_proposta: fechadoProposta ? "fechado_proposta" : "contactado",
        tem_raia_aberta: temRaiaAberta,
        ultima_decisao_em: canal.status_final === "aberto" ? atual.ultima_decisao_em : canal.entrou_em,
        ultimo_motivo: canal.status_final === "aberto" ? atual.ultimo_motivo : canal.motivo_saida,
      });
    }

    return map;
  };

  useEffect(() => {
    if (!campanhaPropostaId) return;
    const channel = supabase
      .channel(`lead-status-proposta-${campanhaPropostaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campanha_proposta_lead_canais", filter: `campanha_proposta_id=eq.${campanhaPropostaId}` },
        () => qc.invalidateQueries({ queryKey: ["lead-status-proposta", campanhaPropostaId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "disparos_contatos", filter: `campanha_proposta_id=eq.${campanhaPropostaId}` },
        () => qc.invalidateQueries({ queryKey: ["lead-status-proposta", campanhaPropostaId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [campanhaPropostaId, qc]);

  return useQuery({
    queryKey: ["lead-status-proposta", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 15000,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_lead_status_por_proposta")
        .select("*")
        .eq("campanha_proposta_id", campanhaPropostaId!);

      if (error) {
        if (error.code === "42501") {
          return carregarFallbackPorCanais(campanhaPropostaId!);
        }
        throw error;
      }

      const map = new Map<string, LeadStatusPropostaRow>();
      for (const r of ((data || []) as unknown as LeadStatusPropostaRow[])) {
        map.set(r.lead_id, r);
      }
      return map;
    },
  });
}
