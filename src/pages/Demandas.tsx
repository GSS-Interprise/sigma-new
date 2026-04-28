import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles } from "lucide-react";
import { ColunaAgenda } from "@/components/demandas/ColunaAgenda";
import { ColunaEnviadas } from "@/components/demandas/ColunaEnviadas";
import { ColunaParaMim } from "@/components/demandas/ColunaParaMim";
import { ColunaPendenciasSetor } from "@/components/demandas/ColunaPendenciasSetor";
import { NovaDemandaDialog } from "@/components/demandas/NovaDemandaDialog";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function Demandas() {
  const [novaOpen, setNovaOpen] = useState(false);
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
      <div className="h-[calc(100vh-8rem)] p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-3 h-full">
          <div className="md:row-span-2 min-h-0">
            <ColunaAgenda onTarefaClick={abrirDetalheTarefa} />
          </div>
          <div className="min-h-0">
            <ColunaEnviadas onTarefaClick={abrirDetalheTarefa} />
          </div>
          <div className="md:row-span-2 min-h-0">
            <ColunaPendenciasSetor />
          </div>
          <div className="min-h-0">
            <ColunaParaMim onTarefaClick={abrirDetalheTarefa} />
          </div>
        </div>
      </div>
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
