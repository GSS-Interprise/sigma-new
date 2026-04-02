import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MonitorCaptadoresListProps {
  selectedCaptadorId: string | null;
  onSelectCaptador: (id: string | null) => void;
}

export function MonitorCaptadoresList({ selectedCaptadorId, onSelectCaptador }: MonitorCaptadoresListProps) {
  // Fetch all captadores (users with captacao permissions) with their profile
  const { data: captadores, isLoading } = useQuery({
    queryKey: ["monitor-captadores"],
    queryFn: async () => {
      // 1. Get all captacao permissions
      const { data: perms, error: permsError } = await supabase
        .from("captacao_permissoes_usuario")
        .select("user_id, cor");

      if (permsError) throw permsError;
      if (!perms || perms.length === 0) return [];

      // 2. Get profiles for those user_ids
      const userIds = perms.map((p) => p.user_id);
      const { data: profiles, error: profError } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("id", userIds);

      if (profError) throw profError;

      const profileMap = new Map((profiles || []).map((p) => [p.id, p.nome_completo]));

      // 3. Merge and sort
      return perms
        .map((p) => ({
          user_id: p.user_id,
          cor: p.cor,
          nome_completo: profileMap.get(p.user_id) || "Sem nome",
        }))
        .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
    },
  });

  // Fetch conversation counts per assigned user (last 30 days)
  const { data: convCounts } = useQuery({
    queryKey: ["monitor-conv-counts"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("sigzap_conversations")
        .select("assigned_user_id")
        .neq("status", "inactive")
        .not("assigned_user_id", "is", null)
        .gte("last_message_at", thirtyDaysAgo.toISOString());

      if (error) throw error;
      const map: Record<string, number> = {};
      data?.forEach((c) => {
        const uid = c.assigned_user_id!;
        map[uid] = (map[uid] || 0) + 1;
      });
      return map;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="flex flex-col h-full border-r overflow-hidden">
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Captadores</h3>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {captadores?.map((cap) => {
              const nome = cap.nome_completo || "Sem nome";
              const parts = nome.split(" ").filter((p: string) => p.length > 0);
              const initials = parts.length >= 2
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : nome.trim().slice(0, 2).toUpperCase();
              const count = convCounts?.[cap.user_id] || 0;
              const isSelected = selectedCaptadorId === cap.user_id;

              return (
                <button
                  key={cap.user_id}
                  onClick={() => onSelectCaptador(cap.user_id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                    isSelected ? "text-white" : "hover:bg-muted/50"
                  )}
                  style={isSelected ? { backgroundColor: cap.cor || "hsl(var(--primary))" } : {}}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: cap.cor || "hsl(var(--muted-foreground))" }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{nome}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">{count}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
