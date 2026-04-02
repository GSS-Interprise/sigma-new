import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KanbanColumn {
  id: string;
  label: string;
  cor?: string;
}

export const useKanbanColumns = (modulo: string) => {
  return useQuery({
    queryKey: ['kanban-columns', modulo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_status_config')
        .select('*')
        .eq('modulo', modulo)
        .eq('ativo', true)
        .order('ordem');
      
      if (error) throw error;
      
      return data.map(c => ({
        id: c.status_id,
        label: c.label,
        cor: c.cor
      })) as KanbanColumn[];
    }
  });
};
