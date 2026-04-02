import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useModulosManutencao() {
  const queryClient = useQueryClient();

  const { data: modulosInativos = [], isLoading } = useQuery({
    queryKey: ["modulos-manutencao"],
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modulos_manutencao")
        .select("*");
      if (error) throw error;
      return (data || []).map((r: any) => r.modulo_key as string);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, active }: { key: string; active: boolean }) => {
      if (active) {
        // desativar = inserir na tabela
        const { error } = await supabase
          .from("modulos_manutencao")
          .insert({ modulo_key: key });
        if (error) throw error;
      } else {
        // reativar = remover da tabela
        const { error } = await supabase
          .from("modulos_manutencao")
          .delete()
          .eq("modulo_key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modulos-manutencao"] });
    },
  });

  const isEmManutencao = (key: string) => modulosInativos.includes(key);

  return { modulosInativos, isLoading, toggleMutation, isEmManutencao };
}
