// Tempo de resposta da equipe no WhatsApp (docs/arquitetura/tempo-de-resposta-atendimento.md).
// Pergunta da tela (Ramone, coordenação): "quem está esperando resposta agora, há quanto tempo e com quem está?".
// Decisão: cobrar a pessoa (ou abrir a conversa). Topo: quantas esperando e a mais antiga; abaixo a fila pela maior
// espera; ao lado, como cada pessoa respondeu hoje. Fonte, regras e avisos ficam nas outras abas.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ExternalLink, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
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
  type Espera, FAIXAS, faixaDe, minutosDesde, rpc, tempoCurto, useAgora, useFila, useIndicadoresHoje, usePodeGerir, useTempoRealFila,
} from "@/components/atendimento/useAtendimento";
import { ContatosMarcados } from "@/components/atendimento/ContatosMarcados";
import { AvisosConfig } from "@/components/atendimento/AvisosConfig";

const DIA_MIN = 24 * 60;
// Um destaque por significado: âmbar = alguém precisa responder; vermelho = passou de 1 h.
const COR_FAIXA = [
  "bg-muted text-muted-foreground",
  "bg-amber-50 text-amber-800 border-amber-200",
  "bg-amber-100 text-amber-900 border-amber-300",
  "bg-red-50 text-red-700 border-red-200",
  "bg-red-100 text-red-800 border-red-300",
];
const ultimos4 = (n: string) => n.replace(/\D/g, "").slice(-4);

export default function TempoDeResposta() {
  const { user } = useAuth();
  const agora = useAgora();
  useTempoRealFila();
  const fila = useFila();
  const pode = usePodeGerir(user?.id || null);
  const [janela, setJanela] = useState<"recentes" | "antigas">("recentes");
  const [pessoa, setPessoa] = useState("todas");

  const todas = fila.data || [];
  const opcoesPessoa = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of todas) m.set(e.responsavel_id || "sem", e.responsavel_nome || "Sem responsável no número");
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todas]);
  const daPessoa = todas.filter((e) => pessoa === "todas" || (e.responsavel_id || "sem") === pessoa);
  const recentes = daPessoa.filter((e) => minutosDesde(e.esperando_desde, agora) < DIA_MIN);
  const antigas = daPessoa.filter((e) => minutosDesde(e.esperando_desde, agora) >= DIA_MIN);
  const lista = (janela === "recentes" ? recentes : antigas);
  // Cliente marcado primeiro na mesma faixa; dentro da faixa, maior espera primeiro.
  const ordenada = [...lista].sort((a, b) => {
    const fa = faixaDe(minutosDesde(a.esperando_desde, agora)), fb = faixaDe(minutosDesde(b.esperando_desde, agora));
    if (fa !== fb) return fb - fa;
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    return a.esperando_desde.localeCompare(b.esperando_desde);
  });
  const pessoasEsperando = recentes.filter((e) => !e.ia_atuando);
  const maisAntiga = pessoasEsperando.reduce((m, e) => Math.max(m, minutosDesde(e.esperando_desde, agora)), 0);
  const porFaixa = FAIXAS.map((_, i) => pessoasEsperando.filter((e) => faixaDe(minutosDesde(e.esperando_desde, agora)) === i).length);

  return (
    <AppLayout headerActions={<div><h1 className="text-2xl font-bold">Tempo de resposta</h1><p className="text-sm text-muted-foreground">Quem está esperando resposta nos números oficiais</p></div>}>
      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="contatos">Contatos marcados</TabsTrigger>
          <TabsTrigger value="avisos">Avisos</TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="space-y-4" data-portao="fila">
          <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-card p-4">
            <div className="min-w-0">
              {fila.isLoading ? <p className="text-sm text-muted-foreground">Carregando a fila…</p> : (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {pessoasEsperando.length} {pessoasEsperando.length === 1 ? "conversa esperando" : "conversas esperando"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pessoasEsperando.length ? <>A mais antiga espera há <strong className="text-foreground">{tempoCurto(maisAntiga)}</strong> · últimas 24 h, sem contar a IA</> : "Ninguém esperando resposta de uma pessoa nas últimas 24 h."}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Conversas por tempo de espera">
              {FAIXAS.map((f, i) => (
                <span key={f} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums", porFaixa[i] ? COR_FAIXA[i] : "border-transparent bg-muted/50 text-muted-foreground")}>
                  {f}: {porFaixa[i]}
                </span>
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 rounded-lg border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex gap-1" role="tablist" aria-label="Período">
                  <Button size="sm" variant={janela === "recentes" ? "secondary" : "ghost"} onClick={() => setJanela("recentes")}>Últimas 24 h ({recentes.length})</Button>
                  <Button size="sm" variant={janela === "antigas" ? "secondary" : "ghost"} onClick={() => setJanela("antigas")}>Mais antigas ({antigas.length})</Button>
                </div>
                <div className="flex items-center gap-2">
                  {janela === "antigas" && antigas.length > 0 && <EncerrarTodas ids={antigas.map((e) => e.conversation_id)} />}
                  <Select value={pessoa} onValueChange={setPessoa}>
                    <SelectTrigger className="h-9 w-[220px]" aria-label="Filtrar por pessoa"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as pessoas</SelectItem>
                      {opcoesPessoa.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {fila.isError ? (
                <p className="p-6 text-sm text-destructive">Não deu para carregar a fila: {(fila.error as Error).message}</p>
              ) : fila.isLoading ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
              ) : ordenada.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{janela === "recentes" ? "Nenhuma conversa esperando nas últimas 24 h." : "Nenhuma espera antiga. A fila está limpa."}</p>
              ) : (
                <ul className="divide-y">{ordenada.slice(0, 200).map((e) => <LinhaEspera key={e.conversation_id} e={e} agora={agora} />)}</ul>
              )}
              {ordenada.length > 200 && <p className="border-t p-3 text-xs text-muted-foreground">Mostrando as 200 de maior espera de {ordenada.length}.</p>}
            </section>
            <PorPessoaHoje />
          </div>
        </TabsContent>

        <TabsContent value="contatos" data-portao="contatos"><ContatosMarcados podeGerir={!!pode.data} /></TabsContent>
        <TabsContent value="avisos" data-portao="avisos"><AvisosConfig podeGerir={!!pode.data} /></TabsContent>
      </Tabs>
    </AppLayout>
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
  return (
    <li className="flex items-center gap-3 p-3">
      <span className={cn("w-[108px] shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-center text-sm font-semibold tabular-nums", e.ia_atuando ? COR_FAIXA[0] : COR_FAIXA[f])}>{tempoCurto(min)}</span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {e.contato_marcado && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Contato marcado" />}
          <span className="truncate">{e.contato_marcado || e.contato_nome}</span>
          {e.contato_marcado && <span className="shrink-0 text-xs font-normal text-muted-foreground">{e.contato_tipo === "cliente" ? "Cliente" : e.contato_tipo}</span>}
          {e.ia_atuando && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground"><Bot className="h-3 w-3" />IA atuando</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{e.mensagens > 1 ? `${e.mensagens} mensagens · ` : ""}{e.ultima_mensagem || "—"}</p>
      </div>
      <div className="hidden w-[150px] shrink-0 text-right text-xs text-muted-foreground lg:block">
        <p className="truncate font-medium text-foreground">{e.responsavel_nome || "Sem responsável"}</p>
        <p>número final {ultimos4(e.numero)}</p>
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

function PorPessoaHoje() {
  const ind = useIndicadoresHoje();
  const linhas = ind.data || [];
  const semDono = linhas.some((l) => !l.pessoa_id && !l.pessoa.startsWith("Automático"));
  return (
    <section className="h-fit rounded-lg border bg-card">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold">Hoje, por pessoa</h2>
        <p className="text-xs text-muted-foreground">Tempo até a 1ª resposta, pelo celular ou pelo Sigma</p>
      </div>
      {ind.isLoading ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        : ind.isError ? <p className="p-4 text-sm text-destructive">Não deu para carregar: {(ind.error as Error).message}</p>
        : linhas.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Ninguém escreveu para os números hoje ainda.</p>
        : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Quem</th><th className="px-2 py-2 text-right font-medium">Mediana</th>
              <th className="px-2 py-2 text-right font-medium">Em 10 min</th><th className="px-3 py-2 text-right font-medium">Sem resposta</th>
            </tr></thead>
            <tbody className="divide-y">
              {linhas.map((l) => (
                <tr key={`${l.pessoa_id}-${l.pessoa}`}>
                  <td className="max-w-[130px] truncate px-3 py-2" title={l.pessoa}>{l.pessoa}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.mediana_min == null ? "—" : tempoCurto(Math.round(Number(l.mediana_min)))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.esperas ? `${Math.round((100 * l.em_10min) / l.esperas)}%` : "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", l.sem_resposta ? "font-semibold text-amber-800" : "text-muted-foreground")}>{l.sem_resposta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {semDono && (
        <p className="border-t p-3 text-xs text-muted-foreground">
          Número sem responsável não mostra quem demorou. Defina quem está com cada número em{" "}
          <Link className="underline" to="/numeros-whatsapp">Números WhatsApp</Link>.
        </p>
      )}
    </section>
  );
}
