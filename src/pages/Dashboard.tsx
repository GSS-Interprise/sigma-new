import { AppLayout } from "@/components/layout/AppLayout";
import { AgesDashboard } from "@/components/dashboard/AgesDashboard";
import { WorkspaceArea } from "@/components/workspace/WorkspaceArea";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HojeParaVoce } from "@/components/home/HojeParaVoce";
import { SuaSemana } from "@/components/home/SuaSemana";
import { PendenciasAgrupadas } from "@/components/home/PendenciasAgrupadas";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { KanbanTarefas } from "@/components/demandas/KanbanTarefas";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { DisparosHojeFaixa } from "@/components/campanhas/DisparosHojeFaixa";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [novaDemandaOpen, setNovaDemandaOpen] = useState(false);
  const [tarefaAbertaId, setTarefaAbertaId] = useState<string | null>(null);
  const { isAdmin, hasPermission, userRoles: papeis } = usePermissions();
  const veDisparos = isAdmin || !!papeis?.some((r) => r.role === "diretoria") || hasPermission("disparos", "visualizar");

  const { data: primeiroNome } = useQuery({
    queryKey: ["home-primeiro-nome", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome_completo").eq("id", user!.id).maybeSingle();
      const n = (data?.nome_completo ?? "").trim().split(/\s+/)[0] ?? "";
      // nome em caixa normal ("Carla", não "CARLA"), como no resto do redesenho
      return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
    },
  });

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

  // Cabeçalho do redesenho 2027: uma linha, saudação à esquerda; à direita a troca de vista e a ação principal.
  // As vistas (Hoje, Kanban, Minha área) são as mesmas abas de antes; só mudaram de lugar e de nome.
  const VISTAS = [
    { v: "home", rotulo: "Hoje" },
    { v: "kanban", rotulo: "Kanban" },
    { v: "minha-area", rotulo: "Minha área" },
  ];
  const headerToolbar = (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="min-w-0 truncate font-display text-lg font-semibold">
        {saudacao()}
        {primeiroNome ? `, ${primeiroNome}` : ""}
      </h1>
      <div className="ml-auto flex items-center gap-2">
        <div role="tablist" aria-label="Vista da Home" className="flex rounded-lg border bg-muted/40 p-0.5">
          {VISTAS.map(({ v, rotulo }) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={activeTab === v}
              onClick={() => setActiveTab(v)}
              className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                activeTab === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <Button onClick={() => setNovaDemandaOpen(true)} size="sm" className="h-9 gap-1">
          <Plus className="h-4 w-4" /> Nova demanda
        </Button>
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerToolbar}>
      <div className="p-4 md:p-6 min-h-[calc(100vh-4rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsContent value="home" className="flex-1 mt-0">
            {/* Disparos de hoje para quem acompanha a prospecção (sócios e captação). */}
            {veDisparos && <DisparosHojeFaixa className="mb-4" />}
            {/* 1280+ px: lista à esquerda, semana e pendências à direita. Abaixo disso a lista ocupa a largura toda
                (em 1024 os títulos cortavam) e semana e pendências ficam lado a lado embaixo. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <HojeParaVoce onAbrir={abrirDetalheTarefa} onVerTodas={() => setActiveTab("kanban")} />
              <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
                <SuaSemana onAbrirTarefa={abrirDetalheTarefa} />
                <PendenciasAgrupadas onAbrirTarefa={abrirDetalheTarefa} />
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
