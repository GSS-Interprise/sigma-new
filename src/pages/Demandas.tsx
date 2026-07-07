import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, LayoutGrid, Kanban } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ColunaAgenda } from "@/components/demandas/ColunaAgenda";
import { ColunaMinhasTarefas } from "@/components/demandas/ColunaMinhasTarefas";
import { ColunaPendenciasSetor } from "@/components/demandas/ColunaPendenciasSetor";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { KanbanTarefas } from "@/components/demandas/KanbanTarefas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function Demandas() {
  const [novaOpen, setNovaOpen] = useState(false);
  const [tarefaAbertaId, setTarefaAbertaId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { setorNome } = useUserSetor();
  const { isAdmin } = usePermissions();
  const [tab, setTab] = useState<string>("home");

  const abrirDetalheTarefa = (id: string) => {
    if (!UUID_RE.test(id)) {
      toast.error("Não foi possível abrir esta demanda: ID inválido.");
      return;
    }
    setTarefaAbertaId(id);
  };

  // Abrir tarefa via querystring (?tarefa=<id>) — usado pelo modal global de atrasadas
  useEffect(() => {
    const id = searchParams.get("tarefa");
    if (id && UUID_RE.test(id)) {
      setTarefaAbertaId(id);
      const next = new URLSearchParams(searchParams);
      next.delete("tarefa");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const headerActions = (
    <div className="flex flex-wrap items-center justify-between w-full gap-2">
      <div className="flex items-center gap-2 min-w-0 order-2 sm:order-1">
        <TabsList className="h-9 sm:h-10 gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-sm backdrop-blur shrink-0">
          <TabsTrigger
            value="home"
            className="gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
          >
            <LayoutGrid className="h-4 w-4" /> <span className="hidden xs:inline">Home</span>
          </TabsTrigger>
          <TabsTrigger
            value="kanban"
            className="gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
          >
            <Kanban className="h-4 w-4" /> <span className="hidden xs:inline">Kanban</span>
          </TabsTrigger>
        </TabsList>
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
      <Button onClick={() => setNovaOpen(true)} size="sm" className="gap-1 shrink-0 order-1 sm:order-2 ml-auto sm:ml-0">
        <Plus className="h-4 w-4" /> <span className="hidden xs:inline">Nova demanda</span>
      </Button>
    </div>
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="contents">
      <AppLayout headerActions={headerActions}>
        <TabsContent value="home" className="flex-1 min-h-0 p-3 mt-0 h-auto md:h-[calc(100vh-5rem)]">
          <div className="grid grid-cols-1 gap-4 md:h-full md:grid-cols-12">
            <div className="min-h-0 md:col-span-3">
              <ColunaAgenda onTarefaClick={abrirDetalheTarefa} />
            </div>
            <div className="min-h-0 md:col-span-6">
              <ColunaMinhasTarefas onTarefaClick={abrirDetalheTarefa} />
            </div>
            <div className="min-h-0 md:col-span-3">
              <ColunaPendenciasSetor />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="kanban" className="flex-1 min-h-0 p-3 mt-0 h-[calc(100vh-5rem)]">
          <KanbanTarefas onTarefaClick={abrirDetalheTarefa} />
        </TabsContent>
        <NovaDemandaDialog open={novaOpen} onOpenChange={setNovaOpen} />
        <NovaDemandaDialog
          key={tarefaAbertaId ?? "novo-detalhe"}
          tarefaId={tarefaAbertaId}
          open={!!tarefaAbertaId}
          onOpenChange={(open) => !open && setTarefaAbertaId(null)}
        />
      </AppLayout>
    </Tabs>
  );
}
