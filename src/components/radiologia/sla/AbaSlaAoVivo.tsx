// SLA ao vivo: fila de exames não laudados do PACS (coletor na estação da GSS), com prazo por origem.
// Pergunta da tela: "Algum exame vai estourar o prazo, e o médico já sabe?" Quem usa: Wagner e Brenda.
// Topo: vencidos e quase vencidos. Coletor só aparece quando quebra. Sem nome de paciente (LGPD): o exame é achado
// no PACS pela origem e pela hora.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ORIGEM, type Alerta, type Exame, diaHora, duracao, ehHoje, horaCurta, situacaoPrazo, useAlertas, useColetor, useFila,
} from "./useSla";
import { ExameSlaDialog } from "./ExameSlaDialog";
import { OrigemSelo, textoPrazo } from "./pecas";

const TIPO_ALERTA: Record<Alerta["tipo"], string> = { prazo: "80% do prazo", vencido: "Prazo vencido", sem_escala: "Sem escala" };

function situacao(e: Exame, alertas: Alerta[]) {
  if (e.silenciado_em) return { texto: "Não precisa de laudo", tom: "text-muted-foreground" };
  if (e.assumido_em) {
    return { texto: `Assumido${e.assumido_por ? ` por ${e.assumido_por}` : ""} às ${horaCurta(e.assumido_em)}`, tom: "text-emerald-700" };
  }
  const ultimo = alertas.find((a) => a.exame_id === e.id);
  if (!ultimo) return { texto: "Sem aviso ainda", tom: "text-muted-foreground" };
  if (ultimo.status === "falhou") return { texto: `Aviso falhou às ${horaCurta(ultimo.criado_em)}`, tom: "text-red-700" };
  if (ultimo.tipo === "sem_escala" || ultimo.papel === "sem_escala") return { texto: `Ninguém na escala (e-mail às ${horaCurta(ultimo.criado_em)})`, tom: "text-amber-700" };
  return { texto: `Avisado às ${horaCurta(ultimo.criado_em)}${ultimo.destino_nome ? ` · ${ultimo.destino_nome}` : ""}`, tom: "text-foreground" };
}

export function AbaSlaAoVivo() {
  const fila = useFila();
  const coletor = useColetor();
  const ids = useMemo(() => (fila.data ?? []).map((e) => e.id), [fila.data]);
  const alertasFila = useAlertas(ids);
  const recentes = useAlertas();
  const [agora, setAgora] = useState(Date.now());
  const [filtro, setFiltro] = useState<"atencao" | "todos">("atencao");
  const [aberto, setAberto] = useState<Exame | null>(null);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const linhas = useMemo(() => {
    const ordem = { vencido: 0, perto: 1, ok: 2 } as const;
    return (fila.data ?? []).map((e) => ({ e, s: situacaoPrazo(e, agora) }))
      .sort((a, b) => ordem[a.s.estado] - ordem[b.s.estado] || a.s.faltaMin - b.s.faltaMin);
  }, [fila.data, agora]);
  const precisa = (l: (typeof linhas)[number]) => l.s.estado !== "ok" && !l.e.assumido_em && !l.e.silenciado_em;
  const vencidos = linhas.filter((l) => l.s.estado === "vencido" && !l.e.silenciado_em).length;
  const perto = linhas.filter((l) => l.s.estado === "perto" && !l.e.silenciado_em).length;
  const noPrazo = linhas.filter((l) => l.s.estado === "ok").length;
  const atencao = linhas.filter(precisa);
  const visiveis = filtro === "atencao" ? atencao : linhas;
  const alertas = alertasFila.data ?? [];

  return (
    <div className="space-y-4">
      {coletor.data?.queda && (
        <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              A fila não está sendo lida desde {coletor.data.queda.ultima_ok_em ? diaHora(coletor.data.queda.ultima_ok_em) : "o início"}.
              Os avisos ao médico estão parados.
            </p>
            {coletor.data.queda.motivo && <p>{coletor.data.queda.motivo}</p>}
          </div>
        </div>
      )}
      {coletor.data && !coletor.data.alertasAtivos && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <BellOff className="h-4 w-4 shrink-0" />
          Avisos automáticos ao médico desligados. Ligue na aba Escala de plantão.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Contador valor={vencidos} rotulo="Vencidos" tom={vencidos ? "text-red-700" : undefined} carregando={fila.isLoading} />
          <Contador valor={perto} rotulo="Perto do prazo (80%)" tom={perto ? "text-amber-700" : undefined} carregando={fila.isLoading} />
          <Contador valor={noPrazo} rotulo="No prazo" carregando={fila.isLoading} />
        </div>
        <div className="flex items-center gap-3">
          {coletor.data?.ultimaOk && !coletor.data.queda && (
            <span className="text-xs text-muted-foreground">Fila lida às {horaCurta(coletor.data.ultimaOk)}</span>
          )}
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Filtro da fila">
            <Button size="sm" variant={filtro === "atencao" ? "default" : "ghost"} className="h-8" onClick={() => setFiltro("atencao")}>
              Precisam de atenção ({atencao.length})
            </Button>
            <Button size="sm" variant={filtro === "todos" ? "default" : "ghost"} className="h-8" onClick={() => setFiltro("todos")}>
              Fila inteira ({linhas.length})
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[96px_150px_minmax(180px,1fr)_minmax(200px,1.2fr)_96px] gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground xl:grid">
            <span>Origem</span><span>Exame</span><span>Prazo</span><span>Situação</span><span />
          </div>
          {fila.isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}
          {fila.error && <p className="p-4 text-sm text-red-700">Não deu para carregar a fila: {(fila.error as Error).message}</p>}
          {!fila.isLoading && !fila.error && visiveis.length === 0 && (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {linhas.length === 0 ? "Fila vazia: nenhum exame esperando laudo." : `Nenhum exame precisa de atenção agora. ${linhas.length} na fila, todos no prazo ou assumidos.`}
            </div>
          )}
          {visiveis.map(({ e, s }) => {
            const sit = situacao(e, alertas);
            return (
              <div key={e.id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm last:border-b-0 xl:grid-cols-[96px_150px_minmax(180px,1fr)_minmax(200px,1.2fr)_96px]">
                <OrigemSelo origem={e.origem} />
                <span className="font-medium tabular-nums">
                  {ehHoje(e.inicio_em) ? `Exame das ${horaCurta(e.inicio_em)}` : `Exame de ${diaHora(e.inicio_em)}`}
                </span>
                {/* abaixo de xl: linha 1 = origem, exame, prazo; linha 2 = situação e Abrir */}
                <div className="flex items-center justify-end gap-2 xl:justify-start">
                  <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded bg-muted">
                    <div className={cn("h-full", s.estado === "vencido" ? "bg-red-600" : s.estado === "perto" ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
                  </div>
                  <span className={cn("whitespace-nowrap tabular-nums", s.estado === "vencido" ? "font-semibold text-red-700" : s.estado === "perto" ? "text-amber-700" : "text-muted-foreground")}>
                    {textoPrazo(s.faltaMin)}
                  </span>
                </div>
                <span className={cn("col-span-2 truncate xl:col-span-1", sit.tom)} title={sit.texto}>{sit.texto}</span>
                <div className="text-right">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setAberto(e)}>Abrir</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Últimos avisos</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {recentes.isLoading && <Skeleton className="h-8 w-full" />}
          {!recentes.isLoading && !(recentes.data ?? []).length && <p className="text-muted-foreground">Nenhum aviso enviado ainda.</p>}
          {(recentes.data ?? []).map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 border-b py-1.5 last:border-b-0">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{diaHora(a.criado_em)}</span>
              <span className="w-28 shrink-0 font-medium">{TIPO_ALERTA[a.tipo]}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.destino_nome ?? "—"} · {a.canal === "whatsapp" ? "WhatsApp" : a.canal === "email" ? "e-mail" : "ligação"}
              </span>
              <span className={cn("shrink-0", a.status === "falhou" ? "text-red-700" : a.status === "respondido" ? "text-emerald-700" : "text-muted-foreground")}>
                {a.status === "falhou" ? "falhou" : a.status === "respondido" ? `assumiu às ${horaCurta(a.respondido_em!)}` : "enviado"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <ExameSlaDialog exame={aberto} alertas={alertas.filter((a) => a.exame_id === aberto?.id)} onClose={() => setAberto(null)} agora={agora} />
    </div>
  );
}

function Contador({ valor, rotulo, tom, carregando }: { valor: number; rotulo: string; tom?: string; carregando?: boolean }) {
  return (
    <div className="min-w-[120px] rounded-md border bg-card px-4 py-2">
      <div className={cn("text-2xl font-semibold tabular-nums", tom)}>{carregando ? "–" : valor}</div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}
