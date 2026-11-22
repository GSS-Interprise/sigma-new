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
};
export type Indicador = { pessoa_id: string | null; pessoa: string; esperas: number; respondidas: number; mediana_min: number | null; em_10min: number; sem_resposta: number };

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

export function useIndicadoresHoje() {
  return useQuery({
    queryKey: ["atendimento-indicadores-hoje"],
    queryFn: async () => {
      const { data, error } = await rpc("atendimento_indicadores", { p_de: inicioDoDiaBR().toISOString(), p_ate: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return (data || []) as Indicador[];
    },
    refetchInterval: 120_000,
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
