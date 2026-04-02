import { AgesLeadProntuarioDialog } from "./AgesLeadProntuarioDialog";

interface AgesKanbanCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: {
    id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    profissao: string | null;
    observacoes: string | null;
    status: string;
    profissional_id?: string | null;
  } | null;
}

export function AgesKanbanCardDialog({ open, onOpenChange, card }: AgesKanbanCardDialogProps) {
  if (!card) return null;

  // No Kanban AGES, o "card" já é um registro da tabela ages_leads.
  // Portanto, basta abrir o prontuário pelo próprio id, sem criar novos leads.
  return (
    <AgesLeadProntuarioDialog
      open={open}
      onOpenChange={onOpenChange}
      leadId={card.id}
    />
  );
}
