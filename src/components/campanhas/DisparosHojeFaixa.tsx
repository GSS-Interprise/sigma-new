import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Send, AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

// Faixa de disparos (Home e aba Campanhas), pedida pelo Raul em 16/11/2026 para os sócios verem de longe quanto a
// máquina de prospecção dispara por dia.
// Pergunta da tela: "Quantos disparos por dia estamos fazendo, e hoje está no ritmo?"
// Número principal = ESTIMATIVA por dia no ritmo atual (RPC campanhas_disparos_painel: limite, intervalo entre
// mensagens e fila de cada campanha ativa pelo número oficial). Hoje, 7 dias e campanhas vêm abaixo.
// Disparo = 1ª mensagem de campanha enviada a um médico (conta também a que a Meta não entregou).
// Máquina (fórmula, fonte) fica fora; o único aviso é "nada saiu" dentro do horário de envio.

type Painel = {
  hoje: number;
  estimativa_dia: number;
  fila: number;
  ultimo_envio: string | null;
  serie: { dia: string; medicos: number }[];
  campanhas: { campanha: string; hoje: number; estimativa: number }[];
};

const DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Minutos desde o último envio, só quando o silêncio importa: dia útil, 8h–17h em Brasília (janela das campanhas). */
function silencioMin(ultimo: string | null, agora = new Date()): number | null {
  const brt = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = brt.getDay();
  const hora = brt.getHours();
  if (dia === 0 || dia === 6 || hora < 8 || hora >= 17) return null; // 7h–8h: a primeira leva ainda está saindo
  if (!ultimo) return null;
  const min = Math.floor((agora.getTime() - new Date(ultimo).getTime()) / 60000);
  return min >= 20 ? min : null;
}

export function DisparosHojeFaixa({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["campanhas-disparos-painel"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campanhas_disparos_painel" as never, { p_dias: 7 } as never);
      if (error) throw error;
      return data as unknown as Painel;
    },
  });

  if (isLoading) return <Skeleton className={`h-[112px] w-full rounded-xl ${className}`} />;
  if (isError || !data) {
    return (
      <div className={`flex h-[112px] items-center rounded-xl border bg-card px-5 text-sm text-muted-foreground ${className}`}>
        Não foi possível carregar os disparos. A página tenta de novo sozinha a cada minuto.
      </div>
    );
  }

  const est = data.estimativa_dia;
  const pct = est > 0 ? Math.min(100, Math.round((data.hoje / est) * 100)) : 0;
  const diasFila = est > 0 ? Math.ceil(data.fila / est) : null;
  const maxSerie = Math.max(1, est, ...data.serie.map((d) => d.medicos));
  const silencio = silencioMin(data.ultimo_envio);

  return (
    <button
      type="button"
      onClick={() => navigate("/prospeccao")}
      className={`group grid h-auto w-full grid-cols-1 items-center gap-4 rounded-xl border bg-card px-5 py-4 text-left shadow-sm transition-colors hover:border-primary/40 lg:h-[112px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] lg:gap-6 lg:py-0 ${className}`}
      aria-label={`Estimativa de ${est} disparos por dia; ${data.hoje} hoje. Abrir campanhas.`}
    >
      {/* 1. A estimativa por dia e o andamento de hoje contra ela */}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Send className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">Disparos por dia (estimativa)</span>
        </p>
        <p className="mt-1 text-4xl font-bold leading-none tabular-nums text-foreground">
          {est > 0 ? `~${fmt(est)}` : "0"}
        </p>
        {est > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <span className="truncate text-xs text-muted-foreground">
              Hoje <strong className="font-semibold text-foreground tabular-nums">{fmt(data.hoje)}</strong>
              {diasFila !== null && data.fila > 0 && <> · fila de {fmt(data.fila)} ≈ {diasFila} {diasFila === 1 ? "dia útil" : "dias úteis"}</>}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Nenhuma campanha ativa disparando.</p>
        )}
      </div>

      {/* 2. Os últimos 7 dias (uma série: sem legenda; hoje em destaque; tracejado = estimativa) */}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Últimos 7 dias</p>
        <div className="relative mt-1.5 flex h-12 items-end gap-1.5" role="img" aria-label={data.serie.map((d) => `${d.dia}: ${d.medicos}`).join(", ")}>
          {est > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
              style={{ bottom: `${12 + Math.round((est / maxSerie) * 34)}px` }}
              title={`Estimativa: ${fmt(est)} por dia`}
            />
          )}
          {data.serie.map((d, i) => {
            const hoje = i === data.serie.length - 1;
            const dt = new Date(`${d.dia}T12:00:00`);
            return (
              <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${DIA[dt.getDay()]} ${dt.getDate()}: ${fmt(d.medicos)} disparos`}>
                <div
                  className={`w-full max-w-[18px] rounded-t ${hoje ? "bg-primary" : "bg-primary/30"}`}
                  style={{ height: `${Math.max(d.medicos > 0 ? 4 : 2, Math.round((d.medicos / maxSerie) * 34))}px` }}
                />
                <span className={`text-[10px] leading-none ${hoje ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {hoje ? "Hoje" : DIA[dt.getDay()]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Cada campanha ativa: hoje / estimativa do dia */}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Hoje por campanha</p>
        {data.campanhas.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">Nenhuma campanha ativa.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {data.campanhas.slice(0, 3).map((c) => (
              <li key={c.campanha} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate" title={c.campanha}>{c.campanha}</span>
                <span className="shrink-0 tabular-nums">
                  <strong className="font-semibold">{fmt(c.hoje)}</strong>
                  <span className="text-muted-foreground"> / ~{fmt(c.estimativa)}</span>
                </span>
              </li>
            ))}
            {data.campanhas.length > 3 && (
              <li className="text-xs text-muted-foreground">+{data.campanhas.length - 3} campanhas</li>
            )}
          </ul>
        )}
      </div>

      {/* 4. Só aparece quando quebra: nada saiu dentro do horário de envio */}
      <div className="flex items-center justify-end gap-2">
        {silencio !== null && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Nada saiu há {silencio >= 60 ? `${Math.floor(silencio / 60)} h` : `${silencio} min`}
          </span>
        )}
        <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:block" />
      </div>
    </button>
  );
}
