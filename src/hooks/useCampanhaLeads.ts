import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

export type StatusLeadCampanha =
  | "frio"
  | "contatado"
  | "em_conversa"
  | "aquecido"
  | "quente"
  | "convertido"
  | "sem_resposta"
  | "sem_whatsapp"
  | "descartado";

export interface CampanhaLead {
  id: string;
  campanha_id: string;
  lead_id: string;
  strategy_id?: string | null;
  status: StatusLeadCampanha;
  data_primeiro_contato: string | null;
  data_ultimo_contato: string | null;
  data_status: string | null;
  tentativas: number;
  canal_atual: string | null;
  conversa_id: string | null;
  metadados: Record<string, unknown>;
  created_at: string;
  unread_messages: number;
  last_incoming_at: string | null;
  // colaboração: quem está/assumiu o lead (UX multi-pessoa na mesma campanha)
  assumido_por?: string | null;
  assumido_em?: string | null;
  humano_assumiu?: boolean | null;
  motivo_perdido?: string | null;
  strategy?: {
    id: string;
    nome: string;
    status: string;
  } | null;
  lead?: {
    id: string;
    nome: string;
    phone_e164: string | null;
    email: string | null;
    uf: string | null;
    cidade: string | null;
    especialidade: string | null;
    tags: string[] | null;
  };
}

export function useCampanhaLeads(campanhaId?: string) {
  const queryClient = useQueryClient();
  const channelIdRef = useRef(`campanha-leads-realtime-${crypto.randomUUID()}`);
  const query = useQuery({
    queryKey: ["campanha-leads", campanhaId],
    enabled: !!campanhaId,
    // O Realtime pode perder eventos quando a aba fica em segundo plano ou a
    // conexão websocket é retomada. A reconciliação curta mantém o Kanban fiel
    // ao banco sem exigir que a operadora atualize a página manualmente.
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      // PostgREST limita a 1000 linhas/request. Campanhas grandes (ex: import com 3.9k leads)
      // ficavam capadas em 1000 no Kanban. Paginar até trazer todas (cap de segurança 20k).
      const PAGE = 1000;
      const CAP = 20000;
      let all: CampanhaLead[] = [];
      for (let from = 0; from < CAP; from += PAGE) {
        const { data, error } = await supabase
          .from("campanha_leads")
          .select(
            "*, strategy:strategy_id(id, nome, status), lead:lead_id(id, nome, phone_e164, email, uf, cidade, especialidade, tags)"
          )
          .eq("campanha_id", campanhaId!)
          .order("data_status", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data || []) as CampanhaLead[];
        all = all.concat(chunk);
        if (chunk.length < PAGE) break;
      }
      const activityByLead = new Map<string, { unread_messages: number; last_incoming_at: string | null }>();
      for (let from = 0; from < CAP; from += PAGE) {
        const { data, error } = await supabase
          .from("vw_acompanhamento_kanban_full" as never)
          .select("campanha_lead_id, unread_messages, last_incoming_at")
          .eq("campanha_id", campanhaId!)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data || []) as Array<{
          campanha_lead_id: string;
          unread_messages: number | null;
          last_incoming_at: string | null;
        }>;
        chunk.forEach((item) => activityByLead.set(item.campanha_lead_id, {
          unread_messages: item.unread_messages || 0,
          last_incoming_at: item.last_incoming_at,
        }));
        if (chunk.length < PAGE) break;
      }

      return all.map((lead) => ({
        ...lead,
        unread_messages: activityByLead.get(lead.id)?.unread_messages || 0,
        last_incoming_at: activityByLead.get(lead.id)?.last_incoming_at || null,
      }));
    },
  });

  useEffect(() => {
    if (!campanhaId) return;
    const channel = supabase
      .channel(`${channelIdRef.current}-${campanhaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campanha_leads", filter: `campanha_id=eq.${campanhaId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sigzap_conversations" }, () => {
        // A conversa não guarda campanha_id; limitamos a invalidação ao cache
        // da campanha aberta para a bolinha aparecer sem atualizar a página.
        void queryClient.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [campanhaId, queryClient]);

  return query;
}

export function useCampanhaLeadsByStatus(campanhaId?: string) {
  const { data: leads = [], ...rest } = useCampanhaLeads(campanhaId);

  const byStatus = leads.reduce(
    (acc, lead) => {
      if (!acc[lead.status]) acc[lead.status] = [];
      acc[lead.status].push(lead);
      return acc;
    },
    {} as Record<StatusLeadCampanha, CampanhaLead[]>
  );

  return { byStatus, leads, ...rest };
}

export function useAdicionarLeadsCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanha_id: string;
      strategy_id?: string;
      limite?: number;
      somente_perdidos?: boolean;
    }) => {
      if (input.somente_perdidos && !input.strategy_id) {
        throw new Error("Selecione uma estratégia para reaproveitar perdidos.");
      }
      const result = input.somente_perdidos
        ? await supabase.rpc(
            "selecionar_perdidos_elegiveis" as never,
            {
              p_campanha_id: input.campanha_id,
              p_strategy_id: input.strategy_id,
              p_limite: input.limite || 50,
            } as never,
          )
        : input.strategy_id
        ? await supabase.rpc(
            "selecionar_leads_estrategia" as never,
            {
              p_campanha_id: input.campanha_id,
              p_strategy_id: input.strategy_id,
              p_limite: input.limite || 50,
            } as never,
          )
        : await supabase.rpc("selecionar_leads_campanha", {
            p_campanha_id: input.campanha_id,
            p_limite: input.limite || 50,
          });
      const { data, error } = result as {
        data: Array<{ lead_id: string }> | null;
        error: Error | null;
      };
      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("Nenhum lead disponível para os filtros desta campanha");
      }

      const rows = data.map((lead) => ({
        campanha_id: input.campanha_id,
        lead_id: lead.lead_id,
        status: "frio" as const,
        ...(input.strategy_id ? { strategy_id: input.strategy_id } : {}),
      }));

      const { error: insertError } = await supabase
        .from("campanha_leads")
        .insert(rows as never);
      if (insertError) throw insertError;

      return data.length;
    },
    onSuccess: (count, input) => {
      qc.invalidateQueries({ queryKey: ["campanha-leads", input.campanha_id] });
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success(
        input.somente_perdidos
          ? `${count} perdidos elegíveis reaproveitados`
          : `${count} leads adicionados à campanha`,
      );
    },
    onError: (error: unknown) => {
      const msg = messageFromError(error);
      if (msg.includes("Lead já está ativo em outra proposta")) {
        toast.error(
          "Um ou mais leads já estão ativos em outra proposta desta campanha. Encerre o vínculo atual antes de adicioná-los aqui."
        );
      } else {
        toast.error(msg || "Erro ao adicionar leads");
      }
    },
  });
}

// Edita as tags de um lead (quick-select nos cards). campanhaId só pra invalidar o cache certo.
export function useUpdateLeadTags(campanhaId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lead_id: string; tags: string[] }) => {
      const { error } = await supabase.rpc(
        "set_lead_controlled_tags" as never,
        { p_lead_id: input.lead_id, p_tags: input.tags } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-leads", campanhaId] });
    },
    onError: (error: unknown) => toast.error(`Erro ao salvar tags: ${messageFromError(error)}`),
  });
}

export function useAtualizarStatusLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanha_id: string;
      lead_id: string;
      novo_status: StatusLeadCampanha;
      canal?: string;
    }) => {
      const { error } = await supabase.rpc("atualizar_status_lead_campanha", {
        p_campanha_id: input.campanha_id,
        p_lead_id: input.lead_id,
        p_novo_status: input.novo_status,
        p_canal: input.canal || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["campanha-leads", input.campanha_id] });
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
    },
    onError: (error: unknown) => toast.error(`Erro ao atualizar status: ${messageFromError(error)}`),
  });
}

export type MotivoSaidaCampanha =
  | "sem_whatsapp"
  | "aposentado"
  | "distancia"
  | "nao_contatar"
  | "contato_invalido"
  | "indisponivel_agora"
  | "sem_interesse_oportunidade";

export function useClassificarSaidaCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanha_id: string;
      lead_id: string;
      motivo: MotivoSaidaCampanha;
      observacao?: string;
    }) => {
      const { data, error } = await supabase.rpc("classificar_saida_campanha" as never, {
        p_campanha_id: input.campanha_id,
        p_lead_id: input.lead_id,
        p_motivo: input.motivo,
        p_observacao: input.observacao || null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["campanha-leads", input.campanha_id] });
      queryClient.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-campanhas"] });
      toast.success(input.motivo === "sem_whatsapp"
        ? "Médico movido para Sem WhatsApp"
        : "Saída da campanha registrada");
    },
    onError: (error: Error) => toast.error(`Erro ao classificar saída: ${error.message}`),
  });
}
