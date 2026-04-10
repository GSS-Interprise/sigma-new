import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to fetch unread count for the histórico tab badge
 */
export function useLeadHistoricoUnreadCount(leadId: string | undefined) {
  const { user } = useAuth();

  // Fetch all entry IDs the current user has viewed
  const { data: viewedEntryIds = [] } = useQuery({
    queryKey: ['lead-historico-viewed', leadId, user?.id],
    queryFn: async () => {
      if (!leadId || !user?.id) return [];
      const { data, error } = await supabase
        .from('lead_historico_visualizacoes' as any)
        .select('entry_id, entry_source')
        .eq('lead_id', leadId)
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map((d: any) => `${d.entry_source}-${d.entry_id}`);
    },
    enabled: !!leadId && !!user?.id,
  });

  // Fetch total entry count from lead_historico for this lead
  const { data: totalHistoricoCount = 0 } = useQuery({
    queryKey: ['lead-historico-total-count', leadId],
    queryFn: async () => {
      if (!leadId) return 0;
      // Count from lead_historico
      const { count: histCount } = await supabase
        .from('lead_historico' as any)
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId);
      
      // Count from lead_anotacoes
      const { count: anotCount } = await supabase
        .from('lead_anotacoes')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId);

      return (histCount || 0) + (anotCount || 0);
    },
    enabled: !!leadId,
  });

  const unreadCount = Math.max(0, totalHistoricoCount - viewedEntryIds.length);

  return { unreadCount, viewedEntryIds };
}
