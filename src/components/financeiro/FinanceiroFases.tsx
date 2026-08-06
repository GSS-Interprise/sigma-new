import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, CheckCircle2, ArrowRight, Wallet, ClipboardCheck, SlidersHorizontal, Info } from "lucide-react";
import { FinanceiroPagamento } from "@/hooks/useFinanceiroData";
import { FinanceiroDetalhe } from "./FinanceiroDetalhe";
import { FinanceiroImportarFechamentoDialog } from "./FinanceiroImportarFechamentoDialog";
import { FinanceiroFecharDialog } from "./FinanceiroFecharDialog";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * E3/E6 — a jornada do fechamento numa tela só: importar → conferir → ajustar →
 * enviar para aprovação. A transição de fase continua sendo do FinanceiroFecharDialog
 * (que gera o PDF e manda pro canal da diretoria); aqui é a mesa de trabalho da Mavi.
 */
export function FinanceiroFases({ mes, ano }: { mes: number; ano: number }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-fases", mes, ano],
    queryFn: async () => {
      const [pagRes, fechRes, recRes] = await Promise.all([
        (supabase as any).from("financeiro_pagamentos").select("*")
          .eq("mes_referencia", mes).eq("ano_referencia", ano)
          .order("profissional_nome"),
        (supabase as any).from("financeiro_fechamentos")
          .select("id, status, total, qtd_medicos, criado_em, aprovado_em")
          .eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
        (supabase as any).from("financeiro_receber")
          .select("descricao, valor_previsto, fonte")
          .eq("mes_referencia", mes).eq("ano_referencia", ano),
      ]);
      return {
        pagamentos: (pagRes.data || []) as FinanceiroPagamento[],
        fechamento: fechRes.data as any,
        receber: (recRes.data || []) as any[],
      };
    },
  });

  const pagamentos = data?.pagamentos ?? [];
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

  // "de onde veio" cada lançamento — o prefixo [cfg:id] marca o import por fonte
  const rotuloFonte = (p: FinanceiroPagamento) => {
    const arq = String((p as any).arquivo_origem || "");
    if (arq.startsWith("[cfg:")) return (arq.split("]")[1] || "").trim() || "Importado";
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
          <div className="min-w-0">
            <CardTitle className="text-base">
              Competência {String(mes).padStart(2, "0")}/{ano}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pagamentos.length} médico(s)
              {status ? ` · fechamento ${status.replace(/_/g, " ")}` : " · ainda não enviado para aprovação"}
            </p>
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Lançamentos do fechamento</p>
                  {podeAjustar && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" /> clique no médico para lançar acréscimo ou desconto
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                        <TableCell colSpan={2}>Total</TableCell>
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
                    Conferiu e ajustou tudo? Envie o fechamento para a diretoria aprovar.
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
