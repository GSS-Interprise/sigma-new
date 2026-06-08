import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mapa chip_id → nome da campanha ATIVA que já usa esse chip (exclui a campanha passada).
 * Suporta o pedido da Bruna (08/06): um chip não pode ir em 2 campanhas ao mesmo tempo —
 * o teto anti-ban de 35/dia é POR CHIP (somado entre campanhas), então compartilhar
 * divide o cap. A trava no seletor evita o overlap silencioso.
 */
export function useChipsEmUso(excetoCampanhaId?: string | null) {
  return useQuery({
    queryKey: ["chips-em-uso", excetoCampanhaId ?? "novo"],
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data } = await (supabase as any)
        .from("campanhas")
        .select("id, nome, chip_ids")
        .eq("status", "ativa");
      const map = new Map<string, string>();
      (data ?? []).forEach((c: any) => {
        if (c.id === excetoCampanhaId) return;
        (c.chip_ids ?? []).forEach((id: string) => {
          if (!map.has(id)) map.set(id, (c.nome || "").trim());
        });
      });
      return map;
    },
  });
}
