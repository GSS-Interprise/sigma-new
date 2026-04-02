import { useState } from "react";
import { Hash, MessageSquare, Settings } from "lucide-react";
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
}

function shortName(fullName: string): string {
  const SKIP = new Set(["da", "de", "do", "das", "dos", "e"]);
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const first = parts[0];
  const second = parts.slice(1).find(p => !SKIP.has(p.toLowerCase()));
  return second ? `${first} ${second}` : first;
}

export function CanalHeader({ canal, isAdmin = false, onCanalDeleted }: CanalHeaderProps) {
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
  const { data: dmDisplayName } = useQuery({
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

      return profile?.nome_completo ? shortName(profile.nome_completo) : null;
    },
    enabled: canal.tipo === "direto" && !!user,
  });

  const displayName = canal.tipo === "direto" && dmDisplayName ? dmDisplayName : canal.nome;

  return (
    <>
      <div className="border-b p-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          {canal.tipo === "direto" ? (
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Hash className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <h3 className="font-semibold">{displayName}</h3>
            {canal.descricao && (
              <p className="text-sm text-muted-foreground">{canal.descricao}</p>
            )}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setGerenciarOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
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
