// Tempo de resposta da equipe no WhatsApp (docs/arquitetura/tempo-de-resposta-atendimento.md).
// Pergunta da tela (Ramone, coordenação): "quem está esperando resposta agora, há quanto tempo e com quem está?".
// Decisão: cobrar a pessoa (ou abrir a conversa). Topo: "Espera você" (fila agora) e 3 indicadores contra a meta;
// meio: a fila e quem responde como; baixo: o período (volume e mediana). Regras e avisos ficam nas outras abas.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ExternalLink, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  type Espera, FAIXAS, faixaDe, minutosDesde, type Periodo, PERIODOS, rpc, tempoCurto, type TipoNumero, TIPOS_NUMERO, useAgora, useFila,
  useIndicadores, useMetas, useNumerosPorTipo, usePodeGerir, useSerie, useTempoRealFila,
} from "@/components/atendimento/useAtendimento";
import { BarraFaixas, Cartao, COR, COR_FAIXA, GraficoMediana, GraficoVolume, Kpi, PorPessoa } from "@/components/atendimento/PainelGraficos";
import { ContatosMarcados } from "@/components/atendimento/ContatosMarcados";
import { AvisosConfig } from "@/components/atendimento/AvisosConfig";

const DIA_MIN = 24 * 60;
const ultimos4 = (n: string) => n.replace(/\D/g, "").slice(-4);
const iniciais = (s: string) => s.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export default function TempoDeResposta() {
  const { user } = useAuth();
  const pode = usePodeGerir(user?.id || null);
  return (
    <AppLayout headerActions={<h1 className="font-display text-2xl font-bold">Tempo de resposta</h1>}>
      <Tabs defaultValue="painel" className="space-y-5">
        <TabsList>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="contatos">Contatos marcados</TabsTrigger>
          <TabsTrigger value="avisos">Avisos</TabsTrigger>
        </TabsList>
        <TabsContent value="painel" data-portao="painel"><Painel /></TabsContent>
        <TabsContent value="contatos" data-portao="contatos"><ContatosMarcados podeGerir={!!pode.data} /></TabsContent>
        <TabsContent value="avisos" data-portao="avisos"><AvisosConfig podeGerir={!!pode.data} /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function Painel() {
  const agora = useAgora();
  useTempoRealFila();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  // Prospecção, escalas e clientes são operações diferentes: tudo abaixo (fila, indicadores, gráficos) segue o tipo.
  const [tipo, setTipo] = useState<TipoNumero>("todos");
  const fila = useFila();
  const ind = useIndicadores(periodo, tipo);
  const serie = useSerie(periodo, tipo);
  const metas = useMetas();
  const numerosTipo = useNumerosPorTipo();
  const meta = metas.data?.minutos ?? 10;
  const metaPct = metas.data?.pct ?? 80;

  const doTipo = (e: Espera) => tipo === "todos" || e.uso === tipo;
  const esperandoAgora = (fila.data || []).filter((e) => !e.ia_atuando && minutosDesde(e.esperando_desde, agora) < DIA_MIN);
  const contaTipo = (t: TipoNumero) => esperandoAgora.filter((e) => t === "todos" || e.uso === t).length;
  const numerosDoTipo = (numerosTipo.data || []).filter((n) => tipo === "todos" || n.uso === tipo).length;
  const rotuloTipo = TIPOS_NUMERO.find((t) => t.id === tipo)!.rotulo;

  const seletores = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Tipo de número">
        {TIPOS_NUMERO.map((t) => {
          const n = fila.isLoading ? null : contaTipo(t.id);
          return (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} onClick={() => setTipo(t.id)}
              title={n ? `${n} esperando resposta agora` : undefined}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors", tipo === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.rotulo}
              {!!n && <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tipo === t.id ? "bg-primary-foreground/20" : "bg-amber-100 text-amber-900")}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" /></span>
          Ao vivo
        </p>
        <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={periodo === p.id} onClick={() => setPeriodo(p.id)}
              className={cn("h-8 rounded-md px-3 text-sm font-medium transition-colors", periodo === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (tipo !== "todos" && numerosTipo.isSuccess && numerosDoTipo === 0) {
    return (
      <div className="space-y-5">
        {seletores}
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-6 py-16 text-center">
          <p className="font-medium">Nenhum número marcado como {rotuloTipo}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            O tempo de {rotuloTipo.toLowerCase()} aparece aqui quando um número tiver esse tipo. Marque o tipo e o responsável de cada número em Números WhatsApp.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2"><Link to="/numeros-whatsapp">Abrir Números WhatsApp</Link></Button>
        </div>
      </div>
    );
  }

  const todas = (fila.data || []).filter(doTipo);
  const recentes = todas.filter((e) => minutosDesde(e.esperando_desde, agora) < DIA_MIN);
  const esperandoPessoa = recentes.filter((e) => !e.ia_atuando);
  const maisAntiga = esperandoPessoa.reduce((m, e) => Math.max(m, minutosDesde(e.esperando_desde, agora)), 0);
  const porFaixa = FAIXAS.map((_, i) => esperandoPessoa.filter((e) => faixaDe(minutosDesde(e.esperando_desde, agora)) === i).length);

  const pts = serie.data || [];
  const tot = pts.reduce((a, p) => ({ esp: a.esp + p.esperas, meta: a.meta + p.em_meta, sem: a.sem + p.sem_resposta, auto: a.auto + p.automaticas }), { esp: 0, meta: 0, sem: 0, auto: 0 });
  const pct = tot.esp ? Math.round((100 * tot.meta) / tot.esp) : null;
  const humanas = (ind.data || []).filter((l) => !l.pessoa.startsWith("Automático"));
  // Mediana do período inteiro: a das pessoas, ponderada pelas respondidas (aproximação honesta sem reprocessar).
  const respondidas = humanas.reduce((s, l) => s + l.respondidas, 0);
  const mediana = respondidas ? humanas.reduce((s, l) => s + Number(l.mediana_min ?? 0) * l.respondidas, 0) / respondidas : null;
  const porHora = periodo === "hoje";
  const rotuloPeriodo = periodo === "hoje" ? "hoje" : periodo === "7d" ? "nos últimos 7 dias" : "nos últimos 30 dias";
  const semEco = (ind.data || []).length > 0 && respondidas === 0 && tot.esp > 0;

  return (
    <div className="space-y-5">
      {seletores}

      <div className="grid gap-4 xl:grid-cols-12">
        <section className={cn("rounded-xl border p-5 xl:col-span-4", esperandoPessoa.length ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60")}>
          <p className="text-sm font-medium text-muted-foreground">Espera você agora</p>
          {fila.isLoading ? <Skeleton className="mt-2 h-12 w-56" /> : (
            <>
              <p className="mt-1 font-display text-5xl font-bold tabular-nums leading-none">{esperandoPessoa.length}</p>
              <p className="mt-2 text-sm">
                {esperandoPessoa.length
                  ? <>{esperandoPessoa.length === 1 ? "conversa esperando" : "conversas esperando"} · a mais antiga há <strong className="whitespace-nowrap">{tempoCurto(maisAntiga)}</strong></>
                  : "Ninguém esperando resposta de uma pessoa nas últimas 24 h."}
              </p>
            </>
          )}
          <div className="mt-5"><BarraFaixas porFaixa={porFaixa} rotulos={FAIXAS} /></div>
        </section>
        <div className="grid gap-4 sm:grid-cols-3 xl:col-span-8">
          <Kpi rotulo={`Respondidas em até ${meta} min`} valor={pct == null ? "—" : `${pct}%`} detalhe={`Meta ${metaPct}% · ${tot.meta} de ${tot.esp} ${rotuloPeriodo}`}
            progresso={pct} bom={pct == null ? null : pct >= metaPct} cor={COR.meta}
            serie={pts.map((p) => (p.esperas ? (100 * p.em_meta) / p.esperas : null))} />
          <Kpi rotulo="Mediana até a 1ª resposta" valor={mediana == null ? "—" : tempoCurto(Math.round(mediana))} detalhe={`Meta ${meta} min · ${respondidas} respondidas por pessoas`}
            bom={mediana == null ? null : mediana <= meta} cor="hsl(var(--foreground))" serie={pts.map((p) => p.mediana_min)} />
          <Kpi rotulo="Ficaram sem resposta" valor={String(tot.sem)} detalhe={tot.auto ? `A IA respondeu outras ${tot.auto} sozinha` : `De ${tot.esp} que pediram resposta`}
            bom={tot.sem === 0} cor={COR.sem} serie={pts.map((p) => p.sem_resposta)} />
        </div>
      </div>

      {semEco && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Nenhuma resposta digitada no celular chegou ao Sigma {rotuloPeriodo}. Se a equipe respondeu pelo celular, a ligação do WhatsApp do celular com o Sigma caiu.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Fila todas={todas} agora={agora} carregando={fila.isLoading} erro={fila.isError ? (fila.error as Error).message : null} />
        <div className="space-y-4">
          <Cartao titulo="Quem responde como" apoio={`Mediana até a 1ª resposta ${rotuloPeriodo} · traço = meta`}>
            {ind.isLoading ? <Skeleton className="h-24 w-full" /> : ind.isError ? <p className="text-sm text-destructive">{(ind.error as Error).message}</p> : <PorPessoa linhas={ind.data || []} meta={meta} />}
            {humanas.some((l) => !l.pessoa_id) && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Número sem responsável não mostra quem demorou. Defina em <Link className="underline" to="/numeros-whatsapp">Números WhatsApp</Link>.
              </p>
            )}
          </Cartao>
          <PorNumero esperas={esperandoPessoa} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Conversas que pediram resposta" apoio={porHora ? "Hoje, por hora" : `${PERIODOS.find((p) => p.id === periodo)?.rotulo}, por dia`}>
          {serie.isLoading ? <Skeleton className="h-56 w-full" /> : serie.isError ? <p className="text-sm text-destructive">{(serie.error as Error).message}</p>
            : pts.length ? <GraficoVolume serie={pts} porHora={porHora} meta={meta} /> : <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma mensagem pediu resposta {rotuloPeriodo}.</p>}
        </Cartao>
        <Cartao titulo="Mediana até a 1ª resposta" apoio="Em minutos · só respostas de pessoas (celular ou Sigma)">
          {serie.isLoading ? <Skeleton className="h-56 w-full" /> : pts.some((p) => p.mediana_min != null)
            ? <GraficoMediana serie={pts} porHora={porHora} meta={meta} />
            : <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma resposta de pessoa {rotuloPeriodo}.</p>}
        </Cartao>
      </div>
    </div>
  );
}

function PorNumero({ esperas }: { esperas: Espera[] }) {
  const porNumero = useMemo(() => {
    const m = new Map<string, { numero: string; dono: string | null; n: number }>();
    for (const e of esperas) {
      if (!m.has(e.numero)) m.set(e.numero, { numero: e.numero, dono: e.responsavel_nome, n: 0 });
      m.get(e.numero)!.n++;
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.numero.localeCompare(b.numero));
  }, [esperas]);
  const max = Math.max(1, ...porNumero.map((x) => x.n));
  return (
    <Cartao titulo="Esperando, por número" apoio="Últimas 24 h">
      {!porNumero.length ? <p className="text-sm text-muted-foreground">Nenhum número com conversa esperando.</p> : (
        <ul className="space-y-2.5">
          {porNumero.map((x) => (
            <li key={x.numero} className="grid grid-cols-[88px_minmax(0,1fr)_28px] items-center gap-3 text-sm">
              <span className="truncate tabular-nums text-muted-foreground" title={x.dono || "Sem responsável"}>final {ultimos4(x.numero)}</span>
              <span className="h-2 rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(100 * x.n) / max}%`, background: COR_FAIXA[2] }} /></span>
              <span className="text-right font-semibold tabular-nums">{x.n}</span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function Fila({ todas, agora, carregando, erro }: { todas: Espera[]; agora: Date; carregando: boolean; erro: string | null }) {
  const [janela, setJanela] = useState<"recentes" | "antigas">("recentes");
  const [pessoa, setPessoa] = useState("todas");
  const opcoesPessoa = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of todas) m.set(e.responsavel_id || "sem", e.responsavel_nome || "Sem responsável no número");
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todas]);
  const daPessoa = todas.filter((e) => pessoa === "todas" || (e.responsavel_id || "sem") === pessoa);
  const recentes = daPessoa.filter((e) => minutosDesde(e.esperando_desde, agora) < DIA_MIN);
  const antigas = daPessoa.filter((e) => minutosDesde(e.esperando_desde, agora) >= DIA_MIN);
  const lista = janela === "recentes" ? recentes : antigas;
  const ordenada = [...lista].sort((a, b) => {
    const fa = faixaDe(minutosDesde(a.esperando_desde, agora)), fb = faixaDe(minutosDesde(b.esperando_desde, agora));
    if (fa !== fb) return fb - fa;
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    return a.esperando_desde.localeCompare(b.esperando_desde);
  });
  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-base font-semibold">Fila</h2>
          <div className="flex gap-1" role="radiogroup" aria-label="Período da fila">
            {([["recentes", `Últimas 24 h · ${recentes.length}`], ["antigas", `Mais antigas · ${antigas.length}`]] as const).map(([id, r]) => (
              <button key={id} type="button" role="radio" aria-checked={janela === id} onClick={() => setJanela(id)}
                className={cn("h-8 rounded-md px-2.5 text-sm font-medium", janela === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{r}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {janela === "antigas" && antigas.length > 0 && <EncerrarTodas ids={antigas.map((e) => e.conversation_id)} />}
          <Select value={pessoa} onValueChange={setPessoa}>
            <SelectTrigger className="h-9 w-[200px]" aria-label="Filtrar por pessoa"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as pessoas</SelectItem>
              {opcoesPessoa.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>
      {erro ? <p className="p-6 text-sm text-destructive">Não deu para carregar a fila: {erro}</p>
        : carregando ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        : ordenada.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-5 w-5" /></span>
            <p className="font-medium">{janela === "recentes" ? "Ninguém esperando agora" : "Nenhuma espera antiga"}</p>
            <p className="text-sm text-muted-foreground">{janela === "recentes" ? "Toda mensagem das últimas 24 h teve resposta." : "A fila está limpa."}</p>
          </div>
        ) : <ul className="divide-y">{ordenada.slice(0, 200).map((e) => <LinhaEspera key={e.conversation_id} e={e} agora={agora} />)}</ul>}
      {ordenada.length > 200 && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Mostrando as 200 de maior espera de {ordenada.length}.</p>}
    </section>
  );
}

function LinhaEspera({ e, agora }: { e: Espera; agora: Date }) {
  const qc = useQueryClient();
  const min = minutosDesde(e.esperando_desde, agora);
  const f = faixaDe(min);
  const encerrar = useMutation({
    mutationFn: async () => { const { error } = await rpc("atendimento_encerrar", { p_conversation_id: e.conversation_id }); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Conversa encerrada. Volta para a fila se o contato escrever de novo."); qc.invalidateQueries({ queryKey: ["atendimento-fila"] }); },
    onError: (err) => toast.error(`Não deu para encerrar: ${(err as Error).message}`),
  });
  const nome = e.contato_marcado || e.contato_nome;
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
        {iniciais(nome)}
        {e.contato_marcado && <Star className="absolute -right-1 -top-1 h-4 w-4 fill-amber-400 text-amber-500" aria-label="Contato marcado" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-semibold">{nome}</span>
          {e.contato_marcado && <span className="shrink-0 text-xs text-muted-foreground">{e.contato_tipo === "cliente" ? "Cliente" : e.contato_tipo}</span>}
          {e.ia_atuando && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"><Bot className="h-3 w-3" />IA atuando</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{e.mensagens > 1 ? `${e.mensagens} mensagens · ` : ""}{e.ultima_mensagem || "—"}</p>
      </div>
      <div className="hidden w-[140px] shrink-0 text-right text-xs lg:block">
        <p className="truncate font-medium">{e.responsavel_nome || "Sem responsável"}</p>
        <p className="text-muted-foreground">número final {ultimos4(e.numero)}</p>
      </div>
      <div className="flex w-[104px] shrink-0 flex-col items-end gap-1">
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums" style={{ color: e.ia_atuando ? undefined : f >= 3 ? "#b91c1c" : f >= 1 ? "#b45309" : undefined }}>{tempoCurto(min)}</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (100 * Math.log10(1 + min)) / Math.log10(1 + DIA_MIN))}%`, background: e.ia_atuando ? "#d6d3d1" : COR_FAIXA[f] }} />
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to={`/conversas?conversa=${e.conversation_id}`}><ExternalLink className="mr-1 h-3.5 w-3.5" />Abrir</Link>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Encerrar sem responder" disabled={encerrar.isPending} onClick={() => encerrar.mutate()}>
              {encerrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Encerrar sem responder (ex.: "ok, obrigado")</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

function EncerrarTodas({ ids }: { ids: string[] }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const m = useMutation({
    mutationFn: async () => { const { data, error } = await rpc("atendimento_encerrar_varias", { p_ids: ids.slice(0, 1000), p_motivo: "faxina de esperas antigas" }); if (error) throw new Error(error.message); return Number(data || 0); },
    onSuccess: (n) => { toast.success(`${n} conversas encerradas. Voltam para a fila se o contato escrever de novo.`); setAberto(false); qc.invalidateQueries({ queryKey: ["atendimento-fila"] }); },
    onError: (err) => toast.error(`Não deu para encerrar: ${(err as Error).message}`),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Encerrar as {ids.length}</Button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar {ids.length} conversas antigas?</AlertDialogTitle>
            <AlertDialogDescription>Elas saem da fila sem resposta. Se o contato escrever de novo, a conversa volta sozinha.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); m.mutate(); }} disabled={m.isPending}>
              {m.isPending ? "Encerrando…" : `Encerrar as ${ids.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
