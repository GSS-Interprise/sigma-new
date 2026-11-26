import { useEffect, useMemo, useRef } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EtapaAcompanhamento = "quente" | "em_analise" | "aprovado" | "na_escala" | "perdido";
export type EtapaCrm =
  | "novo"
  | "contatado"
  | "respondeu"
  | "em_atendimento"
  | "qualificado"
  | "encaminhado"
  | "convertido"
  | "perdido";

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
  strategy_id: string | null;
  strategy_name: string | null;
  strategy_status: string | null;
  etapa_acompanhamento: EtapaAcompanhamento;
  etapa_crm: EtapaCrm;
  status: string;
  assumido_por: string | null;
  assumido_em: string | null;
  humano_assumiu: boolean;
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
  tipo_envio: string | null;
  unread_messages: number;
  last_incoming_at: string | null;
}

export type FiltroAcompanhamento = "todos" | "minha_fila" | "sem_dono" | "aguarda_maikon" | "aguarda_equipe";

export type ContagemFiltros = Record<FiltroAcompanhamento, number>;

export interface QuenteSemDono {
  campanha_lead_id: string;
  lead_nome: string;
  campanha_nome: string;
  data_status: string;
}

interface QuadroResposta {
  filtros: ContagemFiltros;
  colunas: Partial<Record<EtapaCrm, number>>;
  leads: AcompanhamentoLead[];
  quentes_sem_dono: QuenteSemDono[];
}

/** Cards por coluna na primeira carga; o resto vem por "Carregar mais" (useAcompanhamentoColunaMais). */
export const CARDS_POR_COLUNA = 25;

const ETAPAS_CRM: EtapaCrm[] = [
  "novo",
  "contatado",
  "respondeu",
  "em_atendimento",
  "qualificado",
  "encaminhado",
  "convertido",
  "perdido",
];

function porEtapaVazio(): Record<EtapaCrm, AcompanhamentoLead[]> {
  return Object.fromEntries(ETAPAS_CRM.map((e) => [e, []])) as unknown as Record<EtapaCrm, AcompanhamentoLead[]>;
}

/**
 * Aba Quentes (IA). Até 26/11/2026 este hook baixava a view vw_acompanhamento_kanban inteira (10.696 linhas, 11
 * páginas em fila, ~15 s de tela vazia) e contava tudo no navegador. Agora a RPC acompanhamento_quadro faz busca,
 * filtro e contagens no servidor numa passada e devolve só os primeiros CARDS_POR_COLUNA de cada coluna.
 * A chave começa com "acompanhamento-leads" de propósito: as mutações e outras telas invalidam esse prefixo.
 */
export function useAcompanhamentoQuadro(filtro: FiltroAcompanhamento, busca: string) {
  const qc = useQueryClient();
  const termo = busca.trim();

  const query = useQuery({
    queryKey: ["acompanhamento-leads", "quadro", filtro, termo],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<QuadroResposta> => {
      const { data, error } = await (supabase as any).rpc("acompanhamento_quadro", {
        p_filtro: filtro,
        p_busca: termo || null,
        p_por_coluna: CARDS_POR_COLUNA,
      });
      if (error) throw error;
      return data as QuadroResposta;
    },
  });

  // Realtime: mudança em campanha_leads ou numa conversa recarrega o quadro. Com debounce: um disparo em massa
  // gera centenas de UPDATEs seguidos e cada recarga custa ~1 s no servidor.
  const channelIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `acompanhamento-realtime-${crypto.randomUUID()}`
      : `acompanhamento-realtime-${Math.random().toString(36).slice(2)}`
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] }), 3000);
    };
    const channel = (supabase as any)
      .channel(channelIdRef.current)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campanha_leads" }, recarregar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campanha_leads" }, recarregar)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sigzap_conversations" }, recarregar)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      (supabase as any).removeChannel(channel);
    };
  }, [qc]);

  const porEtapaCrm = useMemo(() => {
    const grupos = porEtapaVazio();
    for (const lead of query.data?.leads ?? []) grupos[lead.etapa_crm]?.push(lead);
    return grupos;
  }, [query.data]);

  return {
    filtros: query.data?.filtros,
    colunas: query.data?.colunas ?? {},
    porEtapaCrm,
    leads: query.data?.leads ?? [],
    quentesSemDono: query.data?.quentes_sem_dono ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    atualizadoEm: query.dataUpdatedAt,
    error: query.error as Error | null,
  };
}

/** Páginas seguintes de uma coluna (ou a coluna Perdidos inteira, que não vem na carga inicial). */
export function useAcompanhamentoColunaMais(
  etapa: EtapaCrm,
  filtro: FiltroAcompanhamento,
  busca: string,
  enabled: boolean,
  offsetInicial: number,
) {
  const termo = busca.trim();
  return useInfiniteQuery({
    queryKey: ["acompanhamento-leads", "coluna", etapa, filtro, termo, offsetInicial],
    enabled,
    initialPageParam: offsetInicial,
    queryFn: async ({ pageParam }): Promise<AcompanhamentoLead[]> => {
      const { data, error } = await (supabase as any).rpc("acompanhamento_quadro", {
        p_filtro: filtro,
        p_busca: termo || null,
        p_por_coluna: 50,
        p_etapa: etapa,
        p_offset: pageParam,
      });
      if (error) throw error;
      return ((data as QuadroResposta).leads ?? []) as AcompanhamentoLead[];
    },
    getNextPageParam: (ultima, paginas) =>
      ultima.length < 50 ? undefined : offsetInicial + paginas.reduce((n, p) => n + p.length, 0),
  });
}

/** Um lead pela campanha_lead_id (painel lateral). Mesma chave e consulta do CampanhaProspeccaoKanban. */
export function useAcompanhamentoLeadPorId(campanhaLeadId: string | null) {
  return useQuery({
    queryKey: ["acompanhamento-lead-by-campanha-lead", campanhaLeadId],
    enabled: !!campanhaLeadId,
    queryFn: async (): Promise<AcompanhamentoLead | null> => {
      const { data } = await supabase
        .from("vw_acompanhamento_kanban_full" as never)
        .select("*")
        .eq("campanha_lead_id", campanhaLeadId)
        .maybeSingle();
      return (data as AcompanhamentoLead) ?? null;
    },
  });
}

// ── Mutações (RPCs) ──────────────────────────────────────────

/**
 * Assumir lead: marca o dono e pausa a IA (prospeccao_assumir). Desde 16/11/2026 (decisão do Raul) o lead quente
 * também passa a "em_analise" (Em qualificação) no mesmo clique; antes ficava em "quente" até alguém clicar em
 * "Iniciar qualificação". As duas etapas caem na coluna Qualificado do Kanban (vw_acompanhamento_kanban), então
 * o card não muda de coluna. Só move a partir de "quente": um lead já mais adiante não volta de etapa.
 */
export function useAssumirLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campanha_lead_id, etapa }: { campanha_lead_id: string; etapa?: EtapaAcompanhamento | null }) => {
      const { data, error } = await (supabase as any).rpc("prospeccao_assumir", {
        p_campanha_lead_id: campanha_lead_id,
        p_force: false,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Falha ao assumir");
      if (etapa !== "quente") return { movido: false, erroMover: null as string | null };
      const { data: mov, error: errMov } = await (supabase as any).rpc("prospeccao_mover_etapa", {
        p_campanha_lead_id: campanha_lead_id,
        p_etapa: "em_analise",
      });
      // O assumir já valeu; se mover falhar, avisa e o lead fica em quente, com o botão Iniciar qualificação à mão.
      const erroMover = errMov ? errMov.message : mov?.ok === false ? String(mov.error) : null;
      return { movido: !erroMover, erroMover };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      if (r.movido) toast.success("Lead assumido. A qualificação começou.");
      else if (r.erroMover) toast.warning(`Lead assumido, mas a qualificação não começou (${r.erroMover}). Use Iniciar qualificação.`);
      else toast.success("Lead assumido");
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
        data.convertido
          ? "Médico convertido e encaminhado para Contratos"
          : "Médico encaminhado para a oportunidade",
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
    quente: "Qualificado",
    em_analise: "Em qualificação",
    aprovado: "Encaminhado",
    na_escala: "Convertido",
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
