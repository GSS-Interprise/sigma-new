import { Calendar, Users, FileText, AlertCircle, UserPlus, Building2 } from "lucide-react";
import { EnhancedMetricCard } from "./EnhancedMetricCard";
import { DashboardHeader } from "./DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, isWithinInterval, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgesDashboard() {
  // Profissionais ativos
  const { data: profissionaisAtivos } = useQuery({
    queryKey: ['ages-profissionais-ativos'],
    queryFn: async () => {
      const { count } = await supabase
        .from('ages_profissionais')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');
      return count || 0;
    },
  });

  // Contratos AGES a vencer em 15 dias
  const { data: contratosVencendo } = useQuery({
    queryKey: ['ages-contratos-vencendo'],
    queryFn: async () => {
      const today = new Date();
      const in15Days = addDays(today, 15);
      
      const { data } = await supabase
        .from('ages_contratos')
        .select(`
          *,
          profissional:ages_profissionais(nome),
          cliente:ages_clientes(nome_empresa)
        `)
        .not('data_fim', 'is', null);
      
      if (!data) return { count: 0, contratos: [] };
      
      const vencendo = data.filter(c => {
        if (!c.data_fim) return false;
        const dataFim = new Date(c.data_fim);
        return isWithinInterval(dataFim, { start: today, end: in15Days });
      });
      
      return { count: vencendo.length, contratos: vencendo };
    },
  });

  // Contratos AGES ativos
  const { data: contratosAtivos } = useQuery({
    queryKey: ['ages-contratos-ativos'],
    queryFn: async () => {
      const { count } = await supabase
        .from('ages_contratos')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');
      return count || 0;
    },
  });

  // Leads AGES em aberto
  const { data: leadsAbertos } = useQuery({
    queryKey: ['ages-leads-abertos'],
    queryFn: async () => {
      const { count } = await supabase
        .from('ages_leads')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'contratado')
        .neq('status', 'descartado');
      return count || 0;
    },
  });

  // Clientes AGES
  const { data: totalClientes } = useQuery({
    queryKey: ['ages-clientes-total'],
    queryFn: async () => {
      const { count } = await supabase
        .from('ages_clientes')
        .select('*', { count: 'exact', head: true })
        .eq('status_cliente', 'ativo');
      return count || 0;
    },
  });

  // Atividades recentes AGES
  const { data: atividadesRecentes } = useQuery({
    queryKey: ['ages-atividades-recentes'],
    queryFn: async () => {
      const [profissionais, leads, contratos] = await Promise.all([
        supabase.from('ages_profissionais').select('nome, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('ages_leads').select('nome, created_at, status').order('created_at', { ascending: false }).limit(3),
        supabase.from('ages_contratos').select('codigo_contrato, created_at, status, profissional:ages_profissionais(nome)').order('created_at', { ascending: false }).limit(3),
      ]);

      const atividades = [
        ...(profissionais.data || []).map(p => ({
          tipo: 'profissional',
          descricao: `Novo profissional: ${p.nome}`,
          data: new Date(p.created_at),
          icone: Users,
        })),
        ...(leads.data || []).map(l => ({
          tipo: 'lead',
          descricao: `Lead ${l.status}: ${l.nome}`,
          data: new Date(l.created_at),
          icone: UserPlus,
        })),
        ...(contratos.data || []).map(c => ({
          tipo: 'contrato',
          descricao: `Contrato ${c.codigo_contrato || 'novo'}: ${c.profissional?.nome || 'N/A'}`,
          data: new Date(c.created_at),
          icone: FileText,
        })),
      ];

      return atividades.sort((a, b) => b.data.getTime() - a.data.getTime()).slice(0, 10);
    },
  });

  // Profissionais por profissão
  const { data: profissionaisPorProfissao } = useQuery({
    queryKey: ['ages-profissionais-por-profissao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ages_profissionais')
        .select('profissao')
        .eq('status', 'ativo');
      
      if (!data) return [];
      
      const counts: Record<string, number> = {};
      data.forEach(p => {
        const prof = p.profissao || 'Não informado';
        counts[prof] = (counts[prof] || 0) + 1;
      });
      
      return Object.entries(counts)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    },
  });

  const getIconColor = (tipo: string) => {
    switch (tipo) {
      case 'profissional': return 'bg-accent/10 text-accent';
      case 'lead': return 'bg-primary/10 text-primary';
      case 'contrato': return 'bg-warning/10 text-warning';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-4 space-y-8 min-h-screen flex flex-col">
      <DashboardHeader />

      {/* Indicadores Rápidos AGES */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <EnhancedMetricCard
          title="Profissionais ativos"
          value={profissionaisAtivos || 0}
          icon={Users}
          colorClass="border-l-accent"
        />
        <EnhancedMetricCard
          title="Contratos a vencer (15 dias)"
          value={contratosVencendo?.count || 0}
          icon={Calendar}
          colorClass="border-l-warning"
        />
        <EnhancedMetricCard
          title="Contratos ativos"
          value={contratosAtivos || 0}
          icon={FileText}
          colorClass="border-l-primary"
        />
        <EnhancedMetricCard
          title="Leads em aberto"
          value={leadsAbertos || 0}
          icon={UserPlus}
          colorClass="border-l-destructive"
        />
        <EnhancedMetricCard
          title="Clientes ativos"
          value={totalClientes || 0}
          icon={Building2}
          colorClass="border-l-secondary"
        />
      </div>

      {/* Gráfico de Profissionais por Profissão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Profissionais por Profissão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {profissionaisPorProfissao?.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum profissional cadastrado</p>
            )}
            {profissionaisPorProfissao?.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="text-sm font-medium">{item.name}</span>
                <div className="flex items-center gap-2">
                  <div 
                    className="h-2 bg-primary rounded-full" 
                    style={{ width: `${Math.min(item.total * 20, 200)}px` }}
                  />
                  <span className="text-sm text-muted-foreground w-8 text-right">{item.total}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Atividades Recentes AGES */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Atividades Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {atividadesRecentes?.length === 0 && (
                <p className="text-muted-foreground text-sm">Nenhuma atividade recente</p>
              )}
              {atividadesRecentes?.map((atividade, index) => {
                const Icon = atividade.icone;
                return (
                  <div key={index} className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getIconColor(atividade.tipo)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{atividade.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(atividade.data, { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
