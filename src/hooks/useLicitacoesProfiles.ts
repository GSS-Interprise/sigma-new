import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// IDs dos setores que administram Licitações
const SETOR_LICITACOES_ID = "ee54a8a5-47b1-4059-881a-381b9f5b82f1";
const SETOR_AGES_ID = "20334815-29d0-4aaf-bda6-f09edc2aed75";

export interface LicitacaoProfile {
  id: string;
  nome_completo: string;
}

/**
 * Hook para buscar usuários dos setores que administram Licitações (Licitações + AGES)
 * Usado para popular o campo de responsável no módulo de licitações
 */
export function useLicitacoesProfiles() {
  return useQuery({
    queryKey: ["profiles-licitacoes-ages-setores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("setor_id", [SETOR_LICITACOES_ID, SETOR_AGES_ID])
        .order("nome_completo");

      if (error) throw error;
      return data as LicitacaoProfile[];
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });
}
