import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, CheckCircle, AlertTriangle, FileText, TrendingUp, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FinanceiroPagamento, useFinanceiroReceber } from "@/hooks/useFinanceiroData";

interface Props {
  pagamentos: FinanceiroPagamento[];
  isLoading: boolean;
  mes: number;
  ano: number;
}

export function FinanceiroResumo({ pagamentos, isLoading, mes, ano }: Props) {
  const { data: receber = [] } = useFinanceiroReceber(mes, ano);
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

  // Acompanhamento das NFs solicitadas x recebidas
  const nf = useMemo(() => {
    const recebidas = pagamentos.filter((p) => p.nf_status === "recebida").length;
    const solicitadas = pagamentos.filter((p) => p.nf_status === "solicitada");
    const pendentes = solicitadas
      .map((p) => ({
        nome: p.profissional_nome,
        dias: p.nf_solicitada_em ? Math.floor((Date.now() - new Date(p.nf_solicitada_em).getTime()) / 86400000) : null,
      }))
      .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
    const totalNf = recebidas + solicitadas.length;
    const pct = totalNf ? Math.round((recebidas / totalNf) * 100) : 0;
    return { recebidas, pendentes, totalNf, pct };
  }, [pagamentos]);

  // T09 — consolidado: contas a receber do mês
  const rec = useMemo(() => {
    const previsto = receber.reduce((s, r) => s + Number(r.valor_previsto || 0), 0);
    const aFaturar = receber.filter((r) => r.status === "a_faturar").reduce((s, r) => s + Number(r.valor_previsto || 0), 0);
    const recebido = receber.filter((r) => r.status === "recebido").reduce((s, r) => s + Number(r.valor_faturado ?? r.valor_previsto || 0), 0);
    return { previsto, aFaturar, recebido, qtd: receber.length };
  }, [receber]);

  const saldoPrevisto = rec.previsto - stats.totalAPagar;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cards = [
    { title: "A Pagar (período)", value: fmt(stats.totalAPagar), icon: DollarSign, color: "text-primary" },
    { title: "Total Pago", value: fmt(stats.totalPago), icon: CheckCircle, color: "text-green-600" },
    { title: "Em Aberto", value: fmt(stats.totalEmAberto), icon: Clock, color: "text-amber-600" },
    { title: "Vencido", value: fmt(stats.totalPorVencer), icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-4">
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

      {/* T09 — consolidado a pagar × a receber */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber (previsto)</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmt(rec.previsto)}</div>
            <p className="text-xs text-muted-foreground">{rec.qtd} contrato(s) · {fmt(rec.aFaturar)} a faturar</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Já Recebido</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(rec.recebido)}</div></CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo previsto do mês (a receber − a pagar)</CardTitle>
            <Scale className={`h-4 w-4 ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-destructive"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${saldoPrevisto >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(saldoPrevisto)}</div>
            <p className="text-xs text-muted-foreground">Receber {fmt(rec.previsto)} − Pagar {fmt(stats.totalAPagar)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Acompanhamento de NF: quem já enviou x quem ainda falta */}
      {nf.totalNf > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" /> Notas Fiscais — acompanhamento
            </CardTitle>
            <span className="text-sm text-muted-foreground">{nf.recebidas} de {nf.totalNf} recebidas</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${nf.pct}%` }} />
            </div>
            {nf.pendentes.length === 0 ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" /> Todas as NFs solicitadas já foram recebidas.</p>
            ) : (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">{nf.pendentes.length} médico(s) ainda não enviaram a NF:</p>
                <div className="flex flex-wrap gap-1.5">
                  {nf.pendentes.map((p, i) => (
                    <Badge key={i} variant="outline"
                      className={(p.dias ?? 0) >= 3 ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-800"}>
                      {p.nome}{p.dias != null ? ` · ${p.dias}d` : ""}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Em vermelho: solicitados há 3 dias ou mais (candidatos a cobrança no WhatsApp).</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
