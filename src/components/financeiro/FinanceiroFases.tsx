import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  FileSpreadsheet, CheckCircle2, ArrowRight, Wallet, ClipboardCheck, Receipt,
  Circle, Loader2, Trash2, Download, Search, ArrowUp, ArrowDown, X,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FinanceiroPagamento, useConferirEmLote, useExcluirImportacao } from "@/hooks/useFinanceiroData";
import { FinanceiroDetalhe } from "./FinanceiroDetalhe";
import { FinanceiroImportarFechamentoDialog } from "./FinanceiroImportarFechamentoDialog";
import { FinanceiroFecharDialog } from "./FinanceiroFecharDialog";
import { FinanceiroLiberarDialog } from "./FinanceiroLiberarDialog";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const BOM = String.fromCharCode(0xFEFF);      // Excel pt-BR precisa do BOM para ler UTF-8
const CRLF = String.fromCharCode(13, 10);
const horas = (min: number) => (min ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : "—");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * E3/E6 — a jornada do fechamento numa tela só: importar → conferir → ajustar →
 * liberar. Mesa de trabalho da Mavi, que roda 50+ fechamentos por mês: a tabela é o
 * conteúdo (cabeçalho e total fixos, busca por médico), e o resto encolhe para caber
 * o máximo de linhas na primeira tela — ela procurava médico rolando o mês inteiro.
 */
const TODAS = "todas";

type Ordem = { campo: "nome" | "plantoes" | "produzido" | "a_vista" | "ajustes" | "total"; desc: boolean };

export function FinanceiroFases({ mes, ano }: { mes: number; ano: number }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [fonteSel, setFonteSel] = useState<string>(TODAS);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>({ campo: "nome", desc: false });
  const conferirLote = useConferirEmLote();
  const excluirImport = useExcluirImportacao();
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-fases", mes, ano],
    queryFn: async () => {
      const [pagRes, fechRes, recRes, cfgRes] = await Promise.all([
        (supabase as any).from("financeiro_pagamentos").select("*")
          .eq("mes_referencia", mes).eq("ano_referencia", ano)
          .order("profissional_nome"),
        (supabase as any).from("financeiro_fechamentos")
          .select("id, status, total, qtd_medicos, criado_em, aprovado_em")
          .eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
        (supabase as any).from("financeiro_receber")
          .select("descricao, valor_previsto, fonte")
          .eq("mes_referencia", mes).eq("ano_referencia", ano),
        (supabase as any).from("financeiro_import_config").select("id, nome, direcao"),
      ]);
      return {
        pagamentos: (pagRes.data || []) as FinanceiroPagamento[],
        fechamento: fechRes.data as any,
        receber: (recRes.data || []) as any[],
        configs: (cfgRes.data || []) as any[],
      };
    },
  });

  const configs = data?.configs ?? [];
  // Um "fechamento" para a equipe é o ARQUIVO: ela baixa um relatório por setor do
  // Dr. Escala e renomeia ("SJB Clínicos", "CEPON AIO"). Agrupar só por fonte juntava
  // todos os setores numa linha só.
  const chaveDoPagamento = (p: FinanceiroPagamento) => String((p as any).arquivo_origem || "sem-origem");
  const nomeFechamento = (chave: string) => {
    const m = chave.match(/^\[cfg:([0-9a-f-]+)\]\s*(.*)$/i);
    if (!m) return chave === "sem-origem" ? "Lançamentos manuais" : chave;
    const fonte = configs.find((c) => c.id === m[1])?.nome ?? "Fonte removida";
    const arquivo = (m[2] || "").replace(/\.(xlsx|xls|csv)$/i, "").trim();
    return arquivo ? `${arquivo} · ${fonte}` : fonte;
  };

  const todos = data?.pagamentos ?? [];
  const fontesPresentes = [...new Set(todos.map(chaveDoPagamento))].sort();
  const daFonte = fonteSel === TODAS ? todos : todos.filter((p) => chaveDoPagamento(p) === fonteSel);

  const status = data?.fechamento?.status ?? null;
  // 22/09: quatro fases. A conferência da Mavi libera para as NOTAS; a diretoria só
  // aprova o pagamento depois que as notas voltarem.
  const fase = status === "pago" ? 4
    : status === "aprovado" ? 4
    : status === "aguardando_aprovacao" ? 3
    : status === "em_nf" ? 2
    : 1;
  const podeAjustar = fase === 1;

  // busca por médico: é como ela acha alguém num fechamento de 60 linhas
  const pagamentos = useMemo(() => {
    const termo = semAcento(busca.trim());
    const lista = termo
      ? daFonte.filter((p) =>
          semAcento(p.profissional_nome || "").includes(termo) ||
          semAcento(String(p.profissional_crm || "")).includes(termo))
      : daFonte;
    const val = (p: FinanceiroPagamento): number | string => {
      switch (ordem.campo) {
        case "plantoes": return Number(p.total_plantoes || 0);
        case "produzido": return Number(p.valor_produzido || 0);
        case "a_vista": return Number(p.valor_a_vista || 0);
        case "ajustes": return Number(p.valor_ajustes || 0);
        case "total": return Number(p.valor_total || 0);
        default: return semAcento(p.profissional_nome || "");
      }
    };
    return [...lista].sort((a, b) => {
      const va = val(a), vb = val(b);
      const r = typeof va === "string" ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb);
      return ordem.desc ? -r : r;
    });
  }, [daFonte, busca, ordem]);

  const somaDe = (lista: FinanceiroPagamento[], campo: string) =>
    lista.reduce((s, p) => s + Number((p as any)[campo] || 0), 0);
  // os totais são da FONTE selecionada, não do filtro de busca — a busca é lupa, não recorte
  const produzido = somaDe(daFonte, "valor_produzido");
  const aVista = somaDe(daFonte, "valor_a_vista");
  const ajustes = somaDe(daFonte, "valor_ajustes");
  const aPagar = somaDe(daFonte, "valor_total");
  const aPagarMes = somaDe(todos, "valor_total");
  const aReceber = (data?.receber ?? []).reduce((s, r) => s + Number(r.valor_previsto || 0), 0);
  const porConferir = todos.filter((p) => !p.conferido_em).length;

  const rotuloFonte = (p: FinanceiroPagamento) => nomeFechamento(chaveDoPagamento(p));

  // CSV com ; e BOM — é o que o Excel em pt-BR abre sem pedir nada
  const baixarCsv = () => {
    const cab = ["Médico", "CRM", "Origem", "Plantões", "Horas trabalhadas", "Horas à vista",
                 "Horas a pagar", "Produzido", "Já pago à vista", "Ajustes", "A pagar", "Conferido"];
    const dec = (n: number) => Number(n || 0).toFixed(2).replace(".", ",");
    const linhas = pagamentos.map((p) => {
      const tot = Number(p.total_horas_minutos || 0), av = Number(p.horas_a_vista_minutos || 0);
      return [
        p.profissional_nome, p.profissional_crm ?? "", rotuloFonte(p),
        p.total_plantoes ?? 0, horas(tot), horas(av), horas(Math.max(0, tot - av)),
        dec(Number(p.valor_produzido || 0)), dec(Number(p.valor_a_vista || 0)),
        dec(Number(p.valor_ajustes || 0)), dec(Number(p.valor_total || 0)),
        p.conferido_em ? "sim" : "não",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
    });
    const nome = fonteSel === TODAS ? `competencia-${String(mes).padStart(2, "0")}-${ano}`
                                    : nomeFechamento(fonteSel).replace(/[^\w\- ]/g, "").trim();
    const blob = new Blob([BOM + [cab.join(";"), ...linhas].join(CRLF)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nome}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (selecionado) {
    const pag = pagamentos.find((p) => p.id === selecionado);
    if (pag) return <FinanceiroDetalhe pagamento={pag} onVoltar={() => setSelecionado(null)} />;
  }

  const FASES = [
    { n: 1, titulo: "Fechamento", quem: "Mavi", icone: FileSpreadsheet },
    { n: 2, titulo: "Notas fiscais", quem: "assistente", icone: Receipt },
    { n: 3, titulo: "Aprovação", quem: "diretoria", icone: ClipboardCheck },
    { n: 4, titulo: "Pagamento", quem: "Thais", icone: Wallet },
  ];

  const ordenarPor = (campo: Ordem["campo"]) =>
    setOrdem((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo !== "nome" }));

  const Cabecalho = ({ campo, children, className = "" }: { campo: Ordem["campo"]; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button onClick={() => ordenarPor(campo)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {children}
        {ordem.campo === campo && (ordem.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      {/* trilha das fases: uma linha só — o espaço vertical é da tabela */}
      <div className="flex items-stretch gap-px overflow-x-auto rounded-md border bg-muted/40">
        {FASES.map((f) => {
          const ativa = fase === f.n;
          const concluida = fase > f.n;
          const Icone = f.icone;
          return (
            <div key={f.n}
              className={`flex-1 min-w-[8.5rem] flex items-center gap-2 px-3 py-2 ${ativa ? "bg-background shadow-sm" : ""}`}>
              <div className={`shrink-0 ${concluida ? "text-emerald-600" : ativa ? "text-primary" : "text-muted-foreground/50"}`}>
                {concluida ? <CheckCircle2 className="h-4 w-4" /> : <Icone className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className={`text-sm leading-tight truncate ${ativa ? "font-semibold" : concluida ? "" : "text-muted-foreground"}`}>
                  {f.titulo}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight truncate">{f.quem}</p>
              </div>
              {ativa && <Badge className="ml-auto text-[10px] shrink-0">agora</Badge>}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">
                Competência {String(mes).padStart(2, "0")}/{ano}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todos.length} lançamento(s)
                {status ? ` · ${status.replace(/_/g, " ")}` : " · ainda não liberado"}
                {porConferir > 0 && podeAjustar ? ` · ${porConferir} por conferir` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {todos.length > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={baixarCsv}>
                  <Download className="h-4 w-4" /> Baixar
                </Button>
              )}
              {podeAjustar && fonteSel !== TODAS && (
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700"
                  onClick={() => setConfirmandoExclusao(true)}>
                  <Trash2 className="h-4 w-4" /> Excluir importação
                </Button>
              )}
              {podeAjustar && <FinanceiroImportarFechamentoDialog mesDefault={mes} anoDefault={ano} />}
              {fase >= 3 && (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to="/financeiro/aprovacoes">Ver aprovações <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              )}
            </div>
          </div>

          {todos.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              {/* achar o fechamento pelo nome do arquivo ("Braço do Norte") sem rolar a lista */}
              <SearchableSelect
                className="w-full sm:max-w-sm"
                value={fonteSel}
                onChange={(v) => setFonteSel(v || TODAS)}
                clearable={false}
                searchPlaceholder="Buscar fechamento…"
                options={[
                  { value: TODAS, label: `Todos os fechamentos (${todos.length})` },
                  ...fontesPresentes.map((k) => ({
                    value: k,
                    label: `${nomeFechamento(k)} (${todos.filter((p) => chaveDoPagamento(p) === k).length})`,
                  })),
                ]}
              />
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar médico ou CRM…" className="pl-8 pr-8 h-10" />
                {busca && (
                  <button onClick={() => setBusca("")} aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {todos.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <div>
                <p className="font-medium">Nenhum lançamento nesta competência</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Comece trazendo o relatório da fonte — Dr. Escala, Marieta, CEPON, Carestream.
                </p>
              </div>
              <div className="flex justify-center">
                <FinanceiroImportarFechamentoDialog mesDefault={mes} anoDefault={ano} />
              </div>
            </div>
          ) : (
            <>
              {/* números do fechamento em uma faixa, não em cards — cabem mais linhas abaixo */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-3 py-2">
                {[
                  { r: "Produzido", v: produzido, cls: "" },
                  { r: "Já pago à vista", v: aVista, cls: "text-amber-700" },
                  { r: "Ajustes", v: ajustes, cls: ajustes < 0 ? "text-red-600" : ajustes > 0 ? "text-emerald-700" : "" },
                  { r: "A pagar", v: aPagar, cls: "font-semibold" },
                  ...(aReceber > 0 ? [
                    { r: "A receber (contratos)", v: aReceber, cls: "text-blue-700" },
                    { r: "Margem", v: aReceber - aPagarMes, cls: aReceber - aPagarMes < 0 ? "text-red-600" : "text-emerald-700" },
                  ] : []),
                ].map((k) => (
                  <div key={k.r} className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">{k.r}</p>
                    <p className={`text-base tabular-nums leading-tight ${k.cls}`}>{brl(k.v)}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {busca
                    ? `${pagamentos.length} de ${daFonte.length} lançamento(s)`
                    : "Clique na linha para ver os plantões e lançar ajuste"}
                </span>
                {podeAjustar && porConferir === 0 && todos.length > 0 && (
                  <button className="hover:text-foreground underline underline-offset-2"
                    disabled={conferirLote.isPending}
                    onClick={() => conferirLote.mutate({ ids: todos.map((p) => p.id), desfazer: true })}>
                    Reabrir conferência
                  </button>
                )}
              </div>

              {/* tabela é o conteúdo: cabeçalho e total ficam presos, o meio rola */}
              <div className="relative overflow-auto rounded-md border max-h-[min(65vh,42rem)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="[&>th]:h-8 [&>th]:py-1 hover:bg-transparent">
                      <TableHead className="w-8" />
                      <Cabecalho campo="nome">Médico</Cabecalho>
                      <Cabecalho campo="plantoes" className="text-center w-16">Plant.</Cabecalho>
                      <TableHead className="text-center w-20" title="Horas a pagar (já descontadas as pagas à vista)">Horas</TableHead>
                      <Cabecalho campo="produzido" className="text-right">Produzido</Cabecalho>
                      <Cabecalho campo="a_vista" className="text-right">À vista</Cabecalho>
                      <Cabecalho campo="ajustes" className="text-right">Ajustes</Cabecalho>
                      <Cabecalho campo="total" className="text-right">A pagar</Cabecalho>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagamentos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                          Nenhum médico encontrado para “{busca}”.
                        </TableCell>
                      </TableRow>
                    )}
                    {pagamentos.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer [&>td]:py-1 odd:bg-muted/20"
                        onClick={() => setSelecionado(p.id)}>
                        <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                          {p.conferido_em ? (
                            <button title="Conferido — clique para reabrir" disabled={!podeAjustar}
                              onClick={() => conferirLote.mutate({ ids: [p.id], desfazer: true })}>
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </button>
                          ) : (
                            <button title="Marcar como conferido" disabled={!podeAjustar}
                              onClick={() => conferirLote.mutate({ ids: [p.id] })}>
                              <Circle className="h-4 w-4 text-muted-foreground/40" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium leading-tight">
                          <span className="flex items-center gap-1.5">
                            {p.profissional_nome}
                            {!p.medico_id && (
                              <span title="Médico não encontrado no cadastro"
                                className="text-[10px] text-amber-700 border border-amber-400 rounded px-1">sem cadastro</span>
                            )}
                          </span>
                          {fonteSel === TODAS && (
                            <span className="block text-[10px] text-muted-foreground truncate max-w-[16rem]">
                              {rotuloFonte(p)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground tabular-nums">{p.total_plantoes || "—"}</TableCell>
                        <TableCell className="text-center text-muted-foreground tabular-nums" title={Number(p.horas_a_vista_minutos || 0) > 0 ? `${horas(p.total_horas_minutos)} trabalhadas − ${horas(Number(p.horas_a_vista_minutos))} pagas à vista` : undefined}>
                          {horas(Math.max(0, (p.total_horas_minutos || 0) - Number(p.horas_a_vista_minutos || 0)))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(Number(p.valor_produzido || 0))}</TableCell>
                        <TableCell className="text-right text-amber-700 tabular-nums">{Number(p.valor_a_vista || 0) > 0 ? brl(Number(p.valor_a_vista)) : "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums ${Number(p.valor_ajustes || 0) < 0 ? "text-red-600" : Number(p.valor_ajustes || 0) > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {Number(p.valor_ajustes || 0) !== 0 ? `${Number(p.valor_ajustes) > 0 ? "+" : ""}${brl(Number(p.valor_ajustes))}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{brl(Number(p.valor_total))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot className="sticky bottom-0 z-20">
                    <TableRow className="bg-card font-semibold [&>td]:py-1.5 shadow-[0_-1px_0_0_hsl(var(--border))] hover:bg-card">
                      <TableCell colSpan={2}>Total · {daFonte.length} médicos</TableCell>
                      <TableCell className="text-center tabular-nums">{daFonte.reduce((a, p) => a + (p.total_plantoes || 0), 0)}</TableCell>
                      <TableCell className="text-center tabular-nums">{horas(daFonte.reduce((a, p) => a + Math.max(0, (p.total_horas_minutos || 0) - Number(p.horas_a_vista_minutos || 0)), 0))}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(produzido)}</TableCell>
                      <TableCell className="text-right text-amber-700 tabular-nums">{brl(aVista)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(ajustes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(aPagar)}</TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>

              {/* saída da fase, no fim da mesa de trabalho */}
              {fase <= 2 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    {fase === 1
                      ? "Conferido o mês, libere para a solicitação das notas fiscais."
                      : "Notas em andamento. Quando voltarem, envie para a diretoria aprovar o pagamento."}
                    {fonteSel !== TODAS && fase === 1 && (
                      <span className="block text-xs text-amber-700 mt-0.5">
                        A liberação é da competência inteira ({todos.length} lançamentos), não só do fechamento filtrado.
                      </span>
                    )}
                  </p>
                  {fase === 1
                    ? <FinanceiroLiberarDialog mes={mes} ano={ano} total={aPagarMes} qtdMedicos={todos.length} porConferir={porConferir} />
                    : <FinanceiroFecharDialog mes={mes} ano={ano} />}
                </div>
              )}
            </>
          )}
          {isLoading && (
            <p className="text-muted-foreground text-sm text-center py-3 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta importação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Serão removidos <b>{daFonte.length} lançamento(s)</b> de{" "}
                  <b>{fonteSel !== TODAS ? nomeFechamento(fonteSel) : ""}</b> na competência{" "}
                  {String(mes).padStart(2, "0")}/{ano}, somando <b>{brl(aPagar)}</b>.
                </p>
                <p className="text-amber-700">
                  Os ajustes lançados nesses médicos vão junto. As outras importações do mês não são afetadas.
                </p>
                <p className="text-xs">Depois disso o arquivo pode ser importado de novo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                excluirImport.mutate({ mes, ano, arquivoOrigem: fonteSel });
                setFonteSel(TODAS);
                setConfirmandoExclusao(false);
              }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
