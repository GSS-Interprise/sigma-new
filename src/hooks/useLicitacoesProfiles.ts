import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LicitacaoProfile {
  id: string;
  nome_completo: string;
}

// Quem pode ser responsável por um card, por quadro. A Bianca pediu (WhatsApp 15/10) para o quadro da
// GSS mostrar o time de contratos e de licitação (entra a Denise, licitadora) e não o time da AGES
// (Douglas e Sarah). O quadro da AGES continua com o time dele. "todas" é para o quadro e os filtros,
// que precisam reconhecer o nome de qualquer responsável já gravado num card.
const PAPEIS: Record<"GSS" | "AGES" | "todas", string[]> = {
  GSS: ["gestor_contratos", "licitador", "lider_licitacao"],
  AGES: ["gestor_ages"],
  todas: ["gestor_contratos", "licitador", "lider_licitacao", "gestor_ages"],
};

/** Usuários ativos que podem ser responsáveis por um card de licitação no quadro informado. */
export function useLicitacoesProfiles(empresa: "GSS" | "AGES" | "todas" = "todas") {
  return useQuery({
    queryKey: ["profiles-licitacoes-by-roles", empresa],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", PAPEIS[empresa] as any);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [] as LicitacaoProfile[];

      const userIds = [...new Set(roles.map((r) => r.user_id))];

      let q = supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("id", userIds)
        .order("nome_completo");
      // no "todas" entra quem saiu, para o nome antigo continuar aparecendo nos cards
      if (empresa !== "todas") q = q.eq("status", "ativo");
      const { data, error } = await q;

      if (error) throw error;
      return data as LicitacaoProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
