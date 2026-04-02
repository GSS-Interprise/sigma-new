import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface LockInfo {
  user_id: string;
  user_name: string;
  started_at: string;
  expires_at: string;
}

interface UseLicitacaoEditLockResult {
  hasLock: boolean;
  lockedBy: LockInfo | null;
  isLoading: boolean;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  renewLock: () => Promise<void>;
}

const LOCK_DURATION_MINUTES = 5;
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 segundos

export function useLicitacaoEditLock(
  licitacaoId: string | null,
  enabled: boolean = true
): UseLicitacaoEditLockResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [hasLock, setHasLock] = useState(false);
  const [lockedBy, setLockedBy] = useState<LockInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockAcquiredRef = useRef(false);

  // Buscar nome do usuário
  const { data: userProfile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const userName = userProfile?.nome_completo || user?.email || "Usuário";

  // Função para adquirir/renovar lock
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (!licitacaoId || !user?.id) return false;

    try {
      const { data, error } = await supabase.rpc("try_acquire_licitacao_lock", {
        p_licitacao_id: licitacaoId,
        p_user_id: user.id,
        p_user_name: userName,
        p_lock_duration_minutes: LOCK_DURATION_MINUTES,
      });

      if (error) {
        console.error("[Lock] Erro ao adquirir lock:", error);
        return false;
      }

      const result = data as unknown as { success: boolean; has_lock: boolean; locked_by: LockInfo | null };

      if (result.has_lock) {
        setHasLock(true);
        setLockedBy(null);
        lockAcquiredRef.current = true;
        return true;
      } else {
        setHasLock(false);
        setLockedBy(result.locked_by);
        lockAcquiredRef.current = false;
        return false;
      }
    } catch (err) {
      console.error("[Lock] Exceção ao adquirir lock:", err);
      return false;
    }
  }, [licitacaoId, user?.id, userName]);

  // Função para liberar lock
  const releaseLock = useCallback(async (): Promise<void> => {
    if (!licitacaoId || !lockAcquiredRef.current) return;

    try {
      await supabase.rpc("release_licitacao_lock", {
        p_licitacao_id: licitacaoId,
      });
      lockAcquiredRef.current = false;
      setHasLock(false);
    } catch (err) {
      console.error("[Lock] Erro ao liberar lock:", err);
    }
  }, [licitacaoId]);

  // Função para renovar lock (heartbeat)
  const renewLock = useCallback(async (): Promise<void> => {
    if (!licitacaoId || !user?.id || !lockAcquiredRef.current) return;

    try {
      await supabase.rpc("try_acquire_licitacao_lock", {
        p_licitacao_id: licitacaoId,
        p_user_id: user.id,
        p_user_name: userName,
        p_lock_duration_minutes: LOCK_DURATION_MINUTES,
      });
    } catch (err) {
      console.error("[Lock] Erro ao renovar lock:", err);
    }
  }, [licitacaoId, user?.id, userName]);

  // Efeito para tentar adquirir lock ao abrir
  useEffect(() => {
    if (!enabled || !licitacaoId || !user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const tryAcquire = async () => {
      await acquireLock();
      setIsLoading(false);
    };

    tryAcquire();

    // Cleanup: liberar lock ao desmontar
    return () => {
      if (lockAcquiredRef.current) {
        // Usar sendBeacon para garantir que o lock seja liberado mesmo se a aba fechar
        const releaseAsync = async () => {
          try {
            await supabase.rpc("release_licitacao_lock", {
              p_licitacao_id: licitacaoId,
            });
          } catch {
            // ignore
          }
        };
        releaseAsync();
      }
    };
  }, [enabled, licitacaoId, user?.id, acquireLock]);

  // Heartbeat para manter lock ativo
  useEffect(() => {
    if (!hasLock || !enabled) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    heartbeatRef.current = setInterval(() => {
      renewLock();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [hasLock, enabled, renewLock]);

  // Escutar mudanças em tempo real nos locks
  useEffect(() => {
    if (!licitacaoId || !enabled) return;

    const channel = supabase
      .channel(`lock-${licitacaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "licitacoes_edit_locks",
          filter: `licitacao_id=eq.${licitacaoId}`,
        },
        async (payload) => {
          // Se o lock foi deletado e não somos nós, tentar adquirir
          if (payload.eventType === "DELETE" && !hasLock) {
            await acquireLock();
          }
          // Se foi inserido/atualizado por outro usuário, atualizar estado
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newRecord = payload.new as any;
            if (newRecord.user_id !== user?.id) {
              setHasLock(false);
              setLockedBy({
                user_id: newRecord.user_id,
                user_name: newRecord.user_name,
                started_at: newRecord.started_at,
                expires_at: newRecord.expires_at,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [licitacaoId, enabled, hasLock, user?.id, acquireLock]);

  // Liberar lock quando a aba perde foco por muito tempo ou fecha
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && lockAcquiredRef.current) {
        // Renovar lock ao sair (para manter por mais 5 min caso volte)
        renewLock();
      }
    };

    const handleBeforeUnload = () => {
      if (lockAcquiredRef.current && licitacaoId) {
        // Tentar liberar via fetch síncrono (keepalive)
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/release_licitacao_lock`;
        navigator.sendBeacon(
          url,
          JSON.stringify({ p_licitacao_id: licitacaoId })
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [licitacaoId, renewLock]);

  return {
    hasLock,
    lockedBy,
    isLoading,
    acquireLock,
    releaseLock,
    renewLock,
  };
}
