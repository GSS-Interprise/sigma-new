import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCampanhaListas(campanhaId?: string) {
  return useQuery({
    queryKey: ["campanha-listas", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_listas")
        .select("*, lista:lista_id(id, nome, total_estimado)")
        .eq("campanha_id", campanhaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const ids = Array.from(new Set(rows.map((r: any) => r.lista_id).filter(Boolean))) as string[];
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: itens } = await supabase
          .from("disparo_lista_itens")
          .select("lista_id")
          .in("lista_id", ids);
        for (const it of itens || []) counts.set(it.lista_id, (counts.get(it.lista_id) || 0) + 1);
      }
      return rows.map((r: any) => ({ ...r, lista_leads_count: counts.get(r.lista_id) || 0 }));
    },
  });
}

export function useAdicionarListaCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campanha_id: string; lista_id: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("campanha_listas")
        .insert({ campanha_id: input.campanha_id, lista_id: input.lista_id, created_by: u.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["campanha-listas", data.campanha_id] });
      toast.success("Lista adicionada à campanha");
    },
    onError: (e: any) => {
      if (String(e.message || "").includes("duplicate")) toast.error("Esta lista já está na campanha");
      else toast.error("Erro: " + e.message);
    },
  });
}

export function useVincularListaProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campanha_proposta_id: string; lista_id: string; campanha_id: string }) => {
      const { error } = await supabase
        .from("campanha_propostas")
        .update({ lista_id: input.lista_id })
        .eq("id", input.campanha_proposta_id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ["campanha-propostas", input.campanha_id] });
      qc.invalidateQueries({ queryKey: ["campanha-proposta", input.campanha_proposta_id] });
      qc.invalidateQueries({ queryKey: ["campanha-proposta-detail", input.campanha_proposta_id] });
      qc.invalidateQueries({ queryKey: ["campanha-proposta-leads-stats"] });
      qc.refetchQueries({ queryKey: ["campanha-proposta-detail", input.campanha_proposta_id] });
      toast.success("Lista vinculada à proposta");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useRemoverListaCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campanha_listas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanha-listas"] });
      toast.success("Lista removida");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}
