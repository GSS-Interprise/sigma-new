import { AppLayout } from "@/components/layout/AppLayout";
import { AgesDashboard } from "@/components/dashboard/AgesDashboard";
import { WorkspaceArea } from "@/components/workspace/WorkspaceArea";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Briefcase, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColunaAgenda } from "@/components/demandas/ColunaAgenda";
import { ColunaEnviadas } from "@/components/demandas/ColunaEnviadas";
import { ColunaParaMim } from "@/components/demandas/ColunaParaMim";
import { ColunaPendenciasSetor } from "@/components/demandas/ColunaPendenciasSetor";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [novaDemandaOpen, setNovaDemandaOpen] = useState(false);
  const { setorNome } = useUserSetor();
  const { isAdmin } = usePermissions();

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
      <div className="p-3 min-h-[calc(100vh-4rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="home" className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Home
                </TabsTrigger>
                <TabsTrigger value="minha-area" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Minha Área
                </TabsTrigger>
              </TabsList>
              {activeTab === "home" && (
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold flex items-center gap-1.5">
                    Demandas
                    <Sparkles className="h-4 w-4 text-primary" />
                  </h1>
                  {(setorNome || isAdmin) && (
                    <Badge variant="outline" className="text-[11px]">
                      {isAdmin ? "Admin · todos os setores" : setorNome}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {activeTab === "home" && (
              <Button onClick={() => setNovaDemandaOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Nova demanda
              </Button>
            )}
          </div>

          <TabsContent value="home" className="flex-1 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 h-[calc(100vh-10rem)]">
              <ColunaAgenda />
              <ColunaEnviadas />
              <ColunaParaMim />
              <ColunaPendenciasSetor />
            </div>
          </TabsContent>

          <TabsContent value="minha-area" className="mt-0">
            <WorkspaceArea />
          </TabsContent>
        </Tabs>
      </div>

      <NovaDemandaDialog
        open={novaDemandaOpen}
        onOpenChange={setNovaDemandaOpen}
      />
    </AppLayout>
  );
}
