// Dados do SLA de laudos (radiologia GSS). Tabelas novas ainda fora dos tipos gerados: "as any" como o resto do módulo.
// Doc: docs/arquitetura/sla-laudos-radiologia.md.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Unidades do SLA (22/11/2026: CEPON entra numa segunda estação, porque Marieta e CEPON usam o mesmo Vue PACS e
// não abrem juntos na mesma máquina). Regras de aviso e coordenação são as mesmas para todas; fila, coletor e escala
// são por unidade. A unidade da tela vem de ?unidade= na URL (padrão: Marieta).
export const UNIDADES = [
  { id: "marieta", nome: "Hospital Marieta" },
  { id: "cepon", nome: "CEPON" },
  // 23/11/2026: Tijucas lido pela API do Animati (prioridades "GSS LAUDOS", sem laudo), PC da baia do Wagner.
  { id: "tijucas", nome: "Tijucas" },
  // 24/11/2026: Mobilemed lido pela API do portal (exames não liberados, prazo do próprio Mobilemed), mesmo PC.
  { id: "mobilemed", nome: "Mobilemed" },
] as const;
export type UnidadeId = (typeof UNIDADES)[number]["id"];
export function useUnidade() {
  const [params, setParams] = useSearchParams();
  const id = (UNIDADES.find((u) => u.id === params.get("unidade"))?.id ?? "marieta") as UnidadeId;
  const nome = UNIDADES.find((u) => u.id === id)!.nome;
  const trocar = (novo: UnidadeId) => { const p = new URLSearchParams(params); p.set("unidade", novo); setParams(p, { replace: true }); };
  return { id, nome, trocar };
}

export type Origem = "ps" | "internado" | "externo";
export const ORIGEM: Record<Origem, { nome: string; curto: string; cor: string; fundo: string }> = {
  // mesmas cores que o Vue PACS usa na fila (vermelho PS, laranja internado, azul externo)
  ps: { nome: "Pronto Socorro", curto: "PS", cor: "text-white", fundo: "bg-red-600" },
  internado: { nome: "Internado", curto: "Internado", cor: "text-white", fundo: "bg-orange-500" },
  externo: { nome: "Externo", curto: "Externo", cor: "text-white", fundo: "bg-sky-500" },
};

export type Exame = {
  id: string;
  origem: Origem;
  inicio_em: string;
  vence_em: string;
  precisao: "segundo" | "minuto";
  visto_primeiro_em: string;
  assumido_em: string | null;
  assumido_por: string | null;
  assumido_via: "whatsapp" | "sigma" | null;
  silenciado_em: string | null;
  paciente: string | null;
  estudo: string | null;
};
export type Alerta = {
  id: string;
  exame_id: string | null;
  tipo: "prazo" | "vencido" | "sem_escala";
  papel: string | null;
  destino_nome: string | null;
  canal: "whatsapp" | "email" | "ligacao";
  status: string;
  erro: string | null;
  respondido_em: string | null;
  criado_em: string;
};
export type Nota = {
  id: string;
  exame_id: string;
  tipo: "nota" | "avisei_medico" | "nao_precisa_laudo" | "problema_pacs";
  texto: string | null;
  autor_nome: string | null;
  criado_em: string;
};
export type Plantao = {
  id: string;
  papel: "plantonista" | "coordenador" | "diretoria";
  inicio: string;
  fim: string;
  nome: string;
  telefone: string;
  email: string | null;
  // Plantões do Dr. Escala (19/11): vêm sozinhos a cada 30 min. 'TC' | 'US' | null (qualquer exame).
  modalidade?: string | null;
  drescala_plantao_id?: number | null;
};

const db = supabase as any;

export function useFila() {
  const UNIDADE = useUnidade().id;
  return useQuery({
    queryKey: ["sla-fila", UNIDADE],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("sla_exames")
        .select("id, origem, inicio_em, vence_em, precisao, visto_primeiro_em, assumido_em, assumido_por, assumido_via, silenciado_em, paciente, estudo")
        .eq("unidade", UNIDADE).is("saiu_em", null).is("ausente_em", null).order("vence_em");
      if (error) throw error;
      return (data ?? []) as Exame[];
    },
  });
}

export function useColetor() {
  const UNIDADE = useUnidade().id;
  return useQuery({
    queryKey: ["sla-coletor", UNIDADE],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [{ data: ok }, { data: queda }, { data: ativo }, { data: teste }] = await Promise.all([
        db.from("sla_leituras").select("lida_em, detalhe").eq("unidade", UNIDADE).eq("status", "ok")
          .order("lida_em", { ascending: false }).limit(1).maybeSingle(),
        db.from("sla_coletor_quedas").select("aberta_em, motivo, ultima_ok_em").eq("unidade", UNIDADE)
          .is("fechada_em", null).maybeSingle(),
        db.from("config_lista_items").select("valor").eq("campo_nome", "sla_alertas_ativo").maybeSingle(),
        db.from("config_lista_items").select("valor").eq("campo_nome", "sla_teste_destino").maybeSingle(),
      ]);
      return {
        ultimaOk: (ok?.lida_em as string | undefined) ?? null,
        queda: queda as { aberta_em: string; motivo: string | null; ultima_ok_em: string | null } | null,
        alertasAtivos: ativo?.valor === "true",
        // Teste interno (sla_teste_destino): todo aviso vai para esse número, não para o médico escalado.
        testeDestino: (teste?.valor as string | undefined)?.trim() || null,
      };
    },
  });
}

export function useAlertas(exameIds?: string[]) {
  const UNIDADE = useUnidade().id;
  return useQuery({
    queryKey: ["sla-alertas", exameIds?.join(",") ?? "recentes", UNIDADE],
    refetchInterval: 30_000,
    queryFn: async () => {
      // Lista "Últimos avisos": só os da unidade da tela (com o CEPON, misturava os do Marieta).
      let q = db.from("sla_alertas")
        .select("id, exame_id, tipo, papel, destino_nome, canal, status, erro, respondido_em, criado_em, exame:sla_exames!inner(unidade)")
        .order("criado_em", { ascending: false });
      q = exameIds ? q.in("exame_id", exameIds.length ? exameIds : ["00000000-0000-0000-0000-000000000000"]) : q.eq("exame.unidade", UNIDADE).limit(30);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Alerta[];
    },
  });
}

export function useNotas(exameId: string | null) {
  return useQuery({
    queryKey: ["sla-notas", exameId],
    enabled: !!exameId,
    queryFn: async () => {
      const { data, error } = await db.from("sla_exame_notas").select("id, exame_id, tipo, texto, autor_nome, criado_em")
        .eq("exame_id", exameId).order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Nota[];
    },
  });
}

export function useAnotar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { exameId: string; tipo: Nota["tipo"]; texto?: string }) => {
      const { error } = await db.rpc("sla_exame_anotar", { p_exame: v.exameId, p_tipo: v.tipo, p_texto: v.texto ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["sla-notas", v.exameId] });
      qc.invalidateQueries({ queryKey: ["sla-fila"] });
    },
  });
}

/** Prazo de cada origem em minutos (aba Avisos › Prazo do laudo). */
export function usePrazos() {
  return useQuery({
    queryKey: ["sla-prazos"],
    queryFn: async () => {
      const { data, error } = await db.from("sla_prazos").select("origem, minutos");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p: { origem: Origem; minutos: number }) => [p.origem, p.minutos])) as Partial<Record<Origem, number>>;
    },
    staleTime: 300_000,
  });
}

/** Avisos de hoje (desde 0h de Brasília) da unidade da tela: enviados, assumidos, falhas e tempo até assumir. */
export function useAvisosHoje() {
  const UNIDADE = useUnidade().id;
  return useQuery({
    queryKey: ["sla-alertas", "hoje", UNIDADE],
    refetchInterval: 60_000,
    queryFn: async () => {
      const br = new Date(Date.now() - 3 * 3_600_000);
      const desde = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)).toISOString();
      const { data, error } = await db.from("sla_alertas")
        .select("exame_id, status, canal, criado_em, respondido_em, exame:sla_exames!inner(unidade)")
        .eq("exame.unidade", UNIDADE).gte("criado_em", desde);
      if (error) throw error;
      const ls = (data ?? []) as { exame_id: string; status: string; respondido_em: string | null; criado_em: string }[];
      const assumidos = ls.filter((a) => a.respondido_em);
      const minutos = assumidos.map((a) => (new Date(a.respondido_em!).getTime() - new Date(a.criado_em).getTime()) / 60000).sort((x, y) => x - y);
      return {
        enviados: ls.length,
        exames: new Set(ls.map((a) => a.exame_id)).size,
        assumidos: assumidos.length,
        falhas: ls.filter((a) => a.status === "falhou").length,
        medianaMin: minutos.length ? minutos[Math.floor(minutos.length / 2)] : null,
      };
    },
  });
}

export function useEscala(diasAFrente = 14) {
  const UNIDADE = useUnidade().id;
  return useQuery({
    queryKey: ["sla-escala", diasAFrente, UNIDADE],
    refetchInterval: 60_000,
    queryFn: async () => {
      const ate = new Date(Date.now() + diasAFrente * 86_400_000).toISOString();
      const ler = (unidade: string) => db.from("sla_plantao").select("id, papel, inicio, fim, nome, telefone, email, modalidade, drescala_plantao_id")
        .eq("unidade", unidade).gt("fim", new Date().toISOString()).lt("inicio", ate).order("inicio");
      const { data, error } = await ler(UNIDADE);
      if (error) throw error;
      // Mesma regra do motor de avisos (sla-alertas, 24/11): unidade sem escala própria usa a equipe da Marieta.
      // Sem isto a tela de CEPON/Tijucas/Mobilemed dizia "Ninguém na escala" enquanto os avisos iam para o plantão.
      if (!(data ?? []).length && UNIDADE !== "marieta") {
        const { data: daMarieta, error: e2 } = await ler("marieta");
        if (e2) throw e2;
        return (daMarieta ?? []) as Plantao[];
      }
      return (data ?? []) as Plantao[];
    },
  });
}

// ── texto e tempo ─────────────────────────────────────────────────────────
export function duracao(min: number) {
  const m = Math.max(1, Math.round(Math.abs(min)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return `${h} h${r ? ` ${r} min` : ""}`;
  const d = Math.floor(h / 24), hr = h % 24;
  return `${d} d${hr ? ` ${hr} h` : ""}`;
}

export function situacaoPrazo(e: Pick<Exame, "inicio_em" | "vence_em">, agora = Date.now()) {
  const ini = new Date(e.inicio_em).getTime(), fim = new Date(e.vence_em).getTime();
  const pct = Math.min(1.5, Math.max(0, (agora - ini) / (fim - ini)));
  const faltaMin = (fim - agora) / 60000;
  const estado: "vencido" | "perto" | "ok" = faltaMin <= 0 ? "vencido" : pct >= 0.8 ? "perto" : "ok";
  return { pct, faltaMin, estado };
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
export const horaCurta = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
export const diaHora = (iso: string) => fmt(iso, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const ehHoje = (iso: string) => fmt(iso, { day: "2-digit", month: "2-digit" }) === fmt(new Date().toISOString(), { day: "2-digit", month: "2-digit" });

export function telefoneBonito(t: string) {
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t;
}
// Aceita o telefone como a pessoa digitar (Postel) e devolve 55 + DDD + número, ou null.
export function normalizarTelefone(t: string) {
  let d = t.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
