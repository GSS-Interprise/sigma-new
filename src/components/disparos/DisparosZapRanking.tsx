import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Send, Users, AlertTriangle, PhoneOff, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startOfWeek, startOfMonth, endOfDay, addDays } from "date-fns";

interface RankingItem {
  responsavel_id: string;
  responsavel_nome: string;
  total_campanhas: number;
  total_contatos: number;
  total_enviados: number;
  total_falhas: number;
  total_nozap: number;
}

type PeriodFilter = "semana" | "mes" | "total";

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

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["disparos-zap-ranking", period],
    queryFn: async () => {
      let query = supabase
        .from("disparos_campanhas")
        .select("responsavel_id, responsavel_nome, total_contatos, enviados, falhas, nozap, created_at, status")
        .not("status", "eq", "pendente"); // excluir campanhas que nunca dispararam

      if (period === "semana") {
        const { from, to } = getWeekRange();
        query = query.gte("created_at", from).lte("created_at", to);
      } else if (period === "mes") {
        query = query.gte("created_at", startOfMonth(new Date()).toISOString());
      }
      // "total" = sem filtro de data

      const { data, error } = await query;

      if (error) throw error;

      // Aggregate by responsavel
      const map = new Map<string, RankingItem>();
      for (const row of data ?? []) {
        const key = row.responsavel_id ?? "unknown";
        const existing = map.get(key);
        if (existing) {
          existing.total_campanhas += 1;
          existing.total_contatos += row.total_contatos ?? 0;
          existing.total_enviados += row.enviados ?? 0;
          existing.total_falhas += row.falhas ?? 0;
          existing.total_nozap += row.nozap ?? 0;
        } else {
          map.set(key, {
            responsavel_id: key,
            responsavel_nome: row.responsavel_nome ?? "Desconhecido",
            total_campanhas: 1,
            total_contatos: row.total_contatos ?? 0,
            total_enviados: row.enviados ?? 0,
            total_falhas: row.falhas ?? 0,
            total_nozap: row.nozap ?? 0,
          });
        }
      }

      return Array.from(map.values()).sort((a, b) => b.total_enviados - a.total_enviados);
    },
  });

  if (isLoading) {
    return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Ranking de Disparos WhatsApp
          </CardTitle>
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
      </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!ranking?.length) {
    const { from } = getWeekRange();
    const fromDate = new Date(from);
    const toDate = addDays(fromDate, 4);
    const rangeLabel = `${fromDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} a ${toDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Ranking de Disparos WhatsApp
            </CardTitle>
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
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {period === "semana"
              ? `Nenhum disparo encontrado nesta semana (${rangeLabel}).`
              : "Nenhum disparo encontrado."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Ranking de Disparos WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ranking.map((item, index) => {
            const taxaEnvio = item.total_contatos > 0
              ? ((item.total_enviados / item.total_contatos) * 100).toFixed(1)
              : "0";

            return (
              <div
                key={item.responsavel_id}
                className={`flex items-center gap-4 p-3 rounded-lg border ${
                  index === 0 ? "bg-yellow-500/5 border-yellow-500/20" :
                  index === 1 ? "bg-muted/30 border-border" :
                  index === 2 ? "bg-amber-700/5 border-amber-700/20" :
                  "bg-card border-border"
                }`}
              >
                {/* Position */}
                <div className="flex-shrink-0 w-8 text-center">
                  {index < 3 ? (
                    <Trophy className={`h-5 w-5 mx-auto ${MEDAL_COLORS[index]}`} />
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">{index + 1}º</span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.responsavel_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.total_campanhas} campanha{item.total_campanhas !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground" title="Contatos">
                    <Users className="h-3.5 w-3.5" />
                    <span>{item.total_contatos.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center gap-1 text-primary" title="Enviados">
                    <Send className="h-3.5 w-3.5" />
                    <span className="font-semibold">{item.total_enviados.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center gap-1 text-destructive" title="Falhas">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{item.total_falhas.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground" title="Sem WhatsApp">
                    <PhoneOff className="h-3.5 w-3.5" />
                    <span>{item.total_nozap.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold" title="Taxa de envio">
                    {taxaEnvio}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
