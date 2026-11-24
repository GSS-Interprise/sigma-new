import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowDown, Download, Loader2, Plus, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChakraConnectCard } from "./ChakraConnectCard";

/**
 * Números WhatsApp (e Configurações › WhatsApp) — pergunta da tela: "quais números oficiais posso usar agora, de que tipo
 * são, com quem estão e o que falta nos outros?". Topo: um resumo por tipo e o "sem responsável" (que filtra a lista);
 * conectar número novo abre o fluxo do Chakra num painel lateral (ChakraConnectCard modo "conectar").
 * A disponibilidade vem de whatsapp_numeros_recalcular_disponibilidade (saúde da Meta + entregas reais dos
 * últimos 7 dias). O "Enviar teste" manda um template, que é o tipo de envio que a Meta bloqueia: só ele prova.
 * É aqui que a GSS diz o tipo de cada número e quem está com ele: o Tempo de resposta separa os indicadores por tipo
 * e cobra o responsável (docs/arquitetura/tempo-de-resposta-atendimento.md §3g).
 */

type Numero = {
  connection_id: string;
  phone_e164: string;
  display_name: string | null;
  uso: Uso;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  conta: string;
  disponibilidade: "disponivel" | "atencao" | "indisponivel" | null;
  disponibilidade_motivo: string | null;
  disponibilidade_em: string | null;
  meta_pode_enviar: string | null;
  enviadas_7d: number;
  falhas_7d: number;
  ultima_entrega: string | null;
  templates_aprovados: number;
  tem_template_padrao: boolean;
};

const DISP = {
  disponivel: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300", ordem: 0 },
  atencao: { rotulo: "Atenção", classe: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300", ordem: 1 },
  indisponivel: { rotulo: "Não usar", classe: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300", ordem: 2 },
} as const;

// Ordem = ordem dos grupos na tela. Os três primeiros aparecem mesmo vazios (o Tempo de resposta tem uma aba para
// cada um); financeiro e pessoal só quando há número. Espelha o check whatsapp_chakra_connections_uso_check.
type Uso = "prospeccao" | "escalas" | "clientes" | "financeiro" | "pessoal";
// rotuloResumo = nome no resumo do topo (só os três "sempre").
const USOS: Array<{ id: Uso; rotulo: string; curto: string; rotuloResumo: string; sempre: boolean }> = [
  { id: "prospeccao", rotulo: "Prospecção de médicos", curto: "Prospecção", rotuloResumo: "Prospecção de médicos", sempre: true },
  { id: "escalas", rotulo: "Escalas (médicos escalados)", curto: "Escalas", rotuloResumo: "Escalas", sempre: true },
  { id: "clientes", rotulo: "Clientes", curto: "Clientes", rotuloResumo: "Clientes", sempre: true },
  { id: "financeiro", rotulo: "Financeiro", curto: "Financeiro", rotuloResumo: "Financeiro", sempre: false },
  { id: "pessoal", rotulo: "Pessoal", curto: "Pessoal", rotuloResumo: "Pessoal", sempre: false },
];
const USO_ROTULO = Object.fromEntries(USOS.map((u) => [u.id, u.rotulo])) as Record<Uso, string>;

function formatarTelefone(e164: string) {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

function haQuanto(iso: string | null) {
  if (!iso) return "nunca";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

function escapar(texto: string) {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function baixarPdf(numeros: Numero[]) {
  const linhas = numeros.map((n) => `<tr><td>${formatarTelefone(n.phone_e164)}</td><td>${escapar(n.display_name || "")}</td>`
    + `<td>${USO_ROTULO[n.uso] ?? n.uso}</td><td>${n.disponibilidade ? DISP[n.disponibilidade].rotulo : "—"}</td>`
    + `<td>${escapar(n.disponibilidade_motivo || "")}</td><td>${n.tem_template_padrao ? "Sim" : "Não"}</td>`
    + `<td>${escapar(n.responsavel_nome || "—")}</td></tr>`).join("");
  const janela = window.open("", "_blank");
  if (!janela) {
    toast.error("O navegador bloqueou a janela. Libere pop-ups para baixar a lista.");
    return;
  }
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Números WhatsApp oficiais — GSS</title>
    <style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f5}</style>
    </head><body><h1>Números WhatsApp oficiais — GSS</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
    <table><thead><tr><th>Número</th><th>Nome</th><th>Tipo</th><th>Situação</th><th>Motivo</th><th>Modelo padrão</th><th>Responsável</th></tr></thead>
    <tbody>${linhas}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  janela.document.close();
}

export function NumerosOficiaisTab() {
  const queryClient = useQueryClient();
  const [testeDe, setTesteDe] = useState<Numero | null>(null);
  const [conectando, setConectando] = useState(false);
  // "Sem responsável" é o que a GSS mais precisa resolver aqui: o resumo do topo filtra a lista para só esses.
  const [soSemDono, setSoSemDono] = useState(false);

  const { data: numeros = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["whatsapp-numeros-oficiais"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("whatsapp_numeros_oficiais_painel");
      if (error) throw error;
      return (data || []) as Numero[];
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ["whatsapp-numeros-responsaveis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .eq("status", "ativo")
        .order("nome_completo");
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome_completo: string | null }>;
    },
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("chakra-connect", { body: { action: "refresh_status" } });
      if (error) throw error;
      return data as { ok: boolean; failed?: unknown[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-numeros-oficiais"] });
      if (data?.failed?.length) toast.warning(`Sincronizado, mas ${data.failed.length} número(s) não responderam na Chakra.`);
      else toast.success("Situação dos números atualizada com a Meta.");
    },
    onError: () => toast.error("Não consegui falar com a Chakra agora. Tente de novo em instantes."),
  });

  const atualizar = useMutation({
    mutationFn: async (vars: { numero: Numero; responsavel_id?: string | null; uso?: Uso }) => {
      const { error } = await (supabase as any).rpc("whatsapp_numero_atualizar", {
        p_connection_id: vars.numero.connection_id,
        p_responsavel_id: vars.responsavel_id !== undefined ? vars.responsavel_id : vars.numero.responsavel_id,
        p_uso: vars.uso ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-numeros-oficiais"] });
      queryClient.invalidateQueries({ queryKey: ["atendimento-numeros-tipo"] });
      const fone = formatarTelefone(vars.numero.phone_e164);
      if (vars.uso) toast.success(`${fone} agora é ${USO_ROTULO[vars.uso]}.`);
      else {
        const nome = pessoas.find((p) => p.id === vars.responsavel_id)?.nome_completo;
        toast.success(nome ? `${fone} agora está com ${nome}.` : `${fone} ficou sem responsável.`);
      }
    },
    onError: () => toast.error("Não foi possível salvar. Confira sua permissão de configurar WhatsApp."),
  });

  const ordenados = useMemo(
    () => [...numeros].sort((a, b) =>
      (DISP[a.disponibilidade || "indisponivel"].ordem - DISP[b.disponibilidade || "indisponivel"].ordem)
      || a.phone_e164.localeCompare(b.phone_e164)),
    [numeros],
  );
  const semDono = numeros.filter((n) => !n.responsavel_id).length;
  // Com o filtro ligado e todos já com dono, a lista não pode sumir: o filtro desliga sozinho.
  const filtrando = soSemDono && semDono > 0;
  const visiveis = filtrando ? ordenados.filter((n) => !n.responsavel_id) : ordenados;
  const grupos = USOS
    .map((u) => ({ ...u, numeros: visiveis.filter((n) => n.uso === u.id), total: numeros.filter((n) => n.uso === u.id) }))
    .filter((g) => (filtrando ? g.numeros.length > 0 : g.sempre || g.numeros.length > 0));
  const prospeccao = numeros.filter((n) => n.uso === "prospeccao");
  // Conta pela saúde da Meta, não pelo motivo exibido: um número RED também pode estar com pagamento recusado.
  const bloqueadosMeta = prospeccao.filter((n) => n.meta_pode_enviar === "BLOCKED").length;
  const atualizadoEm = numeros.map((n) => n.disponibilidade_em).filter(Boolean).sort().at(-1) || null;

  const irPara = (uso: Uso) => document.getElementById(`numeros-${uso}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Carregando os números…" : atualizadoEm ? `Situação conferida com a Meta ${haQuanto(atualizadoEm)}` : "Situação ainda não conferida com a Meta"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
            {sincronizar.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            {sincronizar.isPending ? "Conferindo…" : "Conferir com a Meta"}
          </Button>
          <Button variant="outline" onClick={() => baixarPdf(ordenados)} disabled={!numeros.length}>
            <Download className="mr-2 h-4 w-4" /> Baixar lista
          </Button>
          <Button onClick={() => setConectando(true)}>
            <Plus className="mr-2 h-4 w-4" /> Conectar número
          </Button>
        </div>
      </div>

      {/* Resumo: quantos números há de cada tipo e quantos estão sem dono. O tipo leva ao grupo; o sem dono filtra. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {USOS.filter((u) => u.sempre).map((u) => {
          const doTipo = numeros.filter((n) => n.uso === u.id);
          const prontos = doTipo.filter((n) => n.disponibilidade === "disponivel").length;
          return (
            <button key={u.id} type="button" onClick={() => irPara(u.id)} disabled={isLoading || !!error}
              className="group flex min-w-0 flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
                <span className="truncate">{u.rotuloResumo}</span>
                <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
              </span>
              {isLoading ? <Skeleton className="mt-2 h-9 w-12" /> : (
                <span className="mt-1 font-display text-3xl font-semibold tabular-nums">{doTipo.length}</span>
              )}
              <span className="mt-1 text-xs text-muted-foreground">
                {isLoading ? " " : doTipo.length === 0 ? "Nenhum número ainda"
                  : `${prontos} ${prontos === 1 ? "pronto" : "prontos"}${u.id === "prospeccao" ? " para campanha" : " para uso"}`}
              </span>
            </button>
          );
        })}
        <div className={cn("flex min-w-0 flex-col rounded-xl border p-4",
          isLoading ? "bg-card" : semDono ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40" : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40")}>
          <span className="text-sm font-medium text-muted-foreground">Sem responsável</span>
          {isLoading ? <Skeleton className="mt-2 h-9 w-12" /> : (
            <span className="mt-1 font-display text-3xl font-semibold tabular-nums">{semDono}</span>
          )}
          {!isLoading && (semDono > 0 ? (
            <button type="button" onClick={() => setSoSemDono((v) => !v)}
              className="mt-1 self-start text-xs font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-200">
              {filtrando ? "Mostrar todos os números" : "Mostrar só esses"}
            </button>
          ) : <span className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">Todo número tem dono</span>)}
        </div>
      </div>

      {bloqueadosMeta > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>{bloqueadosMeta} de {prospeccao.length} números de prospecção bloqueados pela Meta</strong> (pagamento recusado).
            {" "}Vincule o cartão da GSS a cada conta no Meta Business; depois, “Enviar teste” confirma.
          </p>
        </div>
      )}

      {error ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-destructive">Não foi possível carregar os números. Confira a conexão e tente de novo.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tentar de novo
          </Button>
        </Card>
      ) : isLoading ? (
        <Card className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</Card>
      ) : (
        grupos.map((g) => (
          <TabelaNumeros
            key={g.id}
            id={`numeros-${g.id}`}
            titulo={g.rotulo}
            numeros={g.numeros}
            total={g.total.length}
            pessoas={pessoas}
            salvando={atualizar.isPending ? atualizar.variables?.numero.connection_id : undefined}
            onTeste={setTesteDe}
            onConectar={() => setConectando(true)}
            onAtualizar={(numero, mudanca) => atualizar.mutate({ numero, ...mudanca })}
          />
        ))
      )}

      <Sheet open={conectando} onOpenChange={setConectando}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="mb-5">
            <SheetTitle>Conectar número novo</SheetTitle>
            <SheetDescription>
              Pelo Chakra, na API oficial da Meta. O número entra na lista como Prospecção; depois ajuste o tipo e o responsável.
            </SheetDescription>
          </SheetHeader>
          {conectando && (
            <ChakraConnectCard modo="conectar" onConectado={() => {
              queryClient.invalidateQueries({ queryKey: ["whatsapp-numeros-oficiais"] });
              queryClient.invalidateQueries({ queryKey: ["atendimento-numeros-tipo"] });
              setConectando(false);
            }} />
          )}
        </SheetContent>
      </Sheet>

      <EnviarTesteDialog numero={testeDe} onClose={() => setTesteDe(null)} />
    </div>
  );
}

/** Falha dos últimos 7 dias em %; a cor só aparece quando pesa (a partir de 20%). */
function Entregas({ n }: { n: Numero }) {
  if (!n.enviadas_7d) return <span className="text-muted-foreground">Nada enviado</span>;
  const pct = Math.round((100 * n.falhas_7d) / n.enviadas_7d);
  // Cada parte fica inteira: se faltar largura, quebra entre "enviadas" e "falhou", nunca no meio.
  return (
    <span className="tabular-nums">
      <span className="whitespace-nowrap">{n.enviadas_7d.toLocaleString("pt-BR")} enviadas</span>
      {pct > 0 && (
        <>
          {" "}
          <span className={cn("whitespace-nowrap", pct >= 50 ? "text-red-700 dark:text-red-400" : pct >= 20 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            · {pct}% falhou
          </span>
        </>
      )}
    </span>
  );
}

function TabelaNumeros({
  id, titulo, numeros, total, pessoas, salvando, onTeste, onConectar, onAtualizar,
}: {
  id: string;
  titulo: string;
  numeros: Numero[];
  total: number;
  pessoas: Array<{ id: string; nome_completo: string | null }>;
  salvando?: string;
  onTeste: (n: Numero) => void;
  onConectar: () => void;
  onAtualizar: (n: Numero, mudanca: { responsavel_id?: string | null; uso?: Uso }) => void;
}) {
  const prontos = numeros.filter((n) => n.disponibilidade === "disponivel").length;
  const semDono = numeros.filter((n) => !n.responsavel_id).length;
  if (total === 0) {
    // Tipo sem número: uma linha só, com o caminho para resolver (mudar o tipo de um número ou conectar outro).
    return (
      <section id={id} className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{titulo}</h2>
          <p className="text-sm text-muted-foreground">Nenhum número deste tipo. Mude o tipo de um número acima ou conecte um novo.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onConectar}><Plus className="mr-1.5 h-4 w-4" /> Conectar número</Button>
      </section>
    );
  }
  return (
    <Card id={id} className="scroll-mt-4 overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-5 py-3.5">
        <h2 className="font-display text-base font-semibold">
          {titulo} <span className="ml-1 font-sans text-sm font-normal tabular-nums text-muted-foreground">{numeros.length}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {prontos} {prontos === 1 ? "pronto" : "prontos"}
          {semDono > 0 && <span className="text-amber-800 dark:text-amber-300"> · {semDono} sem responsável</span>}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-[24%] px-5 py-2 font-medium xl:w-[19%]">Número</th>
              <th className="w-[24%] px-3 py-2 font-medium xl:w-[22%]">Situação</th>
              <th className="hidden w-[20%] px-3 py-2 font-medium xl:table-cell">Últimos 7 dias</th>
              <th className="w-[20%] px-3 py-2 font-medium xl:w-[13%]">Tipo</th>
              <th className="w-[22%] px-3 py-2 font-medium xl:w-[15%]">Responsável</th>
              <th className="w-[4.5rem] px-5 py-2 xl:w-[10.5rem]"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {numeros.map((n) => {
              const disp = DISP[n.disponibilidade || "indisponivel"];
              // "Pronto" já diz tudo; o motivo só aparece quando há algo a resolver.
              const motivo = [
                n.disponibilidade !== "disponivel" ? (n.disponibilidade_motivo || "Ainda não conferido.") : null,
                n.uso === "prospeccao" && !n.tem_template_padrao ? "Sem o modelo padrão de prospecção." : null,
              ].filter(Boolean).join(" ");
              return (
                <tr key={n.connection_id} className="align-middle transition-colors hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="font-medium tabular-nums">{formatarTelefone(n.phone_e164)}</div>
                    <div className="truncate text-xs text-muted-foreground" title={`${n.display_name || "Sem nome"} · conta ${n.conta}`}>
                      {n.display_name || "Sem nome"}{n.conta !== "GSS" && ` · conta ${n.conta}`}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", disp.classe)}>
                      {disp.rotulo}
                    </span>
                    {motivo && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={motivo}>{motivo}</div>}
                    {/* abaixo de 1280 px a coluna "Últimos 7 dias" some e o volume vem aqui */}
                    <div className="mt-1 text-xs xl:hidden"><Entregas n={n} /></div>
                  </td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <div><Entregas n={n} /></div>
                    <div className="text-xs text-muted-foreground">entregou {haQuanto(n.ultima_entrega)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Select value={n.uso} disabled={salvando === n.connection_id}
                      onValueChange={(v) => onAtualizar(n, { uso: v as Uso })}>
                      <SelectTrigger className="h-8 w-full" aria-label={`Tipo do número ${formatarTelefone(n.phone_e164)}`}>
                        {/* No gatilho vai o nome curto (o grupo já diz o tipo por extenso); a lista mostra o completo. */}
                        <SelectValue>{USOS.find((u) => u.id === n.uso)?.curto ?? n.uso}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {USOS.map((u) => <SelectItem key={u.id} value={u.id}>{u.rotulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-3">
                    <Select
                      value={n.responsavel_id || "nenhum"}
                      disabled={salvando === n.connection_id}
                      onValueChange={(v) => onAtualizar(n, { responsavel_id: v === "nenhum" ? null : v })}
                    >
                      <SelectTrigger
                        className={cn("h-8 w-full", !n.responsavel_id && "border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200")}
                        aria-label={`Responsável pelo número ${formatarTelefone(n.phone_e164)}`}>
                        {/* Sem dono, o gatilho pede a ação em vez de mostrar "Ninguém" */}
                        <SelectValue>{n.responsavel_id ? (n.responsavel_nome || pessoas.find((p) => p.id === n.responsavel_id)?.nome_completo || "Sem nome") : "Definir"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Ninguém</SelectItem>
                        {pessoas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome_completo || "Sem nome"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => onTeste(n)} disabled={n.templates_aprovados === 0}
                        aria-label="Enviar teste"
                        title={n.templates_aprovados === 0 ? "Este número não tem nenhum modelo aprovado" : "Enviar teste"}>
                        <Send className="h-3.5 w-3.5 xl:mr-1.5" /> <span className="hidden xl:inline">Enviar teste</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type ResultadoTeste =
  | { fase: "enviando" }
  | { fase: "aguardando"; messageId: string; template: string }
  | { fase: "entregue"; template: string; status: string }
  | { fase: "falhou"; template?: string; erro: string };

function EnviarTesteDialog({ numero, onClose }: { numero: Numero | null; onClose: () => void }) {
  const [destino, setDestino] = useState("");
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);

  useEffect(() => {
    if (numero) setResultado(null);
  }, [numero]);

  // O "aceito" da Chakra não garante entrega: acompanha o webhook de status por até 90 s.
  useEffect(() => {
    if (resultado?.fase !== "aguardando") return;
    const inicio = Date.now();
    const timer = window.setInterval(async () => {
      const { data } = await (supabase as any).rpc("whatsapp_envio_teste_status", { p_message_id: resultado.messageId });
      const status = String(data?.status || "aguardando");
      if (status === "delivered" || status === "read") {
        setResultado({ fase: "entregue", template: resultado.template, status });
      } else if (status === "failed") {
        setResultado({ fase: "falhou", template: resultado.template, erro: data?.erro || "A Meta recusou a mensagem." });
      } else if (Date.now() - inicio > 90_000) {
        setResultado({ fase: "falhou", template: resultado.template, erro: "Sem confirmação de entrega em 90 s. Veja no celular se chegou." });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [resultado]);

  const enviar = async () => {
    if (!numero) return;
    const digitos = destino.replace(/\D/g, "");
    const to = digitos.length <= 11 ? `55${digitos}` : digitos;
    if (to.length < 12) {
      toast.error("Digite o celular com DDD.");
      return;
    }
    setResultado({ fase: "enviando" });
    const { data, error } = await supabase.functions.invoke("chakra-connect", {
      body: { action: "send_test", connectionId: numero.connection_id, to },
    });
    if (error || !data?.ok) {
      setResultado({ fase: "falhou", template: data?.template, erro: data?.error || error?.message || "Falha ao enviar." });
      return;
    }
    setResultado({ fase: "aguardando", messageId: data.messageId, template: data.template });
  };

  return (
    <Dialog open={!!numero} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar teste pelo {numero ? formatarTelefone(numero.phone_e164) : ""}</DialogTitle>
          <DialogDescription>Manda um modelo aprovado, igual ao primeiro contato de uma campanha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="destino-teste">Celular que vai receber</Label>
          <Input id="destino-teste" inputMode="tel" placeholder="(47) 99999-9999" value={destino}
            onChange={(e) => setDestino(e.target.value)} disabled={resultado?.fase === "enviando" || resultado?.fase === "aguardando"} />
        </div>
        {resultado && (
          <div className={cn("rounded-md border p-3 text-sm",
            resultado.fase === "entregue" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
            resultado.fase === "falhou" && "border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200")}>
            {resultado.fase === "enviando" && "Enviando…"}
            {resultado.fase === "aguardando" && (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Aceito pela Meta. Esperando a confirmação de entrega…</span>
            )}
            {resultado.fase === "entregue" && <>Entregue. Este número consegue fazer o primeiro contato de campanha (modelo {resultado.template}).</>}
            {resultado.fase === "falhou" && <>Não entregou: {resultado.erro}</>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={enviar} disabled={!destino.trim() || resultado?.fase === "enviando" || resultado?.fase === "aguardando"}>
            <Send className="mr-2 h-4 w-4" /> Enviar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
