import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RaiaLogRow {
  id: number;
  licitacao_id: string;
  status: string;
  kanban_status_id: string | null;
  entrou_em: string;
  saiu_em: string | null;
  duracao_segundos: number | null;
  movido_por: string | null;
  ordem_passagem: number;
}

export interface RaiaAgregado {
  status: string;
  total_segundos: number;
  passagens: number;
  aberto: boolean;
}

export const useLicitacaoRaiaLog = (licitacaoId: string | undefined) => {
  return useQuery({
    queryKey: ["licitacao-raia-log", licitacaoId],
    enabled: !!licitacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacao_raia_log" as any)
        .select("*")
        .eq("licitacao_id", licitacaoId as string)
        .order("entrou_em", { ascending: true });

      if (error) throw error;
      const rows = (data || []) as unknown as RaiaLogRow[];

      const agora = Date.now();
      const agregadoMap = new Map<string, RaiaAgregado>();
      let totalSegundos = 0;

      for (const r of rows) {
        const fim = r.saiu_em ? new Date(r.saiu_em).getTime() : agora;
        const ini = new Date(r.entrou_em).getTime();
        const dur = Math.max(0, Math.floor((fim - ini) / 1000));
        totalSegundos += dur;

        const prev = agregadoMap.get(r.status) || {
          status: r.status,
          total_segundos: 0,
          passagens: 0,
          aberto: false,
        };
        prev.total_segundos += dur;
        prev.passagens += 1;
        if (!r.saiu_em) prev.aberto = true;
        agregadoMap.set(r.status, prev);
      }

      const agregado = Array.from(agregadoMap.values()).sort(
        (a, b) => b.total_segundos - a.total_segundos
      );

      return { rows, agregado, totalSegundos };
    },
  });
};

export function formatarDuracao(segundos: number | null): string {
  if (segundos === null || segundos === undefined) return "—";
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const minRest = min % 60;
  if (h < 24) return minRest ? `${h}h ${minRest}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const hRest = h % 24;
  return hRest ? `${d}d ${hRest}h` : `${d}d`;
}