import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Especialidade {
  id: string;
  nome: string;
  ativo: boolean;
}

export function useEspecialidades() {
  return useQuery({
    queryKey: ["especialidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("especialidades")
        .select("id, nome, ativo")
        .eq("ativo", true)
        .order("nome");
      
      if (error) throw error;
      return data as Especialidade[];
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });
}

// Hook legado que retorna apenas nomes (retrocompatibilidade)
export function useEspecialidadesNomes() {
  const { data, ...rest } = useEspecialidades();
  return {
    data: data?.map(e => e.nome) || [],
    ...rest,
  };
}
