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
    <div className="flex items-center justify-between w-full gap-3">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Demandas
            <Sparkles className="h-4 w-4 text-primary" />
          </h1>
          <p className="text-xs text-muted-foreground">
            Hub de tarefas, agenda e pendências
          </p>
        </div>
        {(setorNome || isAdmin) && (
          <Badge variant="outline" className="text-[11px]">
            {isAdmin ? "Admin · todos os setores" : setorNome}
          </Badge>
        )}
      </div>
      <Button onClick={() => setNovaOpen(true)} className="gap-1">
        <Plus className="h-4 w-4" /> Nova demanda
      </Button>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <Tabs defaultValue="home" className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="px-4 pt-4">
          <TabsList className="h-11 gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-sm backdrop-blur">
            <TabsTrigger
              value="home"
              className="gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
            >
              <LayoutGrid className="h-4 w-4" /> Home
            </TabsTrigger>
            <TabsTrigger
              value="kanban"
              className="gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
            >
              <Kanban className="h-4 w-4" /> Kanban de tarefas
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="home" className="flex-1 min-h-0 p-3 mt-2">
          <div className="grid grid-cols-1 gap-4 h-full md:grid-cols-12">
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
        <TabsContent value="kanban" className="flex-1 min-h-0 p-3 mt-2">
          <KanbanTarefas onTarefaClick={abrirDetalheTarefa} />
        </TabsContent>
      </Tabs>
      <NovaDemandaDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <NovaDemandaDialog
        key={tarefaAbertaId ?? "novo-detalhe"}
        tarefaId={tarefaAbertaId}
        open={!!tarefaAbertaId}
        onOpenChange={(open) => !open && setTarefaAbertaId(null)}
      />
    </AppLayout>
  );
}
