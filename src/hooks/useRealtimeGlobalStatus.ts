import { useEffect, useState } from 'react';
import {
  GlobalRealtimeStatus,
  getGlobalStatus,
  subscribeStatus,
} from '@/lib/realtimeStatusStore';

/**
 * Hook que retorna o status agregado de TODOS os channels realtime ativos.
 * Usado pelo RealtimeStatusBadge no header do SigZap.
 */
export function useRealtimeGlobalStatus(): GlobalRealtimeStatus {
  const [status, setStatus] = useState<GlobalRealtimeStatus>(getGlobalStatus);

  useEffect(() => {
    return subscribeStatus(() => {
      setStatus(getGlobalStatus());
    });
  }, []);

  return status;
}
