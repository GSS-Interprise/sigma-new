import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DemandaAtrasadaLite {
  id: string;
  titulo: string;
  data_limite: string;
  urgencia: string | null;
  responsavel_id: string | null;
  created_by: string | null;
}

/**
 * Lista demandas atrasadas (data_limite < hoje, status != concluida) em que
 * o usuário está envolvido (criador, responsável, mencionado ou finalizador).
 * Refetch a cada 40 minutos para alimentar o modal de alerta agressivo.
 */
export function useDemandasAtrasadas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["demandas", "atrasadas-do-usuario", user?.id],
    enabled: !!user?.id,
    refetchInterval: 40 * 60 * 1000, // 40 min
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DemandaAtrasadaLite[]> => {
      const uid = user!.id;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const hojeStr = hoje.toISOString().slice(0, 10);

      // IDs de tarefas em que sou mencionado ou finalizador
      const [mencRes, finRes] = await Promise.all([
        supabase.from("worklist_tarefa_mencionados").select("tarefa_id").eq("user_id", uid),
        supabase.from("worklist_tarefa_finalizadores").select("tarefa_id").eq("user_id", uid),
      ]);
      const extraIds = Array.from(
        new Set([
          ...(mencRes.data ?? []).map((m: any) => m.tarefa_id),
          ...(finRes.data ?? []).map((m: any) => m.tarefa_id),
        ]),
      );

      // Tarefas onde sou criador OU responsável OU extraIds
      const orParts = [`created_by.eq.${uid}`, `responsavel_id.eq.${uid}`];
      if (extraIds.length) orParts.push(`id.in.(${extraIds.join(",")})`);

      const { data, error } = await supabase
        .from("worklist_tarefas")
        .select("id, titulo, data_limite, urgencia, responsavel_id, created_by, status, modulo")
        .eq("modulo", "demandas")
        .neq("status", "concluida")
        .is("deleted_at", null)
        .not("data_limite", "is", null)
        .lt("data_limite", hojeStr)
        .or(orParts.join(","));

      if (error) throw error;
      return (data ?? []) as DemandaAtrasadaLite[];
    },
  });
}