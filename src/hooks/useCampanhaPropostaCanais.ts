import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CanalSegmento =
  | "whatsapp"
  | "trafego_pago"
  | "email"
  | "instagram"
  | "ligacao"
  | "linkedin"
  | "tiktok";

export interface CampanhaPropostaCanal {
  id: string;
  campanha_proposta_id: string;
  canal: CanalSegmento;
  status: "pendente" | "em_andamento" | "concluido" | "falha";
  metadados: Record<string, any>;
  iniciado_em: string | null;
  concluido_em: string | null;
  created_at: string;
  updated_at: string;
}

export function useCampanhaPropostaCanais(cpId?: string) {
  return useQuery({
    queryKey: ["campanha-proposta-canais", cpId],
    enabled: !!cpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_proposta_canais")
        .select("*")
        .eq("campanha_proposta_id", cpId!)
        .order("canal");
      if (error) throw error;
      return (data || []) as CampanhaPropostaCanal[];
    },
  });
}

export function useUpdateCanalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: CampanhaPropostaCanal["status"];
      metadados?: Record<string, any>;
    }) => {
      const patch: any = { status: input.status };
      if (input.metadados) patch.metadados = input.metadados;
      if (input.status === "em_andamento") patch.iniciado_em = new Date().toISOString();
      if (input.status === "concluido") patch.concluido_em = new Date().toISOString();
      const { error } = await supabase
        .from("campanha_proposta_canais")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-proposta-canais"] });
      toast.success("Canal atualizado");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}
