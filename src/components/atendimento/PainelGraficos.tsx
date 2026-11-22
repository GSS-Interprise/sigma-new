// Peças visuais do painel Tempo de resposta. Paleta validada (dataviz, validate_palette.js, 22/11/2026):
// verde-escuro = respondida dentro da meta; verde-claro = respondida depois; âmbar = sem resposta (espera você).
// Uma cor por significado, igual em todos os gráficos; legenda sempre com o número (o verde-claro tem pouco contraste).
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { type Indicador, type PontoSerie, tempoCurto } from "./useAtendimento";

export const COR = { meta: "#2e7d32", depois: "#79c47e", sem: "#c96a05", grade: "hsl(var(--border))", texto: "hsl(var(--muted-foreground))" };
// Escada da espera (fila): do âmbar claro ao vermelho. Só a fila usa vermelho: passou de 1 h é "quebrou".
export const COR_FAIXA = ["#d6d3d1", "#fcd34d", "#f59e0b", "#dc2626", "#991b1b"];

const fmtBucket = (iso: string, porHora: boolean) => {
  const d = new Date(iso);
  return porHora
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", timeZone: "America/Sao_Paulo" }) + "h"
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
};

export function Cartao({ titulo, apoio, children, className, acao }: { titulo: string; apoio?: string; children: ReactNode; className?: string; acao?: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{titulo}</h2>
          {apoio && <p className="text-xs text-muted-foreground">{apoio}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** Indicador contra a meta: número grande, barra até a meta e minigráfico do período. */
export function Kpi({ rotulo, valor, detalhe, progresso, bom, serie, cor }: {
  rotulo: string; valor: string; detalhe: string; progresso?: number | null; bom?: boolean | null; serie: (number | null)[]; cor: string;
}) {
  const pontos = serie.map((v, i) => ({ i, v }));
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className={cn("font-display text-3xl font-semibold tabular-nums", bom === false && "text-amber-700")}>{valor}</p>
        {pontos.length > 1 && (
          <div className="h-10 w-24 shrink-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                <Line type="monotone" dataKey="v" stroke={cor} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {progresso != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progresso))}%`, background: bom ? COR.meta : COR.sem }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{detalhe}</p>
    </div>
  );
}

/** Barra única com a fila dividida pelas faixas de espera, com a legenda numerada embaixo. */
export function BarraFaixas({ porFaixa, rotulos }: { porFaixa: number[]; rotulos: string[] }) {
  const total = porFaixa.reduce((s, n) => s + n, 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-amber-100/60" role="img" aria-label={`Fila por tempo de espera: ${rotulos.map((r, i) => `${r} ${porFaixa[i]}`).join(", ")}`}>
        {total > 0 && porFaixa.map((n, i) => n > 0 && <div key={i} style={{ flexGrow: n, background: COR_FAIXA[i] }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {rotulos.map((r, i) => (
          <li key={r} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COR_FAIXA[i] }} />
            {r} <strong className="font-semibold tabular-nums text-foreground">{porFaixa[i]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DicaSerie({ active, payload, label, porHora, meta }: { active?: boolean; payload?: { payload: PontoSerie }[]; label?: string; porHora: boolean; meta: number }) {
  if (!active || !payload?.length || !label) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{fmtBucket(label, porHora)}</p>
      <p>{p.esperas} pediram resposta</p>
      <p><span style={{ color: COR.meta }}>●</span> {p.em_meta} em até {meta} min</p>
      <p><span style={{ color: COR.depois }}>●</span> {p.depois} depois</p>
      <p><span style={{ color: COR.sem }}>●</span> {p.sem_resposta} sem resposta</p>
      {p.mediana_min != null && <p className="mt-1 text-muted-foreground">Mediana {tempoCurto(Math.round(p.mediana_min))}</p>}
    </div>
  );
}

export function GraficoVolume({ serie, porHora, meta }: { serie: PontoSerie[]; porHora: boolean; meta: number }) {
  const tot = serie.reduce((a, p) => ({ m: a.m + p.em_meta, d: a.d + p.depois, s: a.s + p.sem_resposta }), { m: 0, d: 0, s: 0 });
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.meta }} />Em até {meta} min <strong className="tabular-nums text-foreground">{tot.m}</strong></li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.depois }} />Depois <strong className="tabular-nums text-foreground">{tot.d}</strong></li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR.sem }} />Sem resposta <strong className="tabular-nums text-foreground">{tot.s}</strong></li>
      </ul>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={COR.grade} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickFormatter={(v) => fmtBucket(v, porHora)} tick={{ fontSize: 11, fill: COR.texto }} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COR.texto }} axisLine={false} tickLine={false} width={44} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} content={<DicaSerie porHora={porHora} meta={meta} />} />
            <Bar dataKey="em_meta" stackId="a" fill={COR.meta} stroke="hsl(var(--card))" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="depois" stackId="a" fill={COR.depois} stroke="hsl(var(--card))" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="sem_resposta" stackId="a" fill={COR.sem} stroke="hsl(var(--card))" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GraficoMediana({ serie, porHora, meta }: { serie: PontoSerie[]; porHora: boolean; meta: number }) {
  const dados = serie.map((p) => ({ bucket: p.bucket, mediana: p.mediana_min }));
  const max = Math.max(meta * 1.5, ...dados.map((d) => d.mediana ?? 0));
  return (
    <div className="h-[244px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={COR.grade} strokeDasharray="3 3" />
          <XAxis dataKey="bucket" tickFormatter={(v) => fmtBucket(v, porHora)} tick={{ fontSize: 11, fill: COR.texto }} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis domain={[0, Math.ceil(max)]} tickFormatter={(v) => `${v}`} tick={{ fontSize: 11, fill: COR.texto }} axisLine={false} tickLine={false} width={44} unit=" min" />
          <ReferenceLine y={meta} stroke={COR.meta} strokeDasharray="5 4" label={{ value: `meta ${meta} min`, position: "insideTopRight", fontSize: 11, fill: COR.meta }} />
          <Tooltip formatter={(v: number) => [tempoCurto(Math.round(v)), "Mediana"]} labelFormatter={(l) => fmtBucket(String(l), porHora)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Line type="monotone" dataKey="mediana" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Uma barra por pessoa: tempo mediano até a 1ª resposta, com a meta marcada; à direita, quanto ficou sem resposta. */
export function PorPessoa({ linhas, meta }: { linhas: Indicador[]; meta: number }) {
  const pessoas = linhas.filter((l) => !l.pessoa.startsWith("Automático"));
  const escala = Math.max(meta * 2, ...pessoas.map((l) => Number(l.mediana_min ?? 0)));
  if (!pessoas.length) return <p className="text-sm text-muted-foreground">Ninguém da equipe recebeu mensagem neste período.</p>;
  return (
    <ul className="space-y-4">
      {pessoas.map((l) => {
        const med = l.mediana_min == null ? null : Number(l.mediana_min);
        const dentro = med != null && med <= meta;
        return (
          <li key={`${l.pessoa_id}-${l.pessoa}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium" title={l.pessoa}>{l.pessoa}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {med == null ? "sem resposta" : tempoCurto(Math.round(med))}
                {l.sem_resposta > 0 && <span className="ml-2 font-semibold text-amber-800">{l.sem_resposta} sem resposta</span>}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-muted">
              {med != null && <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, (100 * med) / escala))}%`, background: dentro ? COR.meta : COR.sem }} />}
              <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground/40" style={{ left: `${(100 * meta) / escala}%` }} title={`meta ${meta} min`} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{l.respondidas} de {l.esperas} respondidas · {l.esperas ? Math.round((100 * l.em_10min) / l.esperas) : 0}% em até 10 min</p>
          </li>
        );
      })}
    </ul>
  );
}
