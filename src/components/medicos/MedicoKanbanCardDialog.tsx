import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LeadProntuarioDialog } from "./LeadProntuarioDialog";
import { toast } from "sonner";

interface MedicoKanbanCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: {
    id: string;
    nome: string;
    cpf: string | null;
    data_nascimento: string | null;
    crm: string | null;
    telefone: string | null;
    email: string | null;
    observacoes: string | null;
    status: string;
    medico_id: string | null;
  } | null;
}

export function MedicoKanbanCardDialog({ open, onOpenChange, card }: MedicoKanbanCardDialogProps) {
  // Buscar lead vinculado ao card pelo email ou telefone
  const { data: leadVinculado, isLoading } = useQuery({
    queryKey: ['lead-by-kanban-card', card?.id, card?.email, card?.telefone],
    queryFn: async () => {
      if (!card) return null;
      
      // Primeiro tenta buscar por CPF (chave primária de deduplicação)
      if (card.cpf) {
        const cpfDigits = card.cpf.replace(/[^0-9]/g, '');
        if (cpfDigits) {
          // Busca pelo CPF original (pode ter formatação) e também só dígitos
          const { data: leadByCpf } = await supabase
            .from('leads')
            .select('id')
            .or(`cpf.eq.${card.cpf},cpf.eq.${cpfDigits},cpf.eq.${cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`)
            .maybeSingle();
          
          if (leadByCpf) return leadByCpf;
        }
      }

      // Tenta buscar por email
      if (card.email) {
        const { data: leadByEmail } = await supabase
          .from('leads')
          .select('id')
          .eq('email', card.email)
          .maybeSingle();
        
        if (leadByEmail) return leadByEmail;
      }
      
      // Tenta por telefone
      if (card.telefone) {
        const phoneE164 = card.telefone.startsWith('+') 
          ? card.telefone 
          : '+55' + card.telefone.replace(/[^0-9]/g, '');
        
        const { data: leadByPhone } = await supabase
          .from('leads')
          .select('id')
          .eq('phone_e164', phoneE164)
          .maybeSingle();
        
        if (leadByPhone) return leadByPhone;
      }
      
      // Se não encontrou por email nem telefone, cria um novo lead
      const phoneE164 = card.telefone 
        ? (card.telefone.startsWith('+') ? card.telefone : '+55' + card.telefone.replace(/[^0-9]/g, ''))
        : '+55' + Date.now().toString().slice(-11);

      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          nome: card.nome,
          phone_e164: phoneE164,
          email: card.email,
          cpf: card.cpf,
          crm: card.crm,
          data_nascimento: card.data_nascimento,
          observacoes: card.observacoes,
          status: 'Convertido',
          origem: 'Kanban Médicos (migrado)',
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Erro ao criar lead:', error);
        toast.error('Erro ao vincular card ao prontuário');
        return null;
      }
      
      return newLead;
    },
    enabled: !!card && open,
  });

  // Se está carregando ou não tem lead, não renderiza o dialog
  if (!card || isLoading) {
    return null;
  }

  // Renderiza o LeadProntuarioDialog usando o lead vinculado
  return (
    <LeadProntuarioDialog
      open={open}
      onOpenChange={onOpenChange}
      leadId={leadVinculado?.id || null}
    />
  );
}
