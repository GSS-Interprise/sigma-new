import { useLicitacaoRaiaLog, formatarDuracao } from "@/hooks/useLicitacaoRaiaLog";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Activity } from "lucide-react";

interface Props {
  licitacaoId: string;
}

export function LicitacaoHistoricoTab({ licitacaoId }: Props) {
  const { data, isLoading } = useLicitacaoRaiaLog(licitacaoId);
  const { data: colunas = [] } = useKanbanColumns("licitacoes");

  const labelMap = new Map(colunas.map((c) => [c.id, c.label]));
  const corMap = new Map(colunas.map((c) => [c.id, c.cor || "#94a3b8"]));

  if (isLoading) {
    return (
      <ScrollArea className="h-full px-3 py-2">
        <p className="text-xs text-muted-foreground text-center py-10">Carregando histórico…</p>
      </ScrollArea>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <ScrollArea className="h-full px-3 py-2">
        <div className="text-center py-10 text-muted-foreground border border-dashed rounded-md">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sem histórico de passagens ainda</p>
        </div>
      </ScrollArea>
    );
  }

  const maxSegundos = Math.max(...data.agregado.map((a) => a.total_segundos), 1);

  return (
    <ScrollArea className="h-full px-3 py-2">
      {/* Resumo */}
      <div className="flex items-center justify-between gap-4 mb-4 p-3 rounded-md bg-muted/40">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Tempo total no funil</p>
            <p className="text-sm font-semibold">{formatarDuracao(data.totalSegundos)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Passagens</p>
          <p className="text-sm font-semibold">{data.rows.length}</p>
        </div>
      </div>

      {/* Linha do tempo por raia */}
      <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
        Tempo por raia
      </h4>
      <div className="space-y-1.5 mb-5">
        {data.agregado.map((a) => {
          const label = labelMap.get(a.status) || a.status;
          const cor = corMap.get(a.status) || "#94a3b8";
          const pct = (a.total_segundos / maxSegundos) * 100;
          return (
            <div key={a.status} className="flex items-center gap-3 text-xs">
              <div className="w-44 truncate" title={label}>
                {label}
                {a.passagens > 1 && (
                  <span className="ml-1 text-muted-foreground">({a.passagens}x)</span>
                )}
                {a.aberto && <span className="ml-1 text-primary">← atual</span>}
              </div>
              <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full"
                  style={{ width: `${pct}%`, backgroundColor: cor }}
                />
              </div>
              <div className="w-24 text-right tabular-nums">{formatarDuracao(a.total_segundos)}</div>
            </div>
          );
        })}
      </div>

      {/* Tabela detalhada */}
      <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
        Detalhe por passagem
      </h4>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left text-muted-foreground">
              <th className="px-2 py-1.5">Raia</th>
              <th className="px-2 py-1.5">Entrou</th>
              <th className="px-2 py-1.5">Saiu</th>
              <th className="px-2 py-1.5 text-right">Duração</th>
            </tr>
          </thead>
          <tbody>
            {[...data.rows].reverse().map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                    style={{ backgroundColor: corMap.get(r.status) || "#94a3b8" }}
                  />
                  {labelMap.get(r.status) || r.status}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {format(new Date(r.entrou_em), "dd/MM/yy HH:mm", { locale: ptBR })}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {r.saiu_em
                    ? format(new Date(r.saiu_em), "dd/MM/yy HH:mm", { locale: ptBR })
                    : "— em curso"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatarDuracao(
                    r.duracao_segundos ??
                      Math.floor((Date.now() - new Date(r.entrou_em).getTime()) / 1000)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  );
}