import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, startOfWeek, subWeeks, subDays } from "date-fns";

interface Props {
  // agregados do funil (vêm do agg do DashboardCampanhas, já respeitam filtros)
  funil: { pool: number; contatado: number; emConversa: number; quentes: number; convertidos: number };
}

/**
 * Dashboard Fase 2 — Funil visual + Comparação semanal.
 * Funil: Base → Contatado → Em conversa → Quente → Convertido, com taxa de
 * passagem entre etapas (onde vaza). Comparação: disparos desta semana vs a
 * semana passada (vw_disparos_diarios). Produtividade por operadora já vive no
 * ComparativoOperadoras.
 */
export function DashboardFunilFase2({ funil }: Props) {
  // Comparação: disparos desta semana (seg→hoje) vs semana passada (mesma janela)
  const now = new Date();
  const iniSemana = startOfWeek(now, { weekStartsOn: 1 });
  const iniPassada = subWeeks(iniSemana, 1);
  const fimPassada = subDays(iniSemana, 1);

  const { data: comp } = useQuery({
    queryKey: ["dash-comparacao-semanal", format(iniSemana, "yyyy-MM-dd")],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const somaRange = async (ini: string, fim: string) => {
        const { data } = await (supabase as any)
          .from("vw_disparos_diarios")
          .select("n_disparos")
          .gte("dia", ini)
          .lte("dia", fim);
        return (data ?? []).reduce((a: number, b: any) => a + Number(b.n_disparos), 0);
      };
      const atual = await somaRange(format(iniSemana, "yyyy-MM-dd"), format(now, "yyyy-MM-dd"));
      const passada = await somaRange(format(iniPassada, "yyyy-MM-dd"), format(fimPassada, "yyyy-MM-dd"));
      return { atual, passada };
    },
  });

  const etapas = [
    { nome: "Base", valor: funil.pool, cor: "bg-slate-400" },
    { nome: "Contatado", valor: funil.contatado, cor: "bg-blue-500" },
    { nome: "Em conversa", valor: funil.emConversa, cor: "bg-cyan-500" },
    { nome: "Quente", valor: funil.quentes, cor: "bg-red-500" },
    { nome: "Convertido", valor: funil.convertidos, cor: "bg-emerald-500" },
  ];
  const maxValor = Math.max(1, ...etapas.map((e) => e.valor));

  const variacao = comp ? comp.atual - comp.passada : 0;
  const variacaoPct = comp && comp.passada > 0 ? Math.round((variacao / comp.passada) * 100) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Funil — 2 colunas */}
      <div className="lg:col-span-2 border rounded-lg p-4 bg-card">
        <h3 className="text-sm font-semibold mb-3">Funil de prospecção</h3>
        <div className="space-y-2">
          {etapas.map((e, i) => {
            const anterior = i > 0 ? etapas[i - 1].valor : null;
            const taxa = anterior && anterior > 0 ? Math.round((e.valor / anterior) * 100) : null;
            return (
              <div key={e.nome} className="flex items-center gap-3">
                <div className="w-24 text-xs text-muted-foreground shrink-0">{e.nome}</div>
                <div className="flex-1 h-7 rounded bg-muted overflow-hidden relative">
                  <div
                    className={cn("h-full rounded flex items-center px-2", e.cor)}
                    style={{ width: `${Math.max(3, (e.valor / maxValor) * 100)}%` }}
                  >
                    <span className="text-xs font-semibold text-white tabular-nums">
                      {e.valor.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
                <div className="w-16 text-right text-xs shrink-0">
                  {taxa !== null ? (
                    <span className={cn(taxa < 10 ? "text-red-600" : "text-muted-foreground")}>{taxa}%</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">% = taxa de passagem da etapa anterior (onde está vazando).</p>
      </div>

      {/* Comparação semanal — 1 coluna */}
      <div className="border rounded-lg p-4 bg-card flex flex-col">
        <h3 className="text-sm font-semibold mb-3">Disparos: esta semana vs anterior</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{comp?.atual?.toLocaleString("pt-BR") ?? "—"}</span>
          <span className="text-sm text-muted-foreground">esta semana</span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          semana passada: <strong>{comp?.passada?.toLocaleString("pt-BR") ?? "—"}</strong>
        </div>
        {variacaoPct !== null && (
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 text-sm font-medium rounded px-2 py-1 w-fit",
              variacao > 0 ? "text-emerald-700 bg-emerald-50" : variacao < 0 ? "text-red-700 bg-red-50" : "text-muted-foreground bg-muted"
            )}
          >
            {variacao > 0 ? <TrendingUp className="h-4 w-4" /> : variacao < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {variacao > 0 ? "+" : ""}{variacaoPct}% vs semana passada
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-auto pt-2">Mesma janela (seg→hoje) nas duas semanas.</p>
      </div>
    </div>
  );
}
