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

const PAGE_SIZE = 1000;

async function paginateRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  let from = 0;
  const acc: T[] = [];

  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    acc.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return acc;
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function carregarLeadIdsDaProposta(campanhaPropostaId: string) {
  const { data: propostaRow, error } = await supabase
    .from("campanha_propostas")
    .select("lista_id")
    .eq("id", campanhaPropostaId)
    .maybeSingle();

  if (error) throw error;
  if (!propostaRow?.lista_id) return [] as string[];

  const itens = await paginateRows<{ lead_id: string | null }>((from, to) =>
    supabase
      .from("disparo_lista_itens")
      .select("lead_id")
      .eq("lista_id", propostaRow.lista_id)
      .range(from, to),
  );

  return Array.from(new Set(itens.map((item) => item.lead_id).filter(Boolean))) as string[];
}

async function aplicarSinaisDeContato(
  campanhaPropostaId: string,
  baseMap: Map<string, LeadStatusPropostaRow>,
) {
  const leadIdsDaLista = await carregarLeadIdsDaProposta(campanhaPropostaId);
  const leadIds = Array.from(new Set([...baseMap.keys(), ...leadIdsDaLista]));

  if (leadIds.length === 0) return baseMap;

  const contactMap = new Map<string, string | null>();
  const leadIdChunks = chunk(leadIds, 200);

  for (const ids of leadIdChunks) {
    const { data } = await (supabase as any)
      .from("disparo_manual_envios")
      .select("lead_id, created_at, status")
      .eq("campanha_proposta_id", campanhaPropostaId)
      .in("lead_id", ids);

    for (const envio of data || []) {
      if (envio.status && envio.status !== "enviado") continue;
      const prev = contactMap.get(envio.lead_id);
      if (!prev || new Date(envio.created_at) > new Date(prev)) {
        contactMap.set(envio.lead_id, envio.created_at);
      }
    }
  }

  const conversas: Array<{ id: string; lead_id: string }> = [];
  for (const ids of leadIdChunks) {
    const { data } = await (supabase as any)
      .from("sigzap_conversations")
      .select("id, lead_id")
      .in("lead_id", ids);
    if (data) conversas.push(...data);
  }

  const convIdToLead = new Map<string, string>();
  for (const conversa of conversas) convIdToLead.set(conversa.id, conversa.lead_id);

  const convIds = Array.from(convIdToLead.keys());
  for (const ids of chunk(convIds, 200)) {
    const { data } = await (supabase as any)
      .from("sigzap_messages")
      .select("conversation_id, sent_at, created_at, from_me")
      .in("conversation_id", ids)
      .eq("from_me", true);

    for (const msg of data || []) {
      const leadId = convIdToLead.get(msg.conversation_id);
      if (!leadId) continue;
      const ts = msg.sent_at || msg.created_at || null;
      const prev = contactMap.get(leadId);
      if (!prev || (ts && new Date(ts) > new Date(prev))) {
        contactMap.set(leadId, ts);
      }
    }
  }

  for (const ids of leadIdChunks) {
    const { data } = await (supabase as any)
      .from("disparos_contatos")
      .select("lead_id, updated_at, status")
      .eq("campanha_proposta_id", campanhaPropostaId)
      .in("lead_id", ids)
      .in("status", ["3-TRATANDO", "4-ENVIADO"]);

    for (const row of data || []) {
      const prev = contactMap.get(row.lead_id);
      if (!prev || (row.updated_at && new Date(row.updated_at) > new Date(prev))) {
        contactMap.set(row.lead_id, row.updated_at);
      }
    }
  }

  for (const [leadId, ts] of contactMap.entries()) {
    const atual = baseMap.get(leadId);
    if (atual?.status_proposta === "fechado_proposta") continue;

    baseMap.set(leadId, {
      campanha_proposta_id: campanhaPropostaId,
      lead_id: leadId,
      status_proposta: "contactado",
      tem_raia_aberta: atual?.tem_raia_aberta ?? false,
      ultima_decisao_em: atual?.ultima_decisao_em ?? ts ?? null,
      ultimo_motivo: atual?.ultimo_motivo ?? null,
      bloqueado_blacklist: atual?.bloqueado_blacklist ?? false,
      bloqueado_temp: atual?.bloqueado_temp ?? false,
      bloqueado_janela_7d: atual?.bloqueado_janela_7d ?? false,
      ultimo_disparo: atual?.ultimo_disparo ?? ts ?? null,
    });
  }

  return baseMap;
}

export function useLeadStatusProposta(campanhaPropostaId: string | null | undefined) {
  const qc = useQueryClient();

  const carregarFallbackPorCanais = async (id: string) => {
    const canais = await paginateRows<{
      id: string;
      lead_id: string;
      entrou_em: string;
      status_final: string;
      motivo_saida: string | null;
    }>((from, to) =>
      supabase
        .from("campanha_proposta_lead_canais")
        .select("id, lead_id, entrou_em, status_final, motivo_saida")
        .eq("campanha_proposta_id", id)
        .order("entrou_em", { ascending: true })
        .range(from, to),
    );

    const map = new Map<string, LeadStatusPropostaRow>();

    for (const canal of canais) {
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

    return aplicarSinaisDeContato(id, map);
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
      const rows = await paginateRows<LeadStatusPropostaRow>((from, to) =>
        (supabase as any)
          .from("vw_lead_status_por_proposta")
          .select("*")
          .eq("campanha_proposta_id", campanhaPropostaId!)
          .range(from, to),
      ).catch(async (error) => {
        if (error?.code === "42501") {
          return null;
        }
        throw error;
      });

      if (rows === null) {
        return carregarFallbackPorCanais(campanhaPropostaId!);
      }

      const map = new Map<string, LeadStatusPropostaRow>();
      for (const r of rows) {
        map.set(r.lead_id, r);
      }
      return aplicarSinaisDeContato(campanhaPropostaId!, map);
    },
  });
}
