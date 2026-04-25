import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type EtapaAcompanhamento = "quente" | "em_analise" | "aprovado" | "na_escala" | "perdido";

export interface ValidacaoItem {
  ok: boolean;
  por: string | null;
  em: string | null;
  obs: string;
}

export interface AcompanhamentoLead {
  campanha_lead_id: string;
  campanha_id: string;
  lead_id: string;
  etapa_acompanhamento: EtapaAcompanhamento;
  status: string;
  assumido_por: string | null;
  assumido_em: string | null;
  validacoes: Record<string, ValidacaoItem>;
  validacoes_ok: number;
  resultado_final: string | null;
  motivo_perdido: string | null;
  data_primeiro_contato: string | null;
  data_ultimo_contato: string | null;
  data_status: string | null;
  updated_at: string | null;
  msgs_total: number;
  lead_nome: string;
  lead_phone: string | null;
  lead_especialidade: string | null;
  lead_cidade: string | null;
  lead_uf: string | null;
  lead_classificacao: string | null;
  lead_opt_out: boolean;
  campanha_nome: string;
  handoff_nome: string | null;
  servico: string | null;
  servico_cidade: string | null;
  assumido_por_nome: string | null;
  assumido_por_email: string | null;
  perfil_resumo: string | null;
  perfil_modalidade: string[] | null;
  perfil_valor_min: number | null;
  perfil_confianca: number | null;
}

export type FiltroAcompanhamento = "todos" | "minha_fila" | "sem_dono" | "aguarda_maikon" | "aguarda_equipe";

export function useAcompanhamentoLeads(filtro: FiltroAcompanhamento = "todos") {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["acompanhamento-leads"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_acompanhamento_kanban")
        .select("*")
        .order("data_status", { ascending: false });
      if (error) throw error;
      return (data || []) as AcompanhamentoLead[];
    },
  });

  // Realtime: atualizações em campanha_leads invalidam a lista
  useEffect(() => {
    const channel = (supabase as any)
      .channel("acompanhamento-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campanha_leads" },
        () => qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campanha_leads" },
        () => qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] }),
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [qc]);

  const filtrados = useMemo(() => {
    if (filtro === "minha_fila") return leads.filter((l) => l.assumido_por === user?.id);
    if (filtro === "sem_dono") return leads.filter((l) => l.assumido_por === null);
    if (filtro === "aguarda_maikon")
      return leads.filter((l) => !l.validacoes?.validacao_maikon?.ok);
    if (filtro === "aguarda_equipe")
      return leads.filter((l) => !l.validacoes?.validacao_equipe?.ok);
    return leads;
  }, [leads, filtro, user?.id]);

  const counts = useMemo(() => {
    return {
      total: leads.length,
      minha_fila: leads.filter((l) => l.assumido_por === user?.id).length,
      sem_dono: leads.filter((l) => l.assumido_por === null).length,
      aguarda_maikon: leads.filter((l) => !l.validacoes?.validacao_maikon?.ok).length,
      aguarda_equipe: leads.filter((l) => !l.validacoes?.validacao_equipe?.ok).length,
    };
  }, [leads, user?.id]);

  const porEtapa = useMemo(() => {
    const grupos: Record<EtapaAcompanhamento, AcompanhamentoLead[]> = {
      quente: [],
      em_analise: [],
      aprovado: [],
      na_escala: [],
      perdido: [],
    };
    for (const l of filtrados) {
      if (grupos[l.etapa_acompanhamento]) grupos[l.etapa_acompanhamento].push(l);
    }
    return grupos;
  }, [filtrados]);

  return { leads: filtrados, todosLeads: leads, isLoading, counts, porEtapa };
}

// ── Mutações (RPCs) ──────────────────────────────────────────

export function useAssumirLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campanha_lead_id: string) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_assumir", {
        p_campanha_lead_id: campanha_lead_id,
        p_force: false,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Falha ao assumir");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success("Lead assumido");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useValidarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      campanha_lead_id: string;
      item: string;
      ok: boolean;
      obs?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_validar", {
        p_campanha_lead_id: params.campanha_lead_id,
        p_item: params.item,
        p_ok: params.ok,
        p_obs: params.obs || null,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Falha na validação");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] }),
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useMoverEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { campanha_lead_id: string; etapa: EtapaAcompanhamento }) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_mover_etapa", {
        p_campanha_lead_id: params.campanha_lead_id,
        p_etapa: params.etapa,
      });
      if (error) throw error;
      if (data?.ok === false) {
        const errMsg =
          data.error === "validacoes_incompletas"
            ? `Marque as 4 validações primeiro (atual: ${data.validacoes_ok}/4)`
            : data.error === "requer_aprovado_antes"
            ? "Lead precisa estar em Aprovado antes de ir pra Escala"
            : data.error;
        throw new Error(errMsg);
      }
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success(`Movido pra ${labelEtapa(data.etapa)}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAprovarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campanha_lead_id: string) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_aprovar", {
        p_campanha_lead_id: campanha_lead_id,
      });
      if (error) throw error;
      if (data?.ok === false) {
        const errMsg =
          data.error === "validacoes_incompletas"
            ? `Marque as 4 validações primeiro (atual: ${data.validacoes_ok}/4)`
            : data.error;
        throw new Error(errMsg);
      }
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success(
        data.ewerton_propagado
          ? "Lead aprovado e convertido no CRM"
          : "Lead aprovado (já estava convertido no CRM)",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useMarcarPerdido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { campanha_lead_id: string; motivo: string }) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_marcar_perdido", {
        p_campanha_lead_id: params.campanha_lead_id,
        p_motivo: params.motivo,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Falha ao marcar perdido");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success("Lead marcado como perdido");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function labelEtapa(etapa: EtapaAcompanhamento): string {
  const map: Record<EtapaAcompanhamento, string> = {
    quente: "Quente",
    em_analise: "Em análise",
    aprovado: "Aprovado",
    na_escala: "Na escala",
    perdido: "Perdido",
  };
  return map[etapa] || etapa;
}

export const VALIDACAO_ITEMS = [
  { key: "contato_comercial", label: "Contato comercial pós-quente", desc: "O responsável já falou com o médico após ele virar quente" },
  { key: "docs_recebidos", label: "Documentos recebidos", desc: "CRM, RQE, comprovantes solicitados" },
  { key: "validacao_maikon", label: "Validação Maikon (clínica)", desc: "Análise clínica do perfil pelo Maikon" },
  { key: "validacao_equipe", label: "Validação equipe (processos)", desc: "Verificação de processos jurídicos / busca / compliance" },
] as const;
