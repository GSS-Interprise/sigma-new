import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna mapa lead_id → array de {campanha_id, campanha_nome} das campanhas
 * ATIVAS em que o lead está. Usado pelo AcompanhamentoCard pra mostrar
 * badge "🏷 N campanhas" quando lead está em múltiplas.
 *
 * Sub-task F2.7 do sprint plan.
 */
export function useLeadsCrossCampanha(leadIds: string[]) {
  return useQuery({
    queryKey: ["leads-cross-campanha", leadIds.slice().sort().join(",")],
    queryFn: async (): Promise<Map<string, Array<{ id: string; nome: string }>>> => {
      const map = new Map<string, Array<{ id: string; nome: string }>>();
      if (leadIds.length === 0) return map;

      const { data, error } = await supabase
        .from("campanha_leads")
        .select("lead_id, campanha:campanhas!inner(id, nome, status)")
        .in("lead_id", leadIds)
        .in("campanha.status", ["ativa", "pausada"]);

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[useLeadsCrossCampanha] error:", error);
        return map;
      }

      for (const row of data ?? []) {
        const leadId = (row as any).lead_id as string;
        const campanha = (row as any).campanha as { id: string; nome: string } | null;
        if (!campanha) continue;
        const arr = map.get(leadId) ?? [];
        // evita duplicar se mesma campanha aparecer 2x (lead em multiplas propostas/listas)
        if (!arr.find((c) => c.id === campanha.id)) {
          arr.push({ id: campanha.id, nome: campanha.nome });
        }
        map.set(leadId, arr);
      }
      return map;
    },
    enabled: leadIds.length > 0,
    staleTime: 60_000,
  });
}
