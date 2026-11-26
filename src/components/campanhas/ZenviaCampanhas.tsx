import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ZenviaKanban } from "./ZenviaKanban";

// Disparos pela Zenvia como campanhas, uma por especialidade (pedido do Raul em 25/11/2026: "monitoramento do Zenvia
// dentro de uma campanha Zenvia xxxx"). A Zenvia dispara fora do Sigma; desde 26/11 o cartão abre o Kanban dos médicos
// (ZenviaKanban), com a conversa de quem respondeu. Pergunta da tela: "Quanto saiu pela Zenvia em cada especialidade, e quantos médicos responderam?"
// Dados: view zenvia_campanhas (migration 20261125200000), montada dos eventos do webhook da Zenvia.

type ZenviaCampanha = {
  id: string;
  especialidade_id: string | null;
  nome: string;
  status: "ativa" | "finalizada";
  disparos_hoje: number;
  disparos_7d: number;
  disparos: number;
  entregues: number;
  lidos: number;
  responderam: number;
  medicos: number;
  primeiro_dia: string;
  ultimo_disparo: string | null;
};

const fmt = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");
const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

function haQuanto(ts: string | null): string {
  if (!ts) return "sem disparo";
  const h = Math.floor((Date.now() - new Date(ts).getTime()) / 3_600_000);
  if (h < 1) return "há pouco";
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function ZenviaCampanhas() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["zenvia-campanhas"],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zenvia_campanhas" as never)
        .select("*")
        .order("disparos_hoje", { ascending: false })
        .order("status") // "ativa" (disparou na semana) antes de "finalizada"
        .order("disparos", { ascending: false })
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as ZenviaCampanha[];
    },
  });

  if (isLoading) return <Skeleton className="h-[160px] w-full rounded-xl" />;
  if (isError) {
    return (
      <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        Não foi possível carregar os disparos da Zenvia. A página tenta de novo sozinha.
      </p>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="zenvia-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="zenvia-titulo" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Radio className="h-4 w-4 text-cyan-700" />
          Disparos pela Zenvia
        </h2>
        <p className="text-xs text-muted-foreground">Feitos fora do Sigma, agrupados pela especialidade do médico.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((c) => (
          <ZenviaCard key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

function ZenviaCard({ c }: { c: ZenviaCampanha }) {
  const [aberto, setAberto] = useState(false);
  const especialidade = c.nome.replace(/^Zenvia · /, "");
  const situacao =
    c.disparos_hoje > 0
      ? { texto: `${fmt(c.disparos_hoje)} hoje`, cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" }
      : c.status === "ativa"
        ? { texto: "Últimos 7 dias", cls: "bg-slate-50 text-slate-700 ring-slate-200" }
        : { texto: "Sem disparo em 7 dias", cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  const funil = [
    { rotulo: "Entregues", n: c.entregues },
    { rotulo: "Lidas", n: c.lidos },
    { rotulo: "Responderam", n: c.responderam },
  ];

  return (
    <>
    <Card className="border-cyan-200/80 transition-colors hover:border-cyan-400">
      <button type="button" onClick={() => setAberto(true)} className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Abrir o Kanban de ${c.nome}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-700">Zenvia</p>
            <h3 className="flex min-w-0 items-center gap-1.5 font-semibold" title={especialidade}>
              <Stethoscope className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{especialidade}</span>
            </h3>
          </div>
          <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${situacao.cls}`}>
            {situacao.texto}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none tabular-nums">{fmt(c.disparos)}</span>
          <span className="text-xs text-muted-foreground">disparos · último {haQuanto(c.ultimo_disparo)}</span>
        </div>

        <dl className="grid grid-cols-3 gap-2 border-t pt-3">
          {funil.map((f) => (
            <div key={f.rotulo} className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">{f.rotulo}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {fmt(f.n)} <span className="text-xs font-normal text-muted-foreground">{pct(f.n, c.disparos)}%</span>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
      </button>
    </Card>
    <ZenviaKanban especialidadeId={c.especialidade_id} nome={c.nome} aberto={aberto} fechar={() => setAberto(false)} />
    </>
  );
}
