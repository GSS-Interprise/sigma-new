import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface UseLicitacaoRealtimeSyncOptions {
  /** Função para sincronizar o updated_at local após detectar mudança própria */
  onSelfUpdate?: (newUpdatedAt: string) => void;
  /** Função para recarregar dados quando outro usuário altera */
  onExternalUpdate?: (newData: any) => void;
}

/**
 * Hook que escuta mudanças em tempo real de UMA licitação específica.
 * - Se detectar que EU salvei → sincroniza updated_at automaticamente
 * - Se detectar que OUTRO usuário alterou → mostra toast com opção de atualizar
 */
export function useLicitacaoRealtimeSync(
  licitacaoId: string | null,
  enabled: boolean,
  options: UseLicitacaoRealtimeSyncOptions = {}
) {
  const { onSelfUpdate, onExternalUpdate } = options;
  const queryClient = useQueryClient();
  
  // Track último updated_at que EU salvei (para distinguir de alterações externas)
  const lastSavedByMeRef = useRef<string | null>(null);
  const [hasExternalChange, setHasExternalChange] = useState(false);
  const [externalData, setExternalData] = useState<any>(null);

  // Função para marcar que EU fiz um save (chamar após salvar)
  const markAsSavedByMe = useCallback((updatedAt: string) => {
    lastSavedByMeRef.current = updatedAt;
  }, []);

  // Função para buscar dados atualizados e aplicar
  const refreshData = useCallback(async () => {
    if (!licitacaoId) return;
    
    const { data, error } = await supabase
      .from('licitacoes')
      .select('*')
      .eq('id', licitacaoId)
      .single();
    
    if (error) {
      console.error('[RealtimeSync] Erro ao buscar dados:', error);
      return;
    }
    
    setHasExternalChange(false);
    setExternalData(null);
    onExternalUpdate?.(data);
    queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
    queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
    toast.success('Dados atualizados!');
  }, [licitacaoId, onExternalUpdate, queryClient]);

  // Dismiss external change warning
  const dismissExternalChange = useCallback(() => {
    setHasExternalChange(false);
    setExternalData(null);
  }, []);

  useEffect(() => {
    if (!licitacaoId || !enabled) return;

    console.log('[RealtimeSync] Subscribing to licitacao:', licitacaoId);

    const channel = supabase
      .channel(`licitacao-sync-${licitacaoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'licitacoes',
          filter: `id=eq.${licitacaoId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          const newUpdatedAt = newData?.updated_at;
          
          console.log('[RealtimeSync] Received update:', { 
            newUpdatedAt, 
            lastSavedByMe: lastSavedByMeRef.current 
          });

          // Se o updated_at é o mesmo que EU acabei de salvar → sincronização automática
          if (lastSavedByMeRef.current && newUpdatedAt === lastSavedByMeRef.current) {
            console.log('[RealtimeSync] Self-update detected, syncing...');
            onSelfUpdate?.(newUpdatedAt);
            // Limpar ref após sincronizar
            lastSavedByMeRef.current = null;
            return;
          }

          // Se eu não tenho registro de save recente, pode ser que outro usuário alterou
          // OU pode ser meu próprio save que chegou com timestamp ligeiramente diferente
          // Vamos verificar se temos um save pendente (dentro de 2 segundos)
          if (lastSavedByMeRef.current) {
            const myTime = new Date(lastSavedByMeRef.current).getTime();
            const serverTime = new Date(newUpdatedAt).getTime();
            const diff = Math.abs(serverTime - myTime);
            
            // Se a diferença for menor que 2 segundos, provavelmente é meu save
            if (diff < 2000) {
              console.log('[RealtimeSync] Likely self-update (time diff:', diff, 'ms), syncing...');
              onSelfUpdate?.(newUpdatedAt);
              lastSavedByMeRef.current = null;
              return;
            }
          }

          // Outro usuário alterou - mostrar aviso não-bloqueante
          console.log('[RealtimeSync] External update detected!');
          setHasExternalChange(true);
          setExternalData(newData);
          
          toast.info(
            'Esta licitação foi atualizada por outro usuário.',
            {
              duration: 10000,
              action: {
                label: 'Atualizar dados',
                onClick: () => refreshData(),
              },
            }
          );
        }
      )
      .subscribe((status) => {
        console.log('[RealtimeSync] Subscription status:', status);
      });

    return () => {
      console.log('[RealtimeSync] Unsubscribing from licitacao:', licitacaoId);
      supabase.removeChannel(channel);
    };
  }, [licitacaoId, enabled, onSelfUpdate, refreshData]);

  return {
    /** Marcar que EU fiz um save (chamar imediatamente após salvar) */
    markAsSavedByMe,
    /** Se há mudança externa pendente */
    hasExternalChange,
    /** Dados da mudança externa */
    externalData,
    /** Função para atualizar dados manualmente */
    refreshData,
    /** Dispensar aviso de mudança externa */
    dismissExternalChange,
  };
}
