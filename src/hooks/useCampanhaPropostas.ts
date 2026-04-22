import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CampanhaProposta {
  id: string;
  campanha_id: string;
  proposta_id: string;
  lista_id: string | null;
  status: "ativa" | "encerrada";
  webhook_trafego_enviado_at: string | null;
  encerrada_em: string | null;
  encerrada_por: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCampanhaPropostas(campanhaId?: string) {
  return useQuery({
    queryKey: ["campanha-propostas", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_propostas")
        .select("*, proposta:proposta_id(id, id_proposta, descricao, observacoes), lista:lista_id(id, nome, total_estimado)")
        .eq("campanha_id", campanhaId!)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useCampanhaPropostas] erro:", error);
        throw error;
      }

      const vinculos = data || [];
      const listaIds = Array.from(
        new Set(vinculos.map((item: any) => item.lista_id).filter(Boolean))
      ) as string[];

      const leadsPorLista = new Map<string, number>();

      if (listaIds.length > 0) {
        const { data: listaItens, error: listaItensError } = await supabase
          .from("disparo_lista_itens")
          .select("lista_id")
          .in("lista_id", listaIds);

        if (listaItensError) {
          console.error("[useCampanhaPropostas] erro ao contar leads das listas:", listaItensError);
          throw listaItensError;
        }

        for (const item of listaItens || []) {
          leadsPorLista.set(item.lista_id, (leadsPorLista.get(item.lista_id) || 0) + 1);
        }
      }

      console.log("[useCampanhaPropostas] campanhaId=", campanhaId, "rows=", data?.length);
      return vinculos.map((item: any) => ({
        ...item,
        lista_leads_count: item.lista_id ? leadsPorLista.get(item.lista_id) || 0 : 0,
      }));
    },
  });
}

export function useVincularProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanha_id: string;
      proposta_id: string;
      lista_id: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("campanha_propostas")
        .insert({
          campanha_id: input.campanha_id,
          proposta_id: input.proposta_id,
          lista_id: input.lista_id,
          created_by: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Dispara edge function (best-effort)
      supabase.functions
        .invoke("trafego-pago-auto-dispatch", {
          body: { campanha_proposta_id: data.id },
        })
        .catch((e) => console.warn("auto-dispatch falhou:", e));

      return data;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["campanha-propostas", data.campanha_id] });
      await qc.refetchQueries({ queryKey: ["campanha-propostas", data.campanha_id] });
      toast.success("Proposta vinculada à campanha");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useEncerrarCampanhaProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("campanha_propostas")
        .update({
          status: "encerrada",
          encerrada_em: new Date().toISOString(),
          encerrada_por: userData.user?.id,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-propostas"] });
      toast.success("Campanha encerrada");
    },
    onError: (e: any) => toast.error("Erro ao encerrar: " + e.message),
  });
}

export function useDesvincularProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campanha_propostas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-propostas"] });
      toast.success("Vínculo removido");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}
