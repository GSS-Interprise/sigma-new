import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MedicosKanban } from "./MedicosKanban";
import { NovoMedicoKanbanCardDialog } from "./NovoMedicoKanbanCardDialog";
import { KanbanStatusManager } from "@/components/licitacoes/KanbanStatusManager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function KanbanTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const handleSync = async () => {
    setSyncing(true);
    await queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
    setSyncing(false);
    toast.success("Kanban atualizado");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <h2 className="text-lg font-semibold flex-shrink-0">Kanban de Captação</h2>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handleSync}
            disabled={syncing}
            title="Sincronizar"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
          <KanbanStatusManager modulo="medicos" />
          <NovoMedicoKanbanCardDialog />
        </div>
      </div>
      <MedicosKanban searchTerm={searchTerm} />
    </div>
  );
}
