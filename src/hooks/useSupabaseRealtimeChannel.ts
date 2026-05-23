import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Status do canal realtime do Supabase. Espelha REALTIME_SUBSCRIBE_STATES.
 * SUBSCRIBED = canal vivo e recebendo eventos.
 * CHANNEL_ERROR | TIMED_OUT | CLOSED = canal morto, sem evento.
 */
export type RealtimeChannelStatus =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

interface Options {
  /** Nome único do canal. Usado pra logs. Ex: 'sigzap-messages-${id}' */
  channelName: string;
  /** Tabela do banco a escutar. */
  table: string;
  /** Tipo de evento. Default '*' (todos). */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  /** Filtro PostgREST. Ex: `conversation_id=eq.${id}`. Opcional. */
  filter?: string;
  /** Schema. Default 'public'. */
  schema?: string;
  /** Callback chamado quando vem evento. */
  onChange: (payload: unknown) => void;
  /** Se false, não inscreve (útil pra esperar id existir). Default true. */
  enabled?: boolean;
}

/**
 * Hook pra subscription realtime do Supabase COM retry exponencial e
 * observabilidade. Substitui o pattern `.subscribe()` puro que engolia
 * erros silenciosos (causa raiz do bug 15/05 do SigZap incoming).
 *
 * Comportamento:
 * - SUBSCRIBED → log info, retry count zera, status='SUBSCRIBED'
 * - CHANNEL_ERROR/TIMED_OUT/CLOSED → log error, status do erro,
 *   agenda retry com backoff 1s,2s,4s,8s,16s,30s (cap)
 * - cleanup: cancela retry pendente e remove channel
 *
 * Uso:
 *   const { status } = useSupabaseRealtimeChannel({
 *     channelName: `sigzap-messages-${conversaId}`,
 *     table: 'sigzap_messages',
 *     event: 'INSERT',
 *     filter: `conversation_id=eq.${conversaId}`,
 *     enabled: !!conversaId,
 *     onChange: () => queryClient.invalidateQueries({ queryKey: ['...'] }),
 *   });
 */
export function useSupabaseRealtimeChannel(options: Options): {
  status: RealtimeChannelStatus;
} {
  const [status, setStatus] = useState<RealtimeChannelStatus>('CONNECTING');
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onChange estável via ref pra não re-disparar useEffect quando consumidor
  // não memoiza o callback (caso comum)
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const {
    channelName,
    table,
    event = '*',
    filter,
    schema = 'public',
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) {
      setStatus('CLOSED');
      return;
    }

    setStatus('CONNECTING');

    const channel = supabase
      .channel(channelName)
      .on(
        // @ts-expect-error — tipos do Supabase exigem narrowing dinâmico complexo aqui
        'postgres_changes',
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload: unknown) => {
          onChangeRef.current(payload);
        }
      )
      .subscribe((newStatus, err) => {
        const s = newStatus as RealtimeChannelStatus;
        setStatus(s);

        if (s === 'SUBSCRIBED') {
          // eslint-disable-next-line no-console
          console.log(`[realtime:${channelName}] ✓ connected`);
          retryCountRef.current = 0;
        } else if (
          s === 'CHANNEL_ERROR' ||
          s === 'TIMED_OUT' ||
          s === 'CLOSED'
        ) {
          // eslint-disable-next-line no-console
          console.error(`[realtime:${channelName}] ✗ ${s}`, err);

          // Backoff exponencial com cap em 30s
          const delay = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            30000
          );
          retryCountRef.current += 1;
          // eslint-disable-next-line no-console
          console.log(
            `[realtime:${channelName}] retry em ${delay}ms (tentativa ${retryCountRef.current})`
          );

          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            setRetryTrigger((n) => n + 1);
          }, delay);
        }
      });

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // retryTrigger nas deps força re-subscribe após backoff
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, event, filter, schema, enabled, retryTrigger]);

  return { status };
}
