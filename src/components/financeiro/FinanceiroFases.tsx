import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, CheckCircle2, Circle, ArrowRight, Wallet, ClipboardCheck } from "lucide-react";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * E3 — as três fases do financeiro numa competência: Fechamento → Em aprovação → Pagamento.
 * Não reimplementa a transição: quem fecha continua sendo o FinanceiroFecharDialog (que gera
 * o PDF e manda pro canal do João). Aqui é a visão de ONDE o mês está e o que já entrou nele.
 */
export function FinanceiroFases({ mes, ano }: { mes: number; ano: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-fases", mes, ano],
    queryFn: async () => {
      const [pagRes, fechRes] = await Promise.all([
        (supabase as any).from("financeiro_pagamentos")
          .select("valor_total, valor_produzido, valor_a_vista, valor_ajustes, medico_id, profissional_nome, unidade, fonte, arquivo_origem, status")
          .eq("mes_referencia", mes).eq("ano_referencia", ano),
        (supabase as any).from("financeiro_fechamentos")
          .select("id, status, total, qtd_medicos, criado_em, aprovado_em")
          .eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
      ]);
      return { pagamentos: (pagRes.data || []) as any[], fechamento: fechRes.data as any };
    },
  });

  const pagamentos = data?.pagamentos ?? [];
  const fechamento = data?.fechamento;
  const status = fechamento?.status ?? null;

  // fase corrente: sem fechamento (ou cancelado) = ainda em montagem
  const fase = status === "pago" ? 3 : status === "aprovado" ? 3 : status === "aguardando_aprovacao" ? 2 : 1;

  const soma = (campo: string) => pagamentos.reduce((s, p) => s + Number(p[campo] || 0), 0);
  const produzido = soma("valor_produzido");
  const aVista = soma("valor_a_vista");
  const ajustes = soma("valor_ajustes");
  const aPagar = soma("valor_total");
  const medicos = new Set(pagamentos.map((p) => p.medico_id || p.profissional_nome)).size;

  // agrupa por FONTE que originou o lançamento — é o "de onde veio cada fechamento"
  const fontes = Object.values(
    pagamentos.reduce((acc: Record<string, any>, p) => {
      const arq = String(p.arquivo_origem || "");
      const chave = arq.startsWith("[cfg:") ? arq.slice(0, arq.indexOf("]") + 1) : (p.fonte || "manual");
      const rotulo = arq.startsWith("[cfg:")
        ? (arq.split("]")[1] || "").trim() || "Importado"
        : arq || (p.fonte === "import" ? "Importado (formato antigo)" : "Lançamento manual");
      acc[chave] ??= { rotulo, medicos: new Set<string>(), total: 0, aVista: 0 };
      acc[chave].medicos.add(p.medico_id || p.profissional_nome);
      acc[chave].total += Number(p.valor_total || 0);
      acc[chave].aVista += Number(p.valor_a_vista || 0);
      return acc;
    }, {})
  ) as any[];

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
              {medicos} médico(s) · {pagamentos.length} lançamento(s)
              {status ? ` · fechamento ${status.replace(/_/g, " ")}` : " · ainda não fechado"}
            </p>
          </div>
          {fase === 2 && (
            <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
              <Link to="/financeiro/aprovacoes">Ver aprovações <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { r: "Produzido", v: produzido, cls: "" },
              { r: "Já pago à vista", v: aVista, cls: "text-amber-700" },
              { r: "Ajustes", v: ajustes, cls: ajustes < 0 ? "text-red-600" : "text-emerald-700" },
              { r: "A pagar", v: aPagar, cls: "font-bold" },
            ].map((k) => (
              <div key={k.r} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{k.r}</p>
                <p className={`text-lg ${k.cls}`}>{brl(k.v)}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Fontes que entraram nesta competência</p>
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-3">Carregando…</p>
            ) : fontes.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                Nenhum lançamento ainda. Use <b>Importar fechamento</b> para trazer o relatório da fonte.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-center">Médicos</TableHead>
                      <TableHead className="text-right">Já pago à vista</TableHead>
                      <TableHead className="text-right">A pagar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fontes.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-[22rem] truncate" title={f.rotulo}>
                          <Circle className="h-2 w-2 inline mr-2 fill-current text-muted-foreground" />
                          {f.rotulo}
                        </TableCell>
                        <TableCell className="text-center">{f.medicos.size}</TableCell>
                        <TableCell className="text-right text-amber-700">{f.aVista > 0 ? brl(f.aVista) : "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(f.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
