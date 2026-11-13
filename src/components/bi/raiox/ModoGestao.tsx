import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { mil, pct, useRaioXGestao, type FiltroRaioX } from "./useRaioX";

// Modo gestão (só GSS, spec §5): o mesmo filtro com o diagnóstico da operação.
// O que espera ação vem primeiro: médicos que responderam e estão sem resposta nossa há mais de 2 h.

import { nomeProprio } from "@/lib/textoDono";

const minutosTxt = (m: number | null) =>
  m === null ? "—" : m < 1 ? "< 1 min" : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;

export function ModoGestao({ filtro }: { filtro: FiltroRaioX }) {
  const { data: g, isLoading } = useRaioXGestao(filtro, true);
  if (isLoading || !g) return <Skeleton className="h-48 w-full" />;

  const tempo = g.mediana_primeira_resposta_min;
  const tempoTxt = minutosTxt(tempo);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Esperando resposta nossa</p>
          <p className={`mt-2 text-4xl font-semibold tabular-nums ${g.esperando_resposta > 0 ? "text-red-600" : ""}`}>{mil(g.esperando_resposta)}</p>
          <p className="mt-1 text-sm text-muted-foreground">médicos responderam e estão há mais de 2 h sem retorno · os mais recentes primeiro</p>
          {g.esperando.length > 0 && (
            <ul className="mt-4 divide-y border-t">
              {g.esperando.slice(0, 8).map((e) => (
                <li key={e.conversation_id}>
                  <Link to={`/conversas?conversa=${e.conversation_id}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 py-2 text-sm hover:bg-muted/50">
                    <span className="truncate font-medium text-primary">{nomeProprio(e.nome)}</span>
                    <span className="truncate text-muted-foreground">{e.campanha?.trim() || "—"}</span>
                    <span className="text-right text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.ultima_do_medico), { addSuffix: true, locale: ptBR })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo até a 1ª resposta</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{tempoTxt}</p>
          <p className="mt-1 text-sm text-muted-foreground">mediana da resposta de uma pessoa da equipe (sem contar a IA)</p>
          {g.sem_resposta_nossa > 0 && (
            <p className="mt-3 text-sm"><span className="font-medium tabular-nums">{mil(g.sem_resposta_nossa)}</span> nunca tiveram resposta de uma pessoa</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por campanha</h3>
          <p className="text-xs text-muted-foreground">% de interessados sobre quem respondeu</p>
        </div>
        {g.por_campanha.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma campanha com envio neste filtro.</p>
        ) : (
          // Fase 8.4 (BI do Maikon): o funil da campanha em uma linha. Interessado = marcado quente pela IA ou pela equipe.
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-[30%] pb-1.5 font-medium">Campanha</th>
                <th className="pb-1.5 text-right font-medium">Alcançados</th>
                <th className="pb-1.5 text-right font-medium">Responderam</th>
                <th className="pb-1.5 text-right font-medium">Interessados</th>
                <th className="pb-1.5 text-right font-medium">Fechados</th>
                <th className="pb-1.5 text-right font-medium" title="Mediana do tempo até a 1ª resposta nossa (IA ou pessoa)">1ª resposta</th>
                <th className="pb-1.5 text-right font-medium">Falharam</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {g.por_campanha.map((c) => (
                <tr key={c.id}>
                  <td className="truncate py-2 pr-3" title={c.nome.trim()}>{c.nome.trim()}</td>
                  <td className="py-2 text-right tabular-nums">{mil(c.alcancados)}</td>
                  <td className="py-2 text-right tabular-nums">{mil(c.responderam)} <span className="text-xs text-muted-foreground">{pct(c.responderam, c.alcancados)}%</span></td>
                  <td className="py-2 text-right tabular-nums">{mil(c.interessados)} <span className="text-xs text-muted-foreground">{pct(c.interessados, c.responderam)}%</span></td>
                  <td className={`py-2 text-right tabular-nums ${c.convertidos > 0 ? "font-semibold text-emerald-700" : ""}`}>{mil(c.convertidos)}</td>
                  <td className="py-2 text-right tabular-nums">{minutosTxt(c.resposta_min)}</td>
                  <td className={`py-2 text-right tabular-nums ${c.falharam > 0 ? "text-red-600" : ""}`}>{mil(c.falharam)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
