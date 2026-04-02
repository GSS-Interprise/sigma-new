import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useLicitacoesRealtimeAccess() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHasAccess(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        // 1. Verificar se é admin
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (cancelled) return;

        const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
        if (isAdmin) {
          setHasAccess(true);
          setIsLoading(false);
          return;
        }

        // 2. Verificar flag realtime_licitacoes
        const { data: perms } = await supabase
          .from("captacao_permissoes_usuario")
          .select("realtime_licitacoes")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        setHasAccess(perms?.realtime_licitacoes === true);
      } catch (err) {
        console.error("[realtime-access] Erro ao verificar permissão:", err);
        if (!cancelled) setHasAccess(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { hasAccess, isLoading };
}
