import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DisparoManualInput {
  campanha_proposta_id: string;
  lead_id: string;
  phone_e164: string;
  instance_id: string;
  mensagem: string;
}

export function useDisparoManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DisparoManualInput) => {
      // Bloqueio defensivo: lead em fila de disparo em massa
      const { data: bloqueio } = await (supabase as any)
        .from("disparos_contatos")
        .select("status")
        .eq("lead_id", input.lead_id)
        .in("status", ["1-ENVIAR", "2-REENVIAR", "3-TRATANDO"])
        .limit(1)
        .maybeSingle();
      if (bloqueio?.status) {
        throw new Error(
          `Lead em fila de disparo em massa (${bloqueio.status}). Envio manual bloqueado.`
        );
      }
      const { data, error } = await supabase.functions.invoke("send-disparo-manual", {
        body: input,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { success: boolean; conversation_id: string; message: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["leads-a-contactar", vars.campanha_proposta_id] });
      qc.invalidateQueries({ queryKey: ["lead-status-proposta", vars.campanha_proposta_id] });
      qc.invalidateQueries({ queryKey: ["sigzap-conversations"] });
      qc.invalidateQueries({ queryKey: ["lead-canais", vars.campanha_proposta_id] });
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      qc.invalidateQueries({ queryKey: ["campanha-lista-leads"] });
      toast.success("Mensagem enviada e conversa registrada");
    },
    onError: (e: any) => toast.error("Erro: " + (e?.message || "falha no envio")),
  });
}