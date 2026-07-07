import { AppLayout } from "@/components/layout/AppLayout";
import { AgesDashboard } from "@/components/dashboard/AgesDashboard";
import { WorkspaceArea } from "@/components/workspace/WorkspaceArea";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Briefcase, Plus, Sparkles, Kanban } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColunaAgenda } from "@/components/demandas/ColunaAgenda";
import { ColunaMinhasTarefas } from "@/components/demandas/ColunaMinhasTarefas";
import { ColunaPendenciasSetor } from "@/components/demandas/ColunaPendenciasSetor";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { KanbanTarefas } from "@/components/demandas/KanbanTarefas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [novaDemandaOpen, setNovaDemandaOpen] = useState(false);
  const [tarefaAbertaId, setTarefaAbertaId] = useState<string | null>(null);
  const { setorNome } = useUserSetor();
  const { isAdmin } = usePermissions();

  const abrirDetalheTarefa = (id: string) => {
    if (!UUID_RE.test(id)) {
      toast.error("Não foi possível abrir esta demanda: ID inválido.");
      return;
    }
    setTarefaAbertaId(id);
  };

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

  const headerToolbar = (
    <div className="flex items-center justify-between gap-2 flex-wrap w-full">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 sm:h-10 gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-sm backdrop-blur shrink-0">
                <TabsTrigger
                  value="home"
              className="gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden xs:inline">Home</span>
                </TabsTrigger>
                <TabsTrigger
                  value="minha-area"
              className="gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
                >
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden xs:inline">Minha Área</span>
                </TabsTrigger>
                <TabsTrigger
                  value="kanban"
              className="gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
                >
                  <Kanban className="h-4 w-4" />
                  <span className="hidden xs:inline">Kanban</span>
                </TabsTrigger>
              </TabsList>
        </Tabs>
        {activeTab === "home" && (
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base sm:text-lg font-bold flex items-center gap-1.5 truncate">
              Demandas
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
            </h1>
            {(setorNome || isAdmin) && (
              <Badge variant="outline" className="text-[11px] shrink-0 hidden sm:inline-flex">
                {isAdmin ? "Admin · todos os setores" : setorNome}
              </Badge>
            )}
          </div>
        )}
      </div>
      {activeTab === "home" && (
        <Button onClick={() => setNovaDemandaOpen(true)} size="sm" className="gap-1 shrink-0 ml-auto">
          <Plus className="h-4 w-4" /> <span className="hidden xs:inline">Nova demanda</span>
        </Button>
      )}
    </div>
  );

  return (
    <AppLayout headerActions={headerToolbar}>
      <div className="p-3 min-h-[calc(100vh-4rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsContent value="home" className="flex-1 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1.15fr_0.7fr] gap-3 h-auto md:h-[calc(100vh-10rem)]">
              <div className="min-h-0">
                <ColunaAgenda onTarefaClick={abrirDetalheTarefa} />
              </div>
              <div className="min-h-0">
                <ColunaMinhasTarefas onTarefaClick={abrirDetalheTarefa} />
              </div>
              <div className="min-h-0">
                <ColunaPendenciasSetor />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="minha-area" className="mt-0">
            <WorkspaceArea />
          </TabsContent>

          <TabsContent value="kanban" className="flex-1 mt-0">
            <div className="h-[calc(100vh-10rem)]">
              <KanbanTarefas onTarefaClick={abrirDetalheTarefa} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <NovaDemandaDialog
        open={novaDemandaOpen}
        onOpenChange={setNovaDemandaOpen}
      />
      <NovaDemandaDialog
        key={tarefaAbertaId ?? "novo-detalhe"}
        tarefaId={tarefaAbertaId}
        open={!!tarefaAbertaId}
        onOpenChange={(open) => !open && setTarefaAbertaId(null)}
      />
    </AppLayout>
  );
}
