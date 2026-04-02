import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, DollarSign, Target, BarChart3 } from "lucide-react";

export function RelatoriosTab() {
  const { data: campanhas } = useQuery({
    queryKey: ['campanhas-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('campanhas' as any).select('*');
      return (data || []) as any;
    },
  });

  const { data: leads } = useQuery({
    queryKey: ['leads-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('marketing_leads' as any).select('*');
      return (data || []) as any;
    },
  });

  const { data: conteudos } = useQuery({
    queryKey: ['conteudos-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('conteudos' as any).select('*');
      return (data || []) as any;
    },
  });

  const totalLeads = leads?.length || 0;
  const leadsConvertidos = leads?.filter(l => l.etapa === 'plantao_agendado').length || 0;
  const taxaConversao = totalLeads > 0 ? ((leadsConvertidos / totalLeads) * 100).toFixed(1) : '0';
  
  const orcamentoTotal = campanhas?.reduce((sum, c) => sum + (Number(c.orcamento) || 0), 0) || 0;
  const custoporLead = totalLeads > 0 ? (orcamentoTotal / totalLeads).toFixed(2) : '0';

  const totalAlcance = conteudos?.reduce((sum, c) => sum + (c.alcance || 0), 0) || 0;
  const totalEngajamento = conteudos?.length || 0 > 0
    ? (conteudos?.reduce((sum, c) => sum + (Number(c.engajamento) || 0), 0) || 0) / (conteudos?.length || 1)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Relatórios e Métricas</h2>
        <p className="text-sm text-muted-foreground">Acompanhe o desempenho das suas ações de marketing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Leads</p>
              <p className="text-2xl font-bold">{totalLeads}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Target className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
              <p className="text-2xl font-bold">{taxaConversao}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Custo por Lead</p>
              <p className="text-2xl font-bold">R$ {custoporLead}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Alcance Total</p>
              <p className="text-2xl font-bold">{totalAlcance.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5" />
            <h3 className="font-semibold">Leads por Campanha</h3>
          </div>
          <div className="space-y-3">
            {campanhas?.map((campanha) => {
              const leadsCampanha = leads?.filter(l => l.origem_campanha_id === campanha.id).length || 0;
              return (
                <div key={campanha.id} className="flex justify-between items-center">
                  <span className="text-sm">{campanha.nome}</span>
                  <span className="font-semibold">{leadsCampanha} leads</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-5 w-5" />
            <h3 className="font-semibold">Médicos por Especialidade</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(
              leads?.reduce((acc: Record<string, number>, lead: any) => {
                const esp = lead.especialidade || 'Não especificada';
                acc[esp] = (acc[esp] || 0) + 1;
                return acc;
              }, {}) || {}
            ).map(([especialidade, count]) => (
              <div key={especialidade} className="flex justify-between items-center">
                <span className="text-sm">{especialidade}</span>
                <span className="font-semibold">{count as number}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Engajamento de Conteúdos</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold">{totalAlcance.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Alcance Total</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{totalEngajamento.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Engajamento Médio</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{conteudos?.length || 0}</p>
            <p className="text-sm text-muted-foreground">Conteúdos Publicados</p>
          </div>
        </div>
      </Card>
    </div>
  );
}