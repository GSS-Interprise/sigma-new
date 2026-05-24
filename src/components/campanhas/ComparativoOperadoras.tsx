import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, MessageCircle, Clock, TrendingUp, BarChart3, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";

interface OperadoraRow {
  user_id: string;
  nome_completo: string;
  conversas_atribuidas: number;
  msgs_enviadas: number;
  ultima_atividade: string | null;
}

/**
 * F3.5 — Comparativo entre operadoras.
 *
 * Princípio: NÃO é ranking competitivo. Objetivo é DAR VISIBILIDADE para
 * gestão (Maikon, Ramone) e pras próprias operadoras enxergarem onde
 * concentrar esforço. Zero destaques de "1º lugar", zero medalhas, zero
 * cores agressivas. Apenas dados objetivos com contexto explicativo.
 *
 * 4 métricas balanceadas (volume × engajamento × tempo × recência):
 *   - Conversas atendidas (volume)
 *   - Mensagens enviadas (esforço)
 *   - Engajamento (msgs por conversa — indica profundidade da abordagem)
 *   - Última atividade (recência — quem está ativo essa semana)
 */
export function ComparativoOperadoras() {
  const [visualizacao, setVisualizacao] = useState<"grafico" | "tabela">("grafico");
  const { data: rows, isLoading } = useQuery({
    queryKey: ["comparativo-operadoras"],
    queryFn: async (): Promise<OperadoraRow[]> => {
      // Usa view SQL agregada — evita limit 1000 do client que estava
      // omitindo operadoras com muitas msgs (Amanda, Letícia, etc.)
      const { data, error } = await (supabase as any)
        .from("vw_sigzap_atividade_equipe")
        .select("*");
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[comparativo-operadoras] erro:", error);
        return [];
      }
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        nome_completo: r.nome_completo ?? "Sem nome",
        conversas_atribuidas: Number(r.conversas_atribuidas) || 0,
        msgs_enviadas: Number(r.msgs_enviadas) || 0,
        ultima_atividade: r.ultima_atividade ?? null,
      })) as OperadoraRow[];
    },
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return <div className="h-40 bg-muted/30 rounded-md animate-pulse" />;
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Sem operadoras com conversas atribuídas ainda.
      </Card>
    );
  }

  const maxConversas = Math.max(...rows.map((r) => r.conversas_atribuidas), 1);
  const maxMsgs = Math.max(...rows.map((r) => r.msgs_enviadas), 1);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Atividade geral da equipe nas Conversas
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conversas atendidas e mensagens enviadas (qualquer origem — não só campanhas).
              Quando a equipe começar a usar &quot;Assumir lead&quot; no Acompanhamento, vai aparecer aqui métrica específica de campanha também.
              <br />
              <span className="italic">Não é ranking — é visibilidade pra coordenar carga e saber quem está ativo na semana.</span>
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant={visualizacao === "grafico" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisualizacao("grafico")}
              className="h-7 px-2 gap-1"
              aria-label="Visualizar como gráfico"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Gráfico
            </Button>
            <Button
              variant={visualizacao === "tabela" ? "default" : "outline"}
              size="sm"
              onClick={() => setVisualizacao("tabela")}
              className="h-7 px-2 gap-1"
              aria-label="Visualizar como tabela"
            >
              <TableIcon className="h-3.5 w-3.5" />
              Tabela
            </Button>
          </div>
        </div>
      </div>

      {visualizacao === "grafico" && (
        <div className="p-4">
          <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 36)}>
            <BarChart
              data={rows.map((r) => ({
                nome: r.nome_completo.split(" ").slice(0, 2).join(" "),
                Conversas: r.conversas_atribuidas,
                Mensagens: r.msgs_enviadas,
              }))}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="nome"
                width={120}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <RTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="Conversas" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Mensagens" fill="hsl(160 70% 45%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Mostrando {rows.length} operadora(s). Use Tabela pra ver engajamento e última atividade.
          </p>
        </div>
      )}

      {visualizacao === "tabela" && (
      <ScrollArea className="max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/20 sticky top-0">
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left px-4 py-2 font-medium">Operadora</th>
              <th className="text-left px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" /> Conversas
                </span>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <span
                  className="inline-flex items-center gap-1"
                  title="Mensagens enviadas pela operadora no Sigma"
                >
                  <TrendingUp className="h-3 w-3" /> Mensagens enviadas
                </span>
              </th>
              <th
                className="text-right px-3 py-2 font-medium"
                title="Mensagens por conversa — indica profundidade da abordagem"
              >
                Engajamento
              </th>
              <th className="text-right px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Última atividade
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const iniciais = r.nome_completo
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const engaj = r.conversas_atribuidas > 0
                ? r.msgs_enviadas / r.conversas_atribuidas
                : 0;
              const ultimaTxt = r.ultima_atividade
                ? formatDistanceToNow(new Date(r.ultima_atividade), { addSuffix: true, locale: ptBR })
                : "—";
              const ultimaDias = r.ultima_atividade
                ? (Date.now() - new Date(r.ultima_atividade).getTime()) / (1000 * 60 * 60 * 24)
                : 999;
              const atividadeRecente = ultimaDias < 3;

              return (
                <tr key={r.user_id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] bg-primary/10">
                          {iniciais}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground/90 truncate">
                        {r.nome_completo}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 min-w-[140px]">
                    <BarComBoolean
                      valor={r.conversas_atribuidas}
                      max={maxConversas}
                      cor="bg-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-[140px]">
                    <BarComBoolean
                      valor={r.msgs_enviadas}
                      max={maxMsgs}
                      cor="bg-emerald-400"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {engaj > 0 ? (
                      <span title="Quantas mensagens, em média, por conversa atendida">
                        {engaj.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    <span
                      className={cn(
                        atividadeRecente
                          ? "text-emerald-700"
                          : ultimaDias > 14
                            ? "text-muted-foreground/60"
                            : "text-muted-foreground"
                      )}
                    >
                      {ultimaTxt}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      )}
    </Card>
  );
}

function BarComBoolean({
  valor,
  max,
  cor,
}: {
  valor: number;
  max: number;
  cor: string;
}) {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[40px]">
        <div
          className={cn("h-full rounded-full transition-all", cor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-foreground/80 w-12 text-right">
        {valor.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}
