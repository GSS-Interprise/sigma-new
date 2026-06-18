import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LicitacaoItem {
  id: string;
  licitacao_id: string;
  lote: string | null;
  numero_item: string | null;
  descricao: string | null;
  nome: string | null;
  tipo: string | null;
  unidade_medida: string | null;
  qnt_unit_total: number | null;
  qnt_valor_und: number | null;
  vlr_total_estimavel: number | null;
  vlr_und_deliberado: number | null;
  quantidade: number | null;
  valor_referencia: number | null;
  origem_extracao: "manual" | "ia" | "importacao_ata";
  created_at?: string;
  updated_at?: string;
}

export const useLicitacaoItens = (licitacaoId: string | undefined) => {
  const queryClient = useQueryClient();
  const queryKey = ["licitacao-itens", licitacaoId];

  const query = useQuery({
    queryKey,
    enabled: !!licitacaoId,
    queryFn: async (): Promise<LicitacaoItem[]> => {
      const { data, error } = await supabase
        .from("licitacao_itens")
        .select("*")
        .eq("licitacao_id", licitacaoId as string)
        .order("lote", { ascending: true, nullsFirst: true })
        .order("numero_item", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as LicitacaoItem[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: async (payload: Partial<LicitacaoItem>) => {
      const { data, error } = await supabase
        .from("licitacao_itens")
        .insert({
          licitacao_id: licitacaoId,
          lote: payload.lote ?? null,
          numero_item: payload.numero_item ?? null,
          descricao: payload.descricao ?? null,
          unidade_medida: payload.unidade_medida ?? null,
          qnt_unit_total: payload.qnt_unit_total ?? null,
          qnt_valor_und: payload.qnt_valor_und ?? null,
          vlr_und_deliberado: payload.vlr_und_deliberado ?? null,
          origem_extracao: "manual",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(`Erro ao criar item: ${e.message}`),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LicitacaoItem> }) => {
      const { error } = await supabase
        .from("licitacao_itens")
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("licitacao_itens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Item removido");
    },
    onError: (e: any) => toast.error(`Erro ao remover: ${e.message}`),
  });

  return { ...query, create, update, remove };
};