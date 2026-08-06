import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, CheckCircle2, ArrowRight, Wallet, ClipboardCheck, SlidersHorizontal, Info, Circle, Loader2 } from "lucide-react";
import { FinanceiroPagamento, useConferirEmLote } from "@/hooks/useFinanceiroData";
import { FinanceiroDetalhe } from "./FinanceiroDetalhe";
import { FinanceiroImportarFechamentoDialog } from "./FinanceiroImportarFechamentoDialog";
import { FinanceiroFecharDialog } from "./FinanceiroFecharDialog";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * E3/E6 — a jornada do fechamento numa tela só: importar → conferir → ajustar →
 * enviar para aprovação. A transição de fase continua sendo do FinanceiroFecharDialog
 * (que gera o PDF e manda pro canal da diretoria); aqui é a mesa de trabalho da Mavi.
 */
const TODAS = "todas";

export function FinanceiroFases({ mes, ano }: { mes: number; ano: number }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [fonteSel, setFonteSel] = useState<string>(TODAS);
  const conferirLote = useConferirEmLote();

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
  const cfgDoPagamento = (p: FinanceiroPagamento) => {
    const arq = String((p as any).arquivo_origem || "");
    const m = arq.match(/^\[cfg:([0-9a-f-]+)\]/i);
    return m ? m[1] : "outros";
  };
  const nomeFonte = (id: string) =>
    configs.find((c) => c.id === id)?.nome ?? (id === "outros" ? "Outros lançamentos" : "Fonte removida");

  const todos = data?.pagamentos ?? [];
  // um "fechamento" na fala da Ramone = a fonte que originou os lançamentos do mês
  const fontesPresentes = [...new Set(todos.map(cfgDoPagamento))];
  const pagamentos = fonteSel === TODAS ? todos : todos.filter((p) => cfgDoPagamento(p) === fonteSel);
  const status = data?.fechamento?.status ?? null;
  const fase = status === "pago" || status === "aprovado" ? 3 : status === "aguardando_aprovacao" ? 2 : 1;
  const podeAjustar = fase === 1;

  const soma = (campo: keyof FinanceiroPagamento) =>
    pagamentos.reduce((s, p) => s + Number((p as any)[campo] || 0), 0);
  const produzido = soma("valor_produzido");
  const aVista = soma("valor_a_vista");
  const ajustes = soma("valor_ajustes");
  const aPagar = soma("valor_total");
  const aReceber = (data?.receber ?? []).reduce((s, r) => s + Number(r.valor_previsto || 0), 0);

  // conferência é ato interno da Mavi e acontece em lote; o canal só entra na aprovação
  const pendentes = pagamentos.filter((p) => !p.conferido_em);
  const conferidos = pagamentos.length - pendentes.length;
  const faltamNaCompetencia = todos.filter((p) => !p.conferido_em).length;

  // "de onde veio" cada lançamento — o prefixo [cfg:id] marca o import por fonte
  const rotuloFonte = (p: FinanceiroPagamento) => {
    const id = cfgDoPagamento(p);
    if (id !== "outros") return nomeFonte(id);
    const arq = String((p as any).arquivo_origem || "");
    return arq || (p.fonte === "import" ? "Importado (formato antigo)" : "Manual");
  };

  if (selecionado) {
    const pag = pagamentos.find((p) => p.id === selecionado);
    if (pag) return <FinanceiroDetalhe pagamento={pag} onVoltar={() => setSelecionado(null)} />;
  }

  const FASES = [
    { n: 1, titulo: "Fechamento", desc: "Importar, conferir e ajustar", icone: FileSpreadsheet, quem: "Mavi" },
    { n: 2, titulo: "Em aprovação", desc: "Diretoria aprova o pagamento", icone: ClipboardCheck, quem: "João" },
    { n: 3, titulo: "Pagamento", desc: "Pagar, comprovante e NF", icone: Wallet, quem: "Thais" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FASES.map((f) => {
          const ativa = fase === f.n;
          const concluida = fase > f.n;
          const Icone = f.icone;
          return (
            <Card key={f.n} className={ativa ? "border-primary shadow-sm" : concluida ? "opacity-70" : "opacity-60"}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`rounded-full p-2 shrink-0 ${ativa ? "bg-primary/10 text-primary" : concluida ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {concluida ? <CheckCircle2 className="h-5 w-5" /> : <Icone className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-2">
                      {f.titulo}
                      {ativa && <Badge className="text-[10px]">agora</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Responsável: {f.quem}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              Competência {String(mes).padStart(2, "0")}/{ano}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pagamentos.length} médico(s)
              {status ? ` · fechamento ${status.replace(/_/g, " ")}` : " · ainda não enviado para aprovação"}
            </p>
            {fontesPresentes.length > 0 && (
              <div className="mt-2 max-w-xs">
                <Select value={fonteSel} onValueChange={setFonteSel}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todos os fechamentos ({todos.length})</SelectItem>
                    {fontesPresentes.map((id) => (
                      <SelectItem key={id} value={id}>
                        {nomeFonte(id)} ({todos.filter((p) => cfgDoPagamento(p) === id).length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {podeAjustar && <FinanceiroImportarFechamentoDialog mesDefault={mes} anoDefault={ano} />}
            {fase === 2 && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/financeiro/aprovacoes">Ver aprovações <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pagamentos.length === 0 ? (
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { r: "Produzido", v: produzido, cls: "" },
                  { r: "Já pago à vista", v: aVista, cls: "text-amber-700" },
                  { r: "Ajustes", v: ajustes, cls: ajustes < 0 ? "text-red-600" : ajustes > 0 ? "text-emerald-700" : "" },
                  { r: "A pagar", v: aPagar, cls: "font-bold" },
                ].map((k) => (
                  <div key={k.r} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{k.r}</p>
                    <p className={`text-lg ${k.cls}`}>{brl(k.v)}</p>
                  </div>
                ))}
              </div>

              {/* os dois lados do mesmo fechamento: o que o cliente paga × o que se paga ao médico */}
              {aReceber > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">A receber (contratos)</p>
                    <p className="text-lg text-blue-700">{brl(aReceber)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">A pagar (médicos)</p>
                    <p className="text-lg">{brl(aPagar)}</p>
                  </div>
                  <div className="rounded-md border p-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground">Margem da competência</p>
                    <p className={`text-lg font-bold ${aReceber - aPagar < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {brl(aReceber - aPagar)}
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        {(((aReceber - aPagar) / aReceber) * 100).toFixed(1)}%
                      </span>
                    </p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <p className="text-sm font-medium">
                    Lançamentos do fechamento
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {conferidos} de {pagamentos.length} conferidos
                    </span>
                  </p>
                  {podeAjustar && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> clique no médico para lançar acréscimo ou desconto
                      </span>
                      {pendentes.length > 0 ? (
                        <Button size="sm" variant="outline" className="gap-1.5"
                          disabled={conferirLote.isPending}
                          onClick={() => conferirLote.mutate({ ids: pendentes.map((p) => p.id) })}>
                          {conferirLote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Conferir {pendentes.length} pendente(s)
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"
                          disabled={conferirLote.isPending}
                          onClick={() => conferirLote.mutate({ ids: pagamentos.map((p) => p.id), desfazer: true })}>
                          Reabrir conferência
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Médico</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Produzido</TableHead>
                        <TableHead className="text-right">À vista</TableHead>
                        <TableHead className="text-right">Ajustes</TableHead>
                        <TableHead className="text-right">A pagar</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagamentos.map((p) => {
                        const aj = Number(p.valor_ajustes || 0);
                        const av = Number(p.valor_a_vista || 0);
                        return (
                          <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelecionado(p.id)}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
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
                            <TableCell className="font-medium">
                              {p.profissional_nome}
                              {!p.medico_id && (
                                <Badge variant="outline" className="ml-2 text-[10px] border-amber-400 text-amber-700">
                                  sem cadastro
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[14rem] truncate">
                              {rotuloFonte(p)}
                            </TableCell>
                            <TableCell className="text-right">{brl(Number(p.valor_produzido || 0))}</TableCell>
                            <TableCell className="text-right text-amber-700">{av > 0 ? brl(av) : "—"}</TableCell>
                            <TableCell className={`text-right ${aj < 0 ? "text-red-600" : aj > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                              {aj !== 0 ? `${aj > 0 ? "+" : ""}${brl(aj)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{brl(Number(p.valor_total))}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="gap-1.5"
                                onClick={(e) => { e.stopPropagation(); setSelecionado(p.id); }}>
                                <SlidersHorizontal className="h-4 w-4" />
                                {podeAjustar ? "Ajustar" : "Ver"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-right">{brl(produzido)}</TableCell>
                        <TableCell className="text-right text-amber-700">{brl(aVista)}</TableCell>
                        <TableCell className="text-right">{brl(ajustes)}</TableCell>
                        <TableCell className="text-right">{brl(aPagar)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* a saída da fase 1 fica no fim da mesa de trabalho, não perdida no header */}
              {podeAjustar && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    {faltamNaCompetencia > 0
                      ? `Faltam ${faltamNaCompetencia} lançamento(s) por conferir na competência.`
                      : "Tudo conferido. Envie para a diretoria aprovar o pagamento — é aqui que vai para o canal."}
                    {fonteSel !== TODAS && (
                      <span className="block text-xs text-amber-700 mt-0.5">
                        A aprovação é da competência inteira ({todos.length} médicos), não só da fonte filtrada.
                      </span>
                    )}
                  </p>
                  <FinanceiroFecharDialog mes={mes} ano={ano} />
                </div>
              )}
            </>
          )}
          {isLoading && <p className="text-muted-foreground text-sm text-center py-3">Carregando…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
