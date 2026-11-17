// Furos do Dr. Escala (Raul, 17/11/2026): onde falta médico nos próximos dias, para a diretoria ver sem pedir a ninguém.
// Lê drescala_escala_v, que a rotina drescala_escalas da VPS sincroniza todo dia (vps/sigma-rotinas/drescala.py).
// É o mesmo dado que o Claude dos sócios responde (domínio escalas do sigma-mcp), então a tela e o Claude batem.
// A aba antiga de escalas lia a API do Dr. Escala ao vivo (edge drescala-bi) e não sabia o que era furo.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface PlantaoV {
  id: number;
  data: string;
  inicio: string;
  fim: string;
  hospital: string | null;
  cidade: string | null;
  setor: string | null;
  furo: boolean;
  anunciado: boolean | null;
  atualizado_em: string | null;
}

const DIAS = 14;
const TZ = "America/Sao_Paulo";

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hora = (ts: string) => new Date(ts).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const diaLongo = (iso: string, hoje: string) => {
  if (iso === hoje) return "Hoje";
  if (iso === somaDias(hoje, 1)) return "Amanhã";
  const s = new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function FurosDrEscala() {
  const hoje = hojeSP();
  const ate = somaDias(hoje, DIAS - 1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["drescala-furos", hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drescala_escala_v" as any)
        .select("id, data, inicio, fim, hospital, cidade, setor, furo, anunciado, atualizado_em")
        .gte("data", hoje)
        .lte("data", ate)
        .order("data")
        .order("inicio")
        .order("id")
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as PlantaoV[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const r = useMemo(() => {
    const todos = data || [];
    const furos = todos.filter((p) => p.furo);
    const semana = somaDias(hoje, 6);
    const porDia = new Map<string, PlantaoV[]>();
    for (const f of furos) porDia.set(f.data, [...(porDia.get(f.data) || []), f]);
    const lido = todos.reduce<string | null>((m, p) => (p.atualizado_em && (!m || p.atualizado_em > m) ? p.atualizado_em : m), null);
    return {
      furosHoje: furos.filter((f) => f.data === hoje).length,
      furosSemana: furos.filter((f) => f.data <= semana).length,
      plantoesSemana: todos.filter((p) => p.data <= semana).length,
      furosPeriodo: furos.length,
      porDia: [...porDia.entries()],
      lido,
    };
  }, [data, hoje]);

  const cobertura = r.plantoesSemana ? Math.round(((r.plantoesSemana - r.furosSemana) / r.plantoesSemana) * 1000) / 10 : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Furos de escala</h3>
          <p className="text-sm text-muted-foreground">Plantões sem médico nos próximos {DIAS} dias, pelo Dr. Escala</p>
        </div>
        {r.lido && (
          <p className="text-xs text-muted-foreground">
            Lido às {new Date(r.lido).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : isError ? (
        <p className="mt-4 text-sm text-destructive">Não consegui ler as escalas agora. Recarregue a página.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Numero rotulo="Furos hoje" valor={r.furosHoje} alerta={r.furosHoje > 0} />
            <Numero rotulo="Furos em 7 dias" valor={r.furosSemana} alerta={r.furosSemana > 0} />
            <Numero
              rotulo="Cobertura em 7 dias"
              valor={cobertura === null ? "—" : `${cobertura.toLocaleString("pt-BR")}%`}
              apoio={`${r.plantoesSemana.toLocaleString("pt-BR")} plantões`}
            />
          </div>

          {r.porDia.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Nenhum furo nos próximos {DIAS} dias.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {r.porDia.map(([dia, lista]) => (
                <div key={dia}>
                  <p className="mb-1.5 text-sm font-semibold">
                    {diaLongo(dia, hoje)}
                    <span className="ml-2 font-normal text-muted-foreground">{lista.length} {lista.length === 1 ? "furo" : "furos"}</span>
                  </p>
                  <ul className="divide-y rounded-md border">
                    {lista.map((f) => (
                      <li key={f.id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
                        <span className="tabular-nums text-muted-foreground">{hora(f.inicio)}–{hora(f.fim)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium" title={f.hospital || ""}>{f.hospital || "Hospital sem nome"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[f.setor, f.cidade].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {f.anunciado ? (
                          <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Anunciado</span>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">Sem anúncio</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Numero({ rotulo, valor, apoio, alerta }: { rotulo: string; valor: number | string; apoio?: string; alerta?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums ${alerta ? "text-amber-600" : ""}`}>
        {alerta && <AlertTriangle className="h-4 w-4" />}
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
      {apoio && <p className="text-xs text-muted-foreground">{apoio}</p>}
    </div>
  );
}
