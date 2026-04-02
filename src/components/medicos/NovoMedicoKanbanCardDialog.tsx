import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";

export function NovoMedicoKanbanCardDialog() {
  const [open, setOpen] = useState(false);

  const handleNovoCard = () => {
    setOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
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
        leadId={null}
        isNewLead={true}
      />
    </>
  );
}
