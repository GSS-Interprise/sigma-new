import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Send, Hand, Workflow, ArrowRightLeft, CheckCircle2, Calendar, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RankingRow {
  user_id: string;
  nome_completo: string | null;
  campanhas_criadas: number;
  massa_enviados: number;
  massa_falhas: number;
  manuais_enviados: number;
  raias_abertas: number;
  raias_movidas: number;
  conversoes: number;
  sla_medio_horas: number | null;
  sla_cumprido_pct: number | null;
}

type PeriodFilter = "semana" | "mes" | "total";
type MetricFilter = "enviados" | "conversoes" | "sla";

const MEDAL_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-700"];

function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const friday = endOfDay(addDays(monday, 4)); // sexta-feira
  return {
    from: monday.toISOString(),
    to: friday.toISOString(),
  };
}

export function DisparosZapRanking() {
  const [period, setPeriod] = useState<PeriodFilter>("semana");
  const [metric, setMetric] = useState<MetricFilter>("enviados");

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["ranking-disparos", period, metric],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_ranking_disparos", {
        p_periodo: period,
        p_metric: metric,
      });
      if (error) throw error;
      return (data ?? []) as RankingRow[];
    },
  });

  const Header = (
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Ranking de Produtividade
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enviados">Por volume</SelectItem>
              <SelectItem value="conversoes">Por conversões</SelectItem>
              <SelectItem value="sla">Por SLA cumprido</SelectItem>
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="total">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card>
        {Header}
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!ranking?.length) {
    return (
      <Card>
        {Header}
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nenhuma atividade registrada neste período.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {Header}
      <CardContent>
        <div className="space-y-3">
          {ranking.map((item, index) => (
            <div
              key={item.user_id}
              className={`flex items-center gap-4 p-3 rounded-lg border ${
                index === 0 ? "bg-yellow-500/5 border-yellow-500/20" :
                index === 1 ? "bg-muted/30 border-border" :
                index === 2 ? "bg-amber-700/5 border-amber-700/20" :
                "bg-card border-border"
              }`}
            >
              <div className="flex-shrink-0 w-8 text-center">
                {index < 3 ? (
                  <Trophy className={`h-5 w-5 mx-auto ${MEDAL_COLORS[index]}`} />
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{index + 1}º</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.nome_completo ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {item.campanhas_criadas} campanha{item.campanhas_criadas !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs flex-wrap justify-end">
                <div className="flex items-center gap-1 text-primary" title="WhatsApp em massa enviados">
                  <Send className="h-3.5 w-3.5" />
                  <span className="font-semibold">{Number(item.massa_enviados).toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-1 text-foreground" title="Disparos manuais enviados">
                  <Hand className="h-3.5 w-3.5" />
                  <span>{Number(item.manuais_enviados).toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground" title="Raias abertas">
                  <Workflow className="h-3.5 w-3.5" />
                  <span>{Number(item.raias_abertas).toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground" title="Raias movidas/encerradas">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>{Number(item.raias_movidas).toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500" title="Conversões">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="font-semibold">{Number(item.conversoes).toLocaleString("pt-BR")}</span>
                </div>
                {item.sla_cumprido_pct !== null && (
                  <div
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold"
                    title={`SLA médio: ${item.sla_medio_horas ?? "—"}h`}
                  >
                    <Timer className="h-3.5 w-3.5" />
                    {Number(item.sla_cumprido_pct).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
