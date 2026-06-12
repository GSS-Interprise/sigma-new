import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conecta no canal global "online-users" via Supabase Realtime Presence.
 * Retorna um Set com os user_ids atualmente online.
 */
export function useOnlinePresence(currentUserId?: string | null) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnline(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return online;
}
