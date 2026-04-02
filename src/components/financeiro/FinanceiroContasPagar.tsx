import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FinanceiroPagamento, useAtualizarStatusPagamento } from "@/hooks/useFinanceiroData";
import { FinanceiroDetalhe } from "./FinanceiroDetalhe";
import { Eye, CheckCircle } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  aprovado: { label: "Aprovado", variant: "secondary" },
  pago: { label: "Pago", variant: "default" },
};

const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Props {
  pagamentos: FinanceiroPagamento[];
  isLoading: boolean;
}

export function FinanceiroContasPagar({ pagamentos, isLoading }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const atualizarStatus = useAtualizarStatusPagamento();

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatHoras = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, "0") + "min" : ""}`;
  };

  if (selectedId) {
    const pag = pagamentos.find((p) => p.id === selectedId);
    if (pag) {
      return <FinanceiroDetalhe pagamento={pag} onVoltar={() => setSelectedId(null)} />;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas a Pagar</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : pagamentos.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum pagamento encontrado. Gere pagamentos a partir das escalas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médico</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-center">Plantões</TableHead>
                  <TableHead className="text-center">Horas</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagamentos.map((p) => {
                  const badge = STATUS_BADGE[p.status] || STATUS_BADGE.pendente;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.profissional_nome}</TableCell>
                      <TableCell>
                        {MESES[p.mes_referencia]}/{p.ano_referencia}
                      </TableCell>
                      <TableCell>{p.unidade || "—"}</TableCell>
                      <TableCell className="text-center">{p.total_plantoes}</TableCell>
                      <TableCell className="text-center">{formatHoras(p.total_horas_minutos)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(p.valor_total))}</TableCell>
                      <TableCell>
                        {p.data_vencimento
                          ? new Date(p.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedId(p.id)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {p.status === "pendente" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                atualizarStatus.mutate({
                                  id: p.id,
                                  status: "pago",
                                  dataPagamento: new Date().toISOString().slice(0, 10),
                                })
                              }
                              title="Marcar como pago"
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
