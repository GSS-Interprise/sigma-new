import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Vars {
  leadId: string;
  campanhaPropostaId: string;
  justificativa: string;
  motivoAnterior?: string | null;
}

export function useLiberarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, campanhaPropostaId, justificativa, motivoAnterior }: Vars) => {
      const { data, error } = await supabase.rpc("liberar_lead_proposta" as any, {
        p_lead_id: leadId,
        p_campanha_proposta_id: campanhaPropostaId,
        p_justificativa: justificativa,
        p_motivo_anterior: motivoAnterior ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success("Lead liberado com sucesso");
      qc.invalidateQueries({ queryKey: ["lead-status-proposta", vars.campanhaPropostaId] });
      qc.invalidateQueries({ queryKey: ["lead-canais", vars.campanhaPropostaId] });
    },
    onError: (e: any) => toast.error("Erro ao liberar lead: " + (e?.message || "desconhecido")),
  });
}
