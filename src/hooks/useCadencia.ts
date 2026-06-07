import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskTipo {
  codigo: string;
  label: string;
  icone: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export interface CadenciaPasso {
  ordem: number;
  canal: string;
  rotulo: string;
  dia_offset: number;
}

export interface CadenciaTemplate {
  id: string;
  nome: string;
  descricao: string | null;
  is_default: boolean;
  ativo: boolean;
  passos: CadenciaPasso[];
}

/** Canais de tarefa gerenciáveis (task_tipos). Cacheado — muda raramente. */
export function useTaskTipos() {
  return useQuery({
    queryKey: ["task-tipos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TaskTipo[]> => {
      const { data, error } = await (supabase as any)
        .from("task_tipos")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data as TaskTipo[]) ?? [];
    },
  });
}

/**
 * Templates de cadência de TAREFAS manuais (tarefa_cadencia_templates).
 * Distinto de `cadencia_templates`, que é a cadência de MENSAGENS automáticas.
 */
export function useCadenciaTemplates() {
  return useQuery({
    queryKey: ["tarefa-cadencia-templates"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CadenciaTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from("tarefa_cadencia_templates")
        .select("*")
        .eq("ativo", true)
        .order("is_default", { ascending: false })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data as CadenciaTemplate[]) ?? [];
    },
  });
}

/** Salva a cadência de tarefas ajustada como um novo template reutilizável. */
export function useCriarCadenciaTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; descricao?: string; passos: CadenciaPasso[] }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("tarefa_cadencia_templates")
        .insert({
          nome: input.nome,
          descricao: input.descricao ?? null,
          passos: input.passos,
          created_by: user.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CadenciaTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefa-cadencia-templates"] }),
  });
}
