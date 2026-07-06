import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Info } from "lucide-react";
import { useFinanceiroReceber, useSyncFinanceiroReceber } from "@/hooks/useFinanceiroData";

// T08 (meio pronto) — contas a receber dos contratos. Leitura + sync do mês.
// Regra de rateio mensal (fixo/hora/produção) ainda a definir — valor_previsto hoje
// traz o valor_estimado do contrato (total), não o mensal.
export function FinanceiroContasReceber({ mes, ano }: { mes: number; ano: number }) {
  const { data: itens = [], isLoading } = useFinanceiroReceber(mes, ano);
  const sync = useSyncFinanceiroReceber();

  const fmt = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const total = itens.reduce((s, i) => s + Number(i.valor_previsto || 0), 0);

  const badge = (s: string) =>
    s === "recebido" ? "default" : s === "faturado" ? "secondary" : "outline";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {itens.length} contrato(s) a faturar · previsto <b>{fmt(total)}</b>
        </p>
        <Button size="sm" variant="outline" onClick={() => sync.mutate({ mes, ano })} disabled={sync.isPending || !mes}>
          {sync.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Sincronizar contratos do mês
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>O valor previsto traz o <b>valor estimado do contrato (total)</b>. A regra de rateio mensal (fixo/hora/produção) ainda será definida — por enquanto confira a coluna <b>Condição de pagamento</b>.</span>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contas a Receber</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-6">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nada ainda. Clique em "Sincronizar contratos do mês".</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Condição de pagamento</TableHead>
                    <TableHead className="text-right">Valor previsto</TableHead>
                    <TableHead>NF saída</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="max-w-[320px] truncate">{i.descricao || "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">{i.condicao_pagamento || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(i.valor_previsto))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{i.nf_saida_status === "emitida" ? "Emitida" : "Pendente"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge(i.status)} className="text-[11px]">
                          {i.status === "recebido" ? "Recebido" : i.status === "faturado" ? "Faturado" : "A faturar"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
