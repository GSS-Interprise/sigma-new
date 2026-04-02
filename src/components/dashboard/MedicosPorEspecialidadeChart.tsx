import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export function MedicosPorEspecialidadeChart() {
  const { data: medicosData } = useQuery({
    queryKey: ['medicos-por-especialidade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('medicos')
        .select('especialidade');
      
      if (!data) return [];
      
      const especialidades = data.reduce((acc: Record<string, number>, medico) => {
        const especialidadesArray = medico.especialidade || [];
        // Se for array, processar cada especialidade; se não for, tratar como array de uma posição
        const especialidadesList = Array.isArray(especialidadesArray) 
          ? especialidadesArray 
          : [especialidadesArray].filter(Boolean);
        
        if (especialidadesList.length === 0) {
          acc['Não especificada'] = (acc['Não especificada'] || 0) + 1;
        } else {
          especialidadesList.forEach((esp: string) => {
            acc[esp] = (acc[esp] || 0) + 1;
          });
        }
        return acc;
      }, {});
      
      return Object.entries(especialidades)
        .map(([name, value]) => ({
          name,
          total: value
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
    },
  });

  const chartConfig = {
    total: {
      label: "Médicos",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <Card className="shadow-md rounded-xl border-accent/20">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-lg">📊</span>
          </div>
          Médicos por Especialidade (Top 20)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Distribuição atualizada em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </CardHeader>
      <CardContent className="pr-2">
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={medicosData || []} margin={{ top: 20, right: 0, left: 0, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="name" 
                className="text-[10px] font-medium fill-muted-foreground"
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
              />
              <YAxis 
                className="text-xs font-semibold fill-muted-foreground" 
                tickFormatter={(value) => value.toString()}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar 
                dataKey="total" 
                fill="hsl(var(--accent))" 
                radius={[8, 8, 0, 0]} 
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
