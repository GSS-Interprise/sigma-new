import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Retorna Set de conversation_ids fixadas (pinned) pelo usuário atual.
 * RLS garante que cada user só lê seus próprios pins.
 *
 * Usado em SigZapConversasColumn e SigZapMinhasConversasColumn pra:
 * - Mostrar ícone visual de pin no card
 * - Reordenar conversas fixadas pro topo
 */
export function useSigzapPinnedConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['sigzap-pinned', user?.id],
    queryFn: async (): Promise<Set<string>> => {
      if (!user?.id) return new Set();

      const { data, error } = await supabase
        .from('sigzap_pinned_conversations' as any)
        .select('conversation_id');

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[sigzap-pinned] erro ao carregar pins:', error);
        return new Set();
      }

      return new Set((data ?? []).map((r: any) => r.conversation_id as string));
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}
