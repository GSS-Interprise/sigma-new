import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * A pessoa logada vê o robô do Sigma? Lista nominal em assistente_liberados (Configurações › Agente do Sigma), não
 * papel. Na dúvida (carregando ou erro) o robô não aparece; a edge sigma-assistente recusa (403) quem não está na lista.
 */
export function useAssistenteLiberado(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["assistente-liberado", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos tipos gerados
      const { data, error } = await (supabase as any).rpc("assistente_liberado");
      if (error) return false;
      return data === true;
    },
  });
  return data === true;
}
