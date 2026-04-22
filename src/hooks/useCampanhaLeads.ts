import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StatusLeadCampanha =
  | "frio"
  | "contatado"
  | "em_conversa"
  | "aquecido"
  | "quente"
  | "convertido"
  | "sem_resposta"
  | "descartado";

export interface CampanhaLead {
  id: string;
  campanha_id: string;
  lead_id: string;
  status: StatusLeadCampanha;
  data_primeiro_contato: string | null;
  data_ultimo_contato: string | null;
  data_status: string | null;
  tentativas: number;
  canal_atual: string | null;
  conversa_id: string | null;
  metadados: Record<string, unknown>;
  created_at: string;
  lead?: {
    id: string;
    nome: string;
    phone_e164: string | null;
    email: string | null;
    uf: string | null;
    cidade: string | null;
    especialidade: string | null;
  };
}

export function useCampanhaLeads(campanhaId?: string) {
  return useQuery({
    queryKey: ["campanha-leads", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_leads")
        .select(
          "*, lead:lead_id(id, nome, phone_e164, email, uf, cidade, especialidade)"
        )
        .eq("campanha_id", campanhaId!)
        .order("data_status", { ascending: false });
      if (error) throw error;
      return (data || []) as CampanhaLead[];
    },
  });
}

export function useCampanhaLeadsByStatus(campanhaId?: string) {
  const { data: leads = [], ...rest } = useCampanhaLeads(campanhaId);

  const byStatus = leads.reduce(
    (acc, lead) => {
      if (!acc[lead.status]) acc[lead.status] = [];
      acc[lead.status].push(lead);
      return acc;
    },
    {} as Record<StatusLeadCampanha, CampanhaLead[]>
  );

  return { byStatus, leads, ...rest };
}

export function useAdicionarLeadsCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campanha_id: string; limite?: number }) => {
      const { data, error } = await supabase.rpc("selecionar_leads_campanha", {
        p_campanha_id: input.campanha_id,
        p_limite: input.limite || 50,
      });
      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("Nenhum lead disponível para os filtros desta campanha");
      }

      const rows = data.map((l: any) => ({
        campanha_id: input.campanha_id,
        lead_id: l.lead_id,
        status: "frio" as const,
      }));

      const { error: insertError } = await supabase
        .from("campanha_leads")
        .insert(rows);
      if (insertError) throw insertError;

      return data.length;
    },
    onSuccess: (count, input) => {
      qc.invalidateQueries({ queryKey: ["campanha-leads", input.campanha_id] });
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success(`${count} leads adicionados à campanha`);
    },
    onError: (e: any) => {
      const msg = String(e?.message || "");
      if (msg.includes("Lead já está ativo em outra proposta")) {
        toast.error(
          "Um ou mais leads já estão ativos em outra proposta desta campanha. Encerre o vínculo atual antes de adicioná-los aqui."
        );
      } else {
        toast.error(msg || "Erro ao adicionar leads");
      }
    },
  });
}

export function useAtualizarStatusLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanha_id: string;
      lead_id: string;
      novo_status: StatusLeadCampanha;
      canal?: string;
    }) => {
      const { error } = await supabase.rpc("atualizar_status_lead_campanha", {
        p_campanha_id: input.campanha_id,
        p_lead_id: input.lead_id,
        p_novo_status: input.novo_status,
        p_canal: input.canal || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["campanha-leads", input.campanha_id] });
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar status: " + e.message),
  });
}
