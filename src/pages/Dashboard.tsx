import { AppLayout } from "@/components/layout/AppLayout";
import { Calendar, Users, FileText, AlertCircle } from "lucide-react";
import { EnhancedMetricCard } from "@/components/dashboard/EnhancedMetricCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MedicosPorEspecialidadeChart } from "@/components/dashboard/MedicosPorEspecialidadeChart";
import { AtividadesRecentes } from "@/components/dashboard/AtividadesRecentes";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RelacionamentoArea } from "@/components/dashboard/RelacionamentoArea";
import { AgesDashboard } from "@/components/dashboard/AgesDashboard";
import { WorkspaceHomeCard } from "@/components/dashboard/WorkspaceHomeCard";
import { WorkspaceArea } from "@/components/workspace/WorkspaceArea";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, isWithinInterval } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Briefcase } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");

  // Verificar se o usuário é gestor_ages (exclusivo AGES)
  const { data: userRoles, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['user-roles-dashboard', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      return data || [];
    },
  });

  const isGestorAges = userRoles?.some(r => r.role === 'gestor_ages') && 
                       !userRoles?.some(r => r.role === 'admin' || r.role === 'diretoria' || r.role === 'lideres');

  const { data: medicosAtivosCount } = useQuery({
    queryKey: ['medicos-ativos-total'],
    enabled: !isGestorAges,
    queryFn: async () => {
      const { count } = await supabase
        .from('medicos')
        .select('*', { count: 'exact', head: true })
        .eq('status_medico', 'Ativo');
      return count || 0;
    },
  });

  const { data: contratosVencendo } = useQuery({
    queryKey: ['contratos-vencendo'],
    enabled: !isGestorAges,
    queryFn: async () => {
      const today = new Date();
      const in15Days = addDays(today, 15);
      
      const { data } = await supabase
        .from('contratos')
        .select(`
          *,
          cliente:clientes(nome_fantasia),
          medico:medicos(nome_completo)
        `);
      
      if (!data) return { count: 0, contratos: [] };
      
      const vencendo = data.filter(c => {
        if (!c.data_fim) return false;
        const dataFim = new Date(c.data_fim);
        return isWithinInterval(dataFim, { start: today, end: in15Days });
      });
      
      return { count: vencendo.length, contratos: vencendo };
    },
  });

  const { data: contratosAtivosCount } = useQuery({
    queryKey: ['contratos-ativos'],
    enabled: !isGestorAges,
    queryFn: async () => {
      const { count } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('status_contrato', 'Ativo');
      return count || 0;
    },
  });

  const { data: relacionamentosAbertos } = useQuery({
    queryKey: ['relacionamentos-abertos'],
    enabled: !isGestorAges,
    queryFn: async () => {
      const { count } = await supabase
        .from('relacionamento_medico')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aberta');
      return count || 0;
    },
  });

  // Se ainda carregando roles, mostrar loading
  if (isLoadingRoles) {
    return (
      <AppLayout>
        <div className="p-4 flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  // Se for gestor_ages exclusivo, mostrar dashboard AGES
  if (isGestorAges) {
    return (
      <AppLayout>
        <AgesDashboard />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 min-h-screen flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="home" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Home
            </TabsTrigger>
            <TabsTrigger value="minha-area" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Minha Área
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="space-y-8">
            <DashboardHeader />

            {/* Indicadores Rápidos */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <EnhancedMetricCard
                title="Médicos ativos no corpo clínico"
                value={medicosAtivosCount || 0}
                icon={Users}
                colorClass="border-l-accent"
              />
              <EnhancedMetricCard
                title="Contratos a vencer em 15 dias"
                value={contratosVencendo?.count || 0}
                icon={Calendar}
                colorClass="border-l-warning"
                hoverData={contratosVencendo?.contratos}
              />
              <EnhancedMetricCard
                title="Contratos ativos"
                value={contratosAtivosCount || 0}
                icon={FileText}
                colorClass="border-l-primary"
              />
              <EnhancedMetricCard
                title="Ações abertas"
                value={relacionamentosAbertos || 0}
                icon={AlertCircle}
                colorClass="border-l-destructive"
              />
            </div>

            {/* Gráficos */}
            <div className="w-full">
              <MedicosPorEspecialidadeChart />
            </div>

            {/* Área de Relacionamento */}
            <RelacionamentoArea />

            {/* Atividades e Ações Rápidas */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AtividadesRecentes />
              </div>
              <div className="space-y-6">
                <WorkspaceHomeCard onNavigate={() => setActiveTab("minha-area")} />
                <QuickActions />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="minha-area">
            <WorkspaceArea />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
