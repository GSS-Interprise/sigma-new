// Dados da tela Tempo de resposta (docs/arquitetura/tempo-de-resposta-atendimento.md). As regras (o que é "esperando",
// de quem é, IA atuando) ficam no banco: atendimento_aguardando() e atendimento_indicadores(), as mesmas dos avisos.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Espera = {
  conversation_id: string; contato_nome: string; contato_telefone: string; lead_id: string | null;
  numero: string; numero_nome: string | null; uso: string | null; responsavel_id: string | null; responsavel_nome: string | null;
  esperando_desde: string; mensagens: number; ultima_mensagem: string | null; ultima_em: string;
  ia_atuando: boolean; contato_marcado: string | null; contato_tipo: string | null; prioridade: boolean;
  /** Categoria do contato (atendimento_regras): prioridade, cliente, medico, parceiro, outro ou padrao (não marcado). */
  categoria: Categoria; meta_min: number;
};
/** em_10min = fixo em 10 min (o agente lê); em_meta = dentro da meta da categoria de cada conversa. */
export type Indicador = { pessoa_id: string | null; pessoa: string; esperas: number; respondidas: number; mediana_min: number | null; em_10min: number; sem_resposta: number; em_meta: number };

/**
 * Regras por tipo de contato (atendimento_regras, 25/11). A categoria da conversa vem do contato marcado: prioridade se
 * marcado com prioridade, senão o tipo dele; contato não marcado = padrao.
 */
export type Categoria = "padrao" | "prioridade" | "cliente" | "medico" | "parceiro" | "outro";
export type Regra = { categoria: Categoria; meta_min: number; pessoa_min: number[]; coordenacao_min: number | null; diretoria_min: number | null };
export const CATEGORIAS: { id: Categoria; rotulo: string; ajuda: string }[] = [
  { id: "padrao", rotulo: "Padrão", ajuda: "Contato não marcado" },
  { id: "prioridade", rotulo: "Prioridade", ajuda: "Contato marcado com prioridade" },
  { id: "cliente", rotulo: "Cliente", ajuda: "Contato marcado como cliente" },
  { id: "medico", rotulo: "Médico", ajuda: "Contato marcado como médico" },
  { id: "parceiro", rotulo: "Parceiro", ajuda: "Contato marcado como parceiro" },
  { id: "outro", rotulo: "Outro", ajuda: "Contato marcado como outro" },
];
export const rotuloCategoria = (c: string | null | undefined) => CATEGORIAS.find((x) => x.id === c)?.rotulo ?? "Padrão";

export function useRegras() {
  return useQuery({
    queryKey: ["atendimento-regras"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from("atendimento_regras").select("categoria, meta_min, pessoa_min, coordenacao_min, diretoria_min");
      if (error) throw new Error(error.message);
      const lista = (data || []) as Regra[];
      // Sempre na ordem da tela (padrão primeiro), não na do banco.
      return CATEGORIAS.map((c) => lista.find((r) => r.categoria === c.id)).filter(Boolean) as Regra[];
    },
    staleTime: 300_000,
  });
}

/**
 * Estado da espera contra a meta DA CATEGORIA: 0 = dentro da meta, 1 = passou da meta (âmbar),
 * 2 = passou do aviso da coordenação (vermelho; sem aviso de coordenação na regra, 6× a meta).
 */
export const estadoEspera = (min: number, meta: number, coordenacaoMin: number | null | undefined) =>
  min >= (coordenacaoMin || meta * 6) ? 2 : min >= meta ? 1 : 0;

// RPCs novas ainda não estão nos tipos gerados do Supabase.
const rpc = (nome: string, args?: Record<string, unknown>) => (supabase.rpc as unknown as (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(nome, args);

export function useFila() {
  return useQuery({
    queryKey: ["atendimento-fila"],
    queryFn: async () => {
      const { data, error } = await rpc("atendimento_aguardando", { p_dias: 7 });
      if (error) throw new Error(error.message);
      return (data || []) as Espera[];
    },
    refetchInterval: 60_000,
  });
}

/** Início do dia de hoje em Brasília. */
export const inicioDoDiaBR = (agora = new Date()) => {
  const br = new Date(agora.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3));
};

export type Periodo = "hoje" | "7d" | "30d";
export const PERIODOS: { id: Periodo; rotulo: string }[] = [{ id: "hoje", rotulo: "Hoje" }, { id: "7d", rotulo: "7 dias" }, { id: "30d", rotulo: "30 dias" }];
/** Início do período em Brasília: hoje = meia-noite de hoje; 7d/30d = meia-noite de 6/29 dias atrás. */
export const inicioPeriodo = (p: Periodo, agora = new Date()) => {
  const ini = inicioDoDiaBR(agora);
  return new Date(ini.getTime() - (p === "hoje" ? 0 : p === "7d" ? 6 : 29) * 86_400_000);
};

/**
 * Tipo do número (whatsapp_chakra_connections.uso), cadastrado em Números WhatsApp. Prospecção, escalas, clientes e
 * ambulatório (consultas dos municípios, 25/11) são
 * operações diferentes, então o painel mede cada uma separada; "todos" soma tudo (inclusive financeiro e pessoal).
 */
export type TipoNumero = "todos" | "prospeccao" | "escalas" | "clientes" | "ambulatorio" | "radiologia";
export const TIPOS_NUMERO: { id: TipoNumero; rotulo: string }[] = [
  { id: "todos", rotulo: "Todas" }, { id: "prospeccao", rotulo: "Prospecção" }, { id: "escalas", rotulo: "Escalas" }, { id: "clientes", rotulo: "Clientes" },
  { id: "ambulatorio", rotulo: "Ambulatório" }, { id: "radiologia", rotulo: "Radiologia" },
];
const pUso = (tipo: TipoNumero) => (tipo === "todos" ? null : tipo);

/** Quantos números conectados há de cada tipo e quantos estão sem responsável (para o estado vazio de cada aba). */
export function useNumerosPorTipo() {
  return useQuery({
    queryKey: ["atendimento-numeros-tipo"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from("whatsapp_chakra_connections").select("uso, responsavel_id").neq("status", "desconectado");
      if (error) throw new Error(error.message);
      return (data || []) as { uso: string; responsavel_id: string | null }[];
    },
    staleTime: 60_000,
  });
}

export function useIndicadores(periodo: Periodo, tipo: TipoNumero = "todos") {
  return useQuery({
    queryKey: ["atendimento-indicadores-hoje", periodo, tipo],
    queryFn: async () => {
      const { data, error } = await rpc("atendimento_indicadores", { p_de: inicioPeriodo(periodo).toISOString(), p_ate: new Date().toISOString(), p_uso: pUso(tipo) });
      if (error) throw new Error(error.message);
      return (data || []) as Indicador[];
    },
    refetchInterval: 120_000,
  });
}

export type PontoSerie = { bucket: string; esperas: number; em_meta: number; depois: number; sem_resposta: number; mediana_min: number | null; automaticas: number };
export function useSerie(periodo: Periodo, tipo: TipoNumero = "todos") {
  return useQuery({
    queryKey: ["atendimento-indicadores-hoje", "serie", periodo, tipo],
    queryFn: async () => {
      const { data, error } = await rpc("atendimento_serie", { p_de: inicioPeriodo(periodo).toISOString(), p_ate: new Date().toISOString(), p_bucket: periodo === "hoje" ? "hour" : "day", p_uso: pUso(tipo) });
      if (error) throw new Error(error.message);
      return ((data || []) as PontoSerie[]).map((p) => ({ ...p, mediana_min: p.mediana_min == null ? null : Number(p.mediana_min) }));
    },
    refetchInterval: 120_000,
  });
}

/** `minutos` = meta da categoria padrão (contato não marcado); cada conversa usa a meta da sua categoria. */
export function useMetas() {
  return useQuery({
    queryKey: ["atendimento-metas"],
    queryFn: async () => {
      const db = supabase as unknown as { from: (t: string) => any };
      const [{ data }, { data: padrao }] = await Promise.all([
        db.from("atendimento_config").select("meta_minutos, meta_pct").eq("id", true).maybeSingle(),
        db.from("atendimento_regras").select("meta_min").eq("categoria", "padrao").maybeSingle(),
      ]);
      return { minutos: Number(padrao?.meta_min ?? data?.meta_minutos ?? 10), pct: Number(data?.meta_pct ?? 80) };
    },
    staleTime: 300_000,
  });
}

export function usePodeGerir(userId: string | null) {
  return useQuery({
    queryKey: ["atendimento-pode-gerir", userId],
    enabled: !!userId,
    queryFn: async () => !!(await rpc("atendimento_pode_gerir", { p_uid: userId })).data,
  });
}

/** Mensagem nova em qualquer conversa: atualiza a fila (no máximo a cada 2 s). */
export function useTempoRealFila() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const atualizar = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ["atendimento-fila"] });
        qc.invalidateQueries({ queryKey: ["atendimento-indicadores-hoje"] });
      }, 2000);
    };
    const canal = supabase.channel("atendimento-fila")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sigzap_messages" }, atualizar)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(canal); };
  }, [qc]);
}

/** Relógio da tela: os minutos de espera andam sem buscar de novo no banco. */
export function useAgora(ms = 15_000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return agora;
}

export const minutosDesde = (iso: string, agora: Date) => Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));

export function tempoCurto(min: number): string {
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; }
  return `${Math.floor(min / 1440)} dias`;
}

/** Faixa da escada (as mesmas dos avisos): 0 = até 3 min, 1 = 3–10, 2 = 10–60, 3 = 1–3 h, 4 = mais de 3 h. */
export const faixaDe = (min: number) => (min < 3 ? 0 : min < 10 ? 1 : min < 60 ? 2 : min < 180 ? 3 : 4);
export const FAIXAS = ["Até 3 min", "3 a 10 min", "10 min a 1 h", "1 a 3 h", "Mais de 3 h"];

export { rpc };
