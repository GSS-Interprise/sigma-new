import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, MessageCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const { data: rows, isLoading } = useQuery({
    queryKey: ["comparativo-operadoras"],
    queryFn: async (): Promise<OperadoraRow[]> => {
      // Query SQL agregada via RPC seria mais limpa, mas como não temos a RPC,
      // fazemos com 2 queries leves e combinamos no client.
      const { data: convs } = await (supabase as any)
        .from("sigzap_conversations")
        .select("assigned_user_id, last_message_at")
        .not("assigned_user_id", "is", null);

      const { data: msgs } = await (supabase as any)
        .from("sigzap_messages")
        .select("sent_by_user_id")
        .eq("from_me", true)
        .not("sent_by_user_id", "is", null);

      const conversasMap = new Map<string, { qtd: number; ultima: string | null }>();
      for (const c of convs ?? []) {
        const cur = conversasMap.get(c.assigned_user_id) ?? { qtd: 0, ultima: null };
        cur.qtd += 1;
        if (c.last_message_at && (!cur.ultima || c.last_message_at > cur.ultima)) {
          cur.ultima = c.last_message_at;
        }
        conversasMap.set(c.assigned_user_id, cur);
      }

      const msgsMap = new Map<string, number>();
      for (const m of msgs ?? []) {
        msgsMap.set(m.sent_by_user_id, (msgsMap.get(m.sent_by_user_id) ?? 0) + 1);
      }

      const userIds = Array.from(conversasMap.keys());
      if (userIds.length === 0) return [];

      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("id, nome_completo")
        .in("id", userIds);

      const profMap = new Map<string, string>(
        (profs ?? []).map((p: any) => [p.id, p.nome_completo])
      );

      return userIds
        .map((id) => ({
          user_id: id,
          nome_completo: profMap.get(id) ?? "Sem nome",
          conversas_atribuidas: conversasMap.get(id)?.qtd ?? 0,
          msgs_enviadas: msgsMap.get(id) ?? 0,
          ultima_atividade: conversasMap.get(id)?.ultima ?? null,
        }))
        .sort((a, b) => b.conversas_atribuidas - a.conversas_atribuidas);
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
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Atividade geral da equipe no SigZap
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Conversas atendidas e mensagens enviadas pelo SigZap (qualquer origem — não só campanhas).
          Quando a equipe começar a usar &quot;Assumir lead&quot; no Acompanhamento, vai aparecer aqui métrica específica de campanha também.
          <br />
          <span className="italic">Não é ranking — é visibilidade pra coordenar carga e saber quem está ativo na semana.</span>
        </p>
      </div>
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
                  title="Mensagens enviadas pela operadora no Sigma SigZap"
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
