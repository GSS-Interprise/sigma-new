import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";

export function NovoMedicoKanbanCardDialog() {
  const [open, setOpen] = useState(false);
  // Depois de salvar, o mesmo diálogo passa a mostrar o médico criado: a ida para Contratos é pela aba Conversão
  const [leadCriado, setLeadCriado] = useState<string | null>(null);

  const handleNovoCard = () => {
    setLeadCriado(null);
    setOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) setLeadCriado(null);
  };

  return (
    <>
      <Button onClick={handleNovoCard}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Médico
      </Button>

      <LeadProntuarioDialog
        open={open}
        onOpenChange={handleDialogClose}
        leadId={leadCriado}
        isNewLead={!leadCriado}
        onLeadCriado={setLeadCriado}
      />
    </>
  );
}
