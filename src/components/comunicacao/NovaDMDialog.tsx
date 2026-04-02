import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NovaDMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDMCreated: (canalId: string) => void;
}

export function NovaDMDialog({ open, onOpenChange, onDMCreated }: NovaDMDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: usuarios } = useQuery({
    queryKey: ["usuarios-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo, email, setor_id")
        .order("nome_completo");
      if (error) throw error;
      return data;
    },
  });

  const { data: setores } = useQuery({
    queryKey: ["setores-lista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id, nome");
      if (error) throw error;
      return data;
    },
  });

  const criarDMMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!currentUser) throw new Error("Usuário não autenticado");

      // Check if DM already exists between these two users
      const { data: existingCanais } = await supabase
        .from("comunicacao_canais")
        .select(`id, comunicacao_participantes(user_id)`)
        .eq("tipo", "direto");

      if (existingCanais) {
        for (const canal of existingCanais) {
          const participantIds = (canal.comunicacao_participantes as any[]).map((p: any) => p.user_id);
          if (
            participantIds.length === 2 &&
            participantIds.includes(currentUser.id) &&
            participantIds.includes(targetUserId)
          ) {
            return canal.id; // Already exists
          }
        }
      }

      // Get target user name
      const targetUser = usuarios?.find(u => u.id === targetUserId);
      const myProfile = usuarios?.find(u => u.id === currentUser.id);
      const nomeCanal = `${myProfile?.nome_completo || "Eu"} & ${targetUser?.nome_completo || "Usuário"}`;

      // Create new DM channel
      const { data: canal, error: canalError } = await supabase
        .from("comunicacao_canais")
        .insert({
          nome: nomeCanal,
          tipo: "direto",
          criado_por: currentUser.id,
        })
        .select()
        .single();

      if (canalError) throw canalError;

      // Add both as participants
      const { error: partError } = await supabase
        .from("comunicacao_participantes")
        .insert([
          { canal_id: canal.id, user_id: currentUser.id },
          { canal_id: canal.id, user_id: targetUserId },
        ]);

      if (partError) throw partError;

      return canal.id;
    },
    onSuccess: (canalId) => {
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      onDMCreated(canalId);
      onOpenChange(false);
      setSearchTerm("");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const usuariosFiltrados = useMemo(() => {
    if (!usuarios) return [];
    const filtered = usuarios.filter(u => u.id !== currentUser?.id);
    const term = searchTerm.toLowerCase().trim();
    if (!term) return filtered;

    return filtered.filter(u => {
      const nomeMatch = u.nome_completo?.toLowerCase().includes(term);
      const emailMatch = u.email?.toLowerCase().includes(term);
      const setor = setores?.find(s => s.id === u.setor_id);
      const setorMatch = setor?.nome?.toLowerCase().includes(term);
      return nomeMatch || emailMatch || setorMatch;
    });
  }, [usuarios, searchTerm, currentUser?.id, setores]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conversa Privada</DialogTitle>
          <DialogDescription>
            Selecione um colaborador para iniciar uma conversa
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou setor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {usuariosFiltrados.map((usuario) => {
            const setor = setores?.find(s => s.id === usuario.setor_id);
            return (
              <button
                key={usuario.id}
                onClick={() => criarDMMutation.mutate(usuario.id)}
                disabled={criarDMMutation.isPending}
                className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent rounded-md transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                  {usuario.nome_completo?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{usuario.nome_completo}</p>
                  {setor && (
                    <p className="text-xs text-muted-foreground truncate">{setor.nome}</p>
                  )}
                </div>
              </button>
            );
          })}
          {usuariosFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum colaborador encontrado
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
