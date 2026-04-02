import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useLicitacoesRealtime() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<number | null>(null);
  const pendingInvalidateRef = useRef({ licitacoes: false, atividades: new Set<string>(), anexos: new Set<string>() });

  useEffect(() => {
    console.log('[realtime] Subscribing to licitacoes changes...');

    const flushInvalidations = () => {
      const pending = pendingInvalidateRef.current;

      if (pending.licitacoes) {
        queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
        queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
        pending.licitacoes = false;
      }

      for (const licId of pending.atividades) {
        queryClient.invalidateQueries({ queryKey: ['licitacoes-atividades', licId] });
      }
      pending.atividades.clear();

      for (const licId of pending.anexos) {
        queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-tabela', licId] });
        queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-bucket', licId] });
      }
      pending.anexos.clear();
    };

    const scheduleFlush = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        flushInvalidations();
        debounceRef.current = null;
      }, 750);
    };
    
    const channel = supabase
      .channel('licitacoes-realtime-data')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'licitacoes',
        },
        (payload) => {
          console.log('[realtime] Licitação atualizada:', payload.eventType, payload);

          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;

          // Ignorar quando a licitação já estava e continua descartada
          const ambosDescartado = newStatus === 'descartado' && oldStatus === 'descartado';

          if (!ambosDescartado) {
            // Debounce: evitar invalidar (e refazer queries pesadas) em rajadas
            pendingInvalidateRef.current.licitacoes = true;
          } else {
            console.log('[realtime] Ignorando evento de licitação descartada (sem mudança de status)');
          }

          // Se for uma atualização específica, atualizar também as atividades
          if (payload.new && (payload.new as any).id) {
            pendingInvalidateRef.current.atividades.add(String((payload.new as any).id));
          }
          scheduleFlush();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'licitacoes_atividades',
        },
        (payload) => {
          console.log('[realtime] Atividade atualizada:', payload.eventType, payload);

          // Atualizar atividades (debounce)
          if (payload.new && (payload.new as any).licitacao_id) {
            pendingInvalidateRef.current.atividades.add(String((payload.new as any).licitacao_id));
            scheduleFlush();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'licitacoes_anexos',
        },
        (payload) => {
          console.log('[realtime] Anexo atualizado:', payload.eventType, payload);

          // Atualizar anexos (debounce)
          const licitacaoId = (payload.new as any)?.licitacao_id || (payload.old as any)?.licitacao_id;
          if (licitacaoId) {
            pendingInvalidateRef.current.anexos.add(String(licitacaoId));
            scheduleFlush();
          }
        }
      )
      .subscribe((status) => {
        console.log('[realtime] Subscription status:', status);
      });

    return () => {
      console.log('[realtime] Unsubscribing from licitacoes changes');
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
