import { useState } from "react";
import { Hash, MessageSquare, Settings, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GerenciarCanalDialog } from "./GerenciarCanalDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CanalHeaderProps {
  canal: {
    id: string;
    nome: string;
    descricao: string | null;
    tipo: string;
  };
  isAdmin?: boolean;
  onCanalDeleted?: () => void;
  onlineUsers?: Set<string>;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
}

function shortName(fullName: string): string {
  const SKIP = new Set(["da", "de", "do", "das", "dos", "e"]);
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const first = parts[0];
  const second = parts.slice(1).find(p => !SKIP.has(p.toLowerCase()));
  return second ? `${first} ${second}` : first;
}

export function CanalHeader({ canal, isAdmin = false, onCanalDeleted, onlineUsers, searchOpen, onToggleSearch }: CanalHeaderProps) {
  const [gerenciarOpen, setGerenciarOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity,
  });

  // For DM channels, resolve the other participant's name
  const { data: dmInfo } = useQuery({
    queryKey: ["dm-header-name", canal.id, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("comunicacao_participantes")
        .select("user_id")
        .eq("canal_id", canal.id)
        .neq("user_id", user.id);

      if (!data || data.length === 0) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", data[0].user_id)
        .single();

      return {
        userId: data[0].user_id,
        name: profile?.nome_completo ? shortName(profile.nome_completo) : null,
      };
    },
    enabled: canal.tipo === "direto" && !!user,
  });

  const displayName = canal.tipo === "direto" && dmInfo?.name ? dmInfo.name : canal.nome;
  const otherOnline = !!(canal.tipo === "direto" && dmInfo?.userId && onlineUsers?.has(dmInfo.userId));

  return (
    <>
      <div className="chat-divider border-b px-5 py-3.5 flex items-center justify-between bg-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full flex items-center justify-center bg-[rgb(var(--chat-cream))]">
            {canal.tipo === "direto" ? (
              <MessageSquare className="h-4 w-4 text-[rgb(var(--chat-deep))]" />
            ) : (
              <Hash className="h-4 w-4 text-[rgb(var(--chat-deep))]" />
            )}
          </div>
          <div>
            <h3 className="chat-heading font-semibold text-[15px] leading-tight">{displayName}</h3>
            {canal.tipo === "direto" ? (
              <p className="text-xs mt-0.5 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${otherOnline ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <span className={otherOnline ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                  {otherOnline ? "Online agora" : "Offline"}
                </span>
              </p>
            ) : (
              canal.descricao && (
                <p className="text-xs text-muted-foreground mt-0.5">{canal.descricao}</p>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleSearch && (
            <Button
              variant="ghost"
              size="icon"
              className={`rounded-full hover:bg-[rgb(var(--chat-cream))] ${searchOpen ? "bg-[rgb(var(--chat-cream))]" : ""}`}
              onClick={onToggleSearch}
              title="Buscar mensagens"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-[rgb(var(--chat-cream))]"
            onClick={() => setGerenciarOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <GerenciarCanalDialog
        open={gerenciarOpen}
        onOpenChange={setGerenciarOpen}
        canalId={canal.id}
        canalNome={displayName}
        isAdmin={isAdmin}
        onCanalDeleted={onCanalDeleted}
      />
    </>
  );
}
