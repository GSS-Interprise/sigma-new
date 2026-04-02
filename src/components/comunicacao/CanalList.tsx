import { Hash, Lock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Canal {
  id: string;
  nome: string;
  tipo: string;
  updated_at: string;
}

interface CanalListProps {
  canais: Canal[];
  canalSelecionado: string | null;
  onSelectCanal: (id: string) => void;
  isAdmin?: boolean;
}

/** Returns first + second name only: "Bruna da Silva Santos" → "Bruna Silva" (skips prepositions) */
function shortName(fullName: string): string {
  const SKIP = new Set(["da", "de", "do", "das", "dos", "e"]);
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const first = parts[0];
  const second = parts.slice(1).find(p => !SKIP.has(p.toLowerCase()));
  return second ? `${first} ${second}` : first;
}

export function CanalList({ canais, canalSelecionado, onSelectCanal, isAdmin = false }: CanalListProps) {
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: notificacoes } = useQuery({
    queryKey: ["canal-notificacoes", user?.id],
    queryFn: async () => {
      if (!user) return {};
      
      const { data, error } = await supabase
        .from("comunicacao_notificacoes")
        .select("canal_id")
        .eq("user_id", user.id)
        .eq("lida", false);

      if (error) throw error;

      const grouped = data.reduce((acc, notif) => {
        acc[notif.canal_id] = (acc[notif.canal_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return grouped;
    },
    enabled: !!user,
  });

  // Fetch participants for DM channels to show the OTHER person's name
  const dmCanalIds = canais.filter(c => c.tipo === "direto").map(c => c.id);
  
  const { data: dmParticipantes } = useQuery({
    queryKey: ["dm-participantes", dmCanalIds.join(",")],
    queryFn: async () => {
      if (dmCanalIds.length === 0) return {};

      const { data, error } = await supabase
        .from("comunicacao_participantes")
        .select("canal_id, user_id")
        .in("canal_id", dmCanalIds);

      if (error) throw error;

      // Get unique user IDs (excluding current user)
      const otherUserIds = [...new Set(
        (data || [])
          .filter(p => p.user_id !== user?.id)
          .map(p => p.user_id)
      )];

      if (otherUserIds.length === 0) return {};

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .in("id", otherUserIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.nome_completo]));

      // Map canal_id → other user's short name
      const result: Record<string, { name: string; isMyDM: boolean }> = {};
      for (const canal_id of dmCanalIds) {
        const participants = (data || []).filter(p => p.canal_id === canal_id);
        const isMine = participants.some(p => p.user_id === user?.id);
        const other = participants.find(p => p.user_id !== user?.id);
        if (other) {
          const fullName = profileMap.get(other.user_id) || "Usuário";
          result[canal_id] = { name: shortName(fullName), isMyDM: isMine };
        }
      }
      return result;
    },
    enabled: dmCanalIds.length > 0 && !!user,
  });

  const getDisplayName = (canal: Canal) => {
    if (canal.tipo === "direto" && dmParticipantes?.[canal.id]) {
      return dmParticipantes[canal.id].name;
    }
    return canal.nome;
  };

  const isNotMyDM = (canal: Canal) => {
    if (canal.tipo !== "direto" || !dmParticipantes?.[canal.id]) return false;
    return !dmParticipantes[canal.id].isMyDM;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {canais.map((canal) => {
        const naoLidas = notificacoes?.[canal.id] || 0;
        
        return (
          <button
            key={canal.id}
            onClick={() => onSelectCanal(canal.id)}
            className={cn(
              "w-full px-4 py-3 flex items-center gap-3 hover:bg-accent transition-colors text-left",
              canalSelecionado === canal.id && "bg-accent"
            )}
          >
            {canal.tipo === "direto" ? (
              <div className="relative flex-shrink-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                {isAdmin && isNotMyDM(canal) && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive" />
                )}
              </div>
            ) : (
              <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{getDisplayName(canal)}</div>
            </div>
            {naoLidas > 0 && (
              <Badge variant="destructive" className="ml-auto">
                {naoLidas}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
