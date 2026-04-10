import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LicitacaoProfile {
  id: string;
  nome_completo: string;
}

/**
 * Hook para buscar usuários com roles gestor_ages e/ou gestor_contratos.
 * Usado para popular o campo de responsável no módulo de licitações.
 */
export function useLicitacoesProfiles() {
  return useQuery({
    queryKey: ["profiles-licitacoes-by-roles"],
    queryFn: async () => {
      // 1) Buscar user_ids com as roles relevantes
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["gestor_ages", "gestor_contratos"]);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [] as LicitacaoProfile[];

      const userIds = [...new Set(roles.map((r) => r.user_id))];

      // 2) Buscar profiles correspondentes
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("id", userIds)
        .order("nome_completo");

      if (error) throw error;
      return data as LicitacaoProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
