import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { BarChart3, FileText, Settings, Wallet } from "lucide-react";
import { FinanceiroResumo } from "@/components/financeiro/FinanceiroResumo";
import { FinanceiroContasPagar } from "@/components/financeiro/FinanceiroContasPagar";
import { FinanceiroGerarDialog } from "@/components/financeiro/FinanceiroGerarDialog";
import { FinanceiroConfigValores } from "@/components/financeiro/FinanceiroConfigValores";
import { FinanceiroSigFinc } from "@/components/financeiro/FinanceiroSigFinc";
import { useFinanceiroPagamentos } from "@/hooks/useFinanceiroData";

const MESES = [
  { value: "0", label: "Todos" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export default function Financeiro() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [profissional, setProfissional] = useState("");
  const [status, setStatus] = useState("");

  const { data: pagamentos = [], isLoading } = useFinanceiroPagamentos({
    mesReferencia: mes || undefined,
    anoReferencia: ano,
    profissional: profissional || undefined,
    status: status || undefined,
  });

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Contas a pagar de médicos baseadas nas escalas</p>
      </div>
      <FinanceiroGerarDialog />
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4">
        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[140px]">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[100px]">
              <Label>Ano</Label>
              <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} min={2020} max={2030} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label>Profissional</Label>
              <Input placeholder="Buscar por nome..." value={profissional} onChange={(e) => setProfissional(e.target.value)} />
            </div>
            <div className="min-w-[140px]">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="resumo" className="space-y-4">
          <TabsList>
            <TabsTrigger value="resumo" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="contas" className="gap-2">
              <FileText className="h-4 w-4" /> Contas a Pagar
            </TabsTrigger>
            <TabsTrigger value="sigfinc" className="gap-2">
              <Wallet className="h-4 w-4" /> SigFinc
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="h-4 w-4" /> Valores
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <FinanceiroResumo pagamentos={pagamentos} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="contas">
            <FinanceiroContasPagar pagamentos={pagamentos} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="sigfinc">
            <FinanceiroSigFinc mesReferencia={mes || undefined} anoReferencia={ano} />
          </TabsContent>

          <TabsContent value="config">
            <FinanceiroConfigValores />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
