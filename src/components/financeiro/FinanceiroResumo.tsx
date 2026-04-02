import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { FinanceiroPagamento } from "@/hooks/useFinanceiroData";

interface Props {
  pagamentos: FinanceiroPagamento[];
  isLoading: boolean;
}

export function FinanceiroResumo({ pagamentos, isLoading }: Props) {
  const stats = useMemo(() => {
    const totalAPagar = pagamentos.reduce((s, p) => s + Number(p.valor_total), 0);
    const totalPago = pagamentos
      .filter((p) => p.status === "pago")
      .reduce((s, p) => s + Number(p.valor_total), 0);
    const totalEmAberto = pagamentos
      .filter((p) => p.status === "pendente")
      .reduce((s, p) => s + Number(p.valor_total), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const totalPorVencer = pagamentos
      .filter((p) => p.status === "pendente" && p.data_vencimento && p.data_vencimento <= hoje)
      .reduce((s, p) => s + Number(p.valor_total), 0);
    return { totalAPagar, totalPago, totalEmAberto, totalPorVencer };
  }, [pagamentos]);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cards = [
    { title: "Total no Período", value: fmt(stats.totalAPagar), icon: DollarSign, color: "text-primary" },
    { title: "Total Pago", value: fmt(stats.totalPago), icon: CheckCircle, color: "text-green-600" },
    { title: "Em Aberto", value: fmt(stats.totalEmAberto), icon: Clock, color: "text-amber-600" },
    { title: "Vencido", value: fmt(stats.totalPorVencer), icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isLoading ? "animate-pulse" : ""}`}>
              {isLoading ? "..." : c.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
