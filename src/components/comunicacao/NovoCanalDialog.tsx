import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";

interface NovoCanalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovoCanalDialog({ open, onOpenChange }: NovoCanalDialogProps) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<"grupo" | "direto">("grupo");
  const [participantesSelecionados, setParticipantesSelecionados] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      const { data, error } = await supabase
        .from("setores")
        .select("id, nome");

      if (error) throw error;
      return data;
    },
  });

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const criarCanalMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Usuário não autenticado");

      // Criar canal
      const { data: canal, error: canalError } = await supabase
        .from("comunicacao_canais")
        .insert({
          nome,
          descricao: descricao || null,
          tipo,
          criado_por: currentUser.id,
        })
        .select()
        .single();

      if (canalError) throw canalError;

      // Adicionar participantes (incluindo o criador)
      const participantes = [currentUser.id, ...participantesSelecionados];
      const participantesData = participantes.map(userId => ({
        canal_id: canal.id,
        user_id: userId,
      }));

      const { error: participantesError } = await supabase
        .from("comunicacao_participantes")
        .insert(participantesData);

      if (participantesError) throw participantesError;

      return canal;
    },
    onSuccess: () => {
      toast({
        title: "Canal criado",
        description: "O canal foi criado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      setNome("");
      setDescricao("");
      setParticipantesSelecionados([]);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar canal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleParticipante = (userId: string) => {
    setParticipantesSelecionados(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Filtrar usuários por nome ou setor
  const usuariosFiltrados = useMemo(() => {
    if (!usuarios) return [];
    
    const term = searchTerm.toLowerCase().trim();
    if (!term) return usuarios.filter(u => u.id !== currentUser?.id);

    return usuarios.filter(u => {
      if (u.id === currentUser?.id) return false;
      
      const nomeMatch = u.nome_completo?.toLowerCase().includes(term);
      const emailMatch = u.email?.toLowerCase().includes(term);
      
      // Buscar nome do setor
      const setor = setores?.find(s => s.id === u.setor_id);
      const setorMatch = setor?.nome?.toLowerCase().includes(term);
      
      return nomeMatch || emailMatch || setorMatch;
    });
  }, [usuarios, searchTerm, currentUser?.id, setores]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Canal</DialogTitle>
          <DialogDescription>
            Crie um novo canal para comunicação com sua equipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Canal *</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Equipe Médica"
            />
          </div>

          <div>
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o propósito do canal..."
            />
          </div>

          <div>
            <Label htmlFor="tipo">Tipo de Canal</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "grupo" | "direto")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grupo">Grupo</SelectItem>
                <SelectItem value="direto">Direto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Participantes *</Label>
            <div className="relative mt-2 mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou setor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded-md p-4 max-h-[200px] overflow-y-auto space-y-2">
              {usuariosFiltrados.length > 0 ? (
                usuariosFiltrados.map((usuario) => {
                  const setor = setores?.find(s => s.id === usuario.setor_id);
                  return (
                    <div key={usuario.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={usuario.id}
                        checked={participantesSelecionados.includes(usuario.id)}
                        onCheckedChange={() => toggleParticipante(usuario.id)}
                      />
                      <label
                        htmlFor={usuario.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                      >
                        {usuario.nome_completo} ({usuario.email})
                        {setor && (
                          <span className="text-xs text-muted-foreground ml-2">
                            • {setor.nome}
                          </span>
                        )}
                      </label>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhum usuário encontrado
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => criarCanalMutation.mutate()}
              disabled={!nome || participantesSelecionados.length === 0 || criarCanalMutation.isPending}
            >
              {criarCanalMutation.isPending ? "Criando..." : "Criar Canal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
