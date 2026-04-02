import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/bi/InfoTip";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))'];

export function AbaFinanceiro() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const { data: recebimentos = [] } = useQuery({
    queryKey: ['recebimentos-bi', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase.from('recebimentos_cliente').select('*');
      
      if (dataInicio) {
        query = query.gte('created_at', dataInicio);
      }
      if (dataFim) {
        query = query.lte('created_at', dataFim);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  const { data: pagamentos = [] } = useQuery({
    queryKey: ['pagamentos-bi', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase.from('pagamentos_medico').select('*');
      
      if (dataInicio) {
        query = query.gte('created_at', dataInicio);
      }
      if (dataFim) {
        query = query.lte('created_at', dataFim);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  const totalReceitas = useMemo(() => 
    recebimentos.reduce((sum, r) => sum + Number(r.valor), 0), [recebimentos]
  );

  const totalDespesas = useMemo(() => 
    pagamentos.reduce((sum, p) => sum + Number(p.valor), 0), [pagamentos]
  );

  const lucroLiquido = useMemo(() => totalReceitas - totalDespesas, [totalReceitas, totalDespesas]);

  const margemPercentual = useMemo(() => 
    totalReceitas > 0 ? ((lucroLiquido / totalReceitas) * 100).toFixed(2) : 0,
    [lucroLiquido, totalReceitas]
  );

  const receitaDespesaMensal = useMemo(() => {
    const months: Record<string, { receitas: number; despesas: number }> = {};
    
    recebimentos.forEach(r => {
      const month = new Date(r.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      if (!months[month]) months[month] = { receitas: 0, despesas: 0 };
      months[month].receitas += Number(r.valor);
    });

    pagamentos.forEach(p => {
      const month = new Date(p.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      if (!months[month]) months[month] = { receitas: 0, despesas: 0 };
      months[month].despesas += Number(p.valor);
    });

    return Object.entries(months).map(([mes, valores]) => ({ mes, ...valores }));
  }, [recebimentos, pagamentos]);

  const composicaoData = [
    { categoria: 'Receitas', value: totalReceitas },
    { categoria: 'Despesas', value: totalDespesas }
  ];

  const fluxoCaixaAcumulado = useMemo(() => {
    let acumulado = 0;
    return receitaDespesaMensal.map(item => {
      acumulado += item.receitas - item.despesas;
      return { mes: item.mes, acumulado };
    });
  }, [receitaDespesaMensal]);

  if (!recebimentos.length && !pagamentos.length) {
    return (
      <TooltipProvider>
        <div className="space-y-6">
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
        />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Sem dados disponíveis para o período selecionado
          </CardContent>
        </Card>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <FiltroPeriodo
        dataInicio={dataInicio}
        dataFim={dataFim}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Líquido</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margem %</CardTitle>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margemPercentual}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingDown className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {recebimentos.length > 0 ? (totalReceitas / recebimentos.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Receitas vs Despesas
              <InfoTip text="Compara receitas e despesas por mês. Útil para identificar sazonalidade e meses com maior pressão de custo." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={receitaDespesaMensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="receitas" fill="hsl(var(--primary))" name="Receitas" />
                <Bar dataKey="despesas" fill="hsl(var(--destructive))" name="Despesas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Composição Financeira
              <InfoTip text="Mostra a participação de receitas vs despesas no período. Útil para leitura executiva de equilíbrio financeiro." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={composicaoData} dataKey="value" nameKey="categoria" cx="50%" cy="50%" outerRadius={100} label>
                  {composicaoData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Fluxo de Caixa Acumulado
              <InfoTip text="Soma mês a mês (receitas - despesas). Linha subindo = geração de caixa; caindo = consumo de caixa." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={fluxoCaixaAcumulado}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="acumulado" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      </div>
    </TooltipProvider>
  );
}
