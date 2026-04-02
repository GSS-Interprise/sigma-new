import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUserSetor() {
  const { user } = useAuth();

  const { data: userSetor, isLoading } = useQuery({
    queryKey: ['user-setor', user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('setor_id, setores(id, nome)')
        .eq('id', user!.id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const setorNome = userSetor?.setores?.nome?.toLowerCase() || '';
  const isSetorAges = setorNome.includes('ages');
  
  return {
    setorId: userSetor?.setor_id,
    setorNome: userSetor?.setores?.nome,
    isSetorAges,
    isLoading,
  };
}
