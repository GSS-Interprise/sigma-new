import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FinanceiroPagamento, useFinanceiroPagamentoItens } from "@/hooks/useFinanceiroData";

interface Props {
  pagamento: FinanceiroPagamento;
  onVoltar: () => void;
}

export function FinanceiroDetalhe({ pagamento, onVoltar }: Props) {
  const { data: itens = [], isLoading } = useFinanceiroPagamentoItens(pagamento.id);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatHoras = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, "0") + "min" : ""}`;
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onVoltar} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profissional</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{pagamento.profissional_nome}</p>
            {pagamento.profissional_crm && (
              <p className="text-sm text-muted-foreground">CRM: {pagamento.profissional_crm}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Consolidado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(Number(pagamento.valor_total))}</p>
            <p className="text-sm text-muted-foreground">
              {pagamento.total_plantoes} plantões • {formatHoras(pagamento.total_horas_minutos)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={pagamento.status === "pago" ? "default" : "outline"} className="text-sm">
              {pagamento.status === "pago" ? "Pago" : pagamento.status === "aprovado" ? "Aprovado" : "Pendente"}
            </Badge>
            {pagamento.data_vencimento && (
              <p className="text-sm text-muted-foreground mt-1">
                Vencimento: {new Date(pagamento.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plantões Vinculados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-4">Carregando...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="text-center">Duração</TableHead>
                    <TableHead className="text-right">Valor/Hora</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {new Date(item.data_plantao + "T00:00:00").toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {item.hora_inicio} - {item.hora_fim}
                      </TableCell>
                      <TableCell>{item.setor || "—"}</TableCell>
                      <TableCell>{item.local_nome || "—"}</TableCell>
                      <TableCell className="text-center">
                        {item.carga_horaria_minutos ? formatHoras(item.carga_horaria_minutos) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{fmt(Number(item.valor_hora))}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(item.valor_total))}</TableCell>
                    </TableRow>
                  ))}
                  {itens.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-center">
                        {formatHoras(itens.reduce((s, i) => s + (i.carga_horaria_minutos || 0), 0))}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {fmt(itens.reduce((s, i) => s + Number(i.valor_total), 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
