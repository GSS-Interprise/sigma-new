import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function ContratosPorStatusChart() {
  const { data: contratosData } = useQuery({
    queryKey: ['contratos-por-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contratos')
        .select('status_contrato');
      
      if (!data) return [];
      
      const statusCount = data.reduce((acc: Record<string, number>, contrato) => {
        const status = contrato.status_contrato || 'Sem Status';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      return Object.entries(statusCount).map(([name, value]) => ({
        name,
        value
      }));
    },
  });

  const COLORS = {
    'Ativo': 'hsl(var(--accent))',
    'Vencido': 'hsl(var(--destructive))',
    'Pendente': 'hsl(var(--warning))',
    'Cancelado': 'hsl(var(--muted-foreground))',
    'Sem Status': 'hsl(var(--chart-5))',
  };

  const chartConfig = {
    value: {
      label: "Contratos",
    },
  };

  return (
    <Card className="shadow-md rounded-xl border-accent/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-lg">📈</span>
          </div>
          Contratos por Status
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Situação atualizada em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={contratosData || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
                className="outline-none"
              >
                {(contratosData || []).map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.name as keyof typeof COLORS] || 'hsl(var(--muted))'} 
                    className="stroke-background stroke-2"
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend 
                wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
