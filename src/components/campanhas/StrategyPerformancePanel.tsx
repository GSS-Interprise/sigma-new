import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Props {
  campanhaId?: string;
}

interface StrategyFunnel {
  strategy_id: string;
  campanha_id: string;
  strategy_name: string;
  strategy_status: string;
  total_leads: number;
  contatados: number;
  em_conversa: number;
  quentes: number;
  convertidos: number;
  tarefas_executadas: number;
  touches_enviados: number;
}

export function StrategyPerformancePanel({ campanhaId }: Props) {
  const [strategyId, setStrategyId] = useState("all");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["campaign-strategy-funnel", campanhaId || "all"],
    queryFn: async () => {
      let query = supabase
        .from("vw_campaign_strategy_funnel" as never)
        .select("*")
        .order("strategy_name");
      if (campanhaId) query = query.eq("campanha_id", campanhaId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StrategyFunnel[];
    },
  });

  const visible = useMemo(
    () => strategyId === "all" ? rows : rows.filter((row) => row.strategy_id === strategyId),
    [rows, strategyId],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando desempenho por estratégia...
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Comparativo por estratégia
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Funil e esforço sem misturar abordagens diferentes.
          </p>
        </div>
        <select
          className="min-h-11 w-full rounded-md border bg-background px-3 text-sm sm:w-64"
          value={strategyId}
          onChange={(event) => setStrategyId(event.target.value)}
          aria-label="Filtrar estratégia"
        >
          <option value="all">Todas as estratégias</option>
          {rows.map((row) => (
            <option key={row.strategy_id} value={row.strategy_id}>
              {row.strategy_name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">Estratégia</th>
              <th className="px-2 py-2 text-right font-medium">Base</th>
              <th className="px-2 py-2 text-right font-medium">Contatados</th>
              <th className="px-2 py-2 text-right font-medium">Conversas</th>
              <th className="px-2 py-2 text-right font-medium">Quentes</th>
              <th className="px-2 py-2 text-right font-medium">Convertidos</th>
              <th className="px-2 py-2 text-right font-medium">Esforço</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const conversion = row.total_leads > 0
                ? (row.convertidos / row.total_leads) * 100
                : 0;
              return (
                <tr key={row.strategy_id} className="border-b last:border-0">
                  <td className="px-2 py-3">
                    <div className="font-medium">{row.strategy_name}</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {row.strategy_status}
                    </Badge>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.total_leads}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.contatados}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.em_conversa}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.quentes}</td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {row.convertidos}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({conversion.toFixed(1)}%)
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {row.tarefas_executadas + row.touches_enviados}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({row.tarefas_executadas} manual)
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
