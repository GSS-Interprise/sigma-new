import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Save, Search, Users, UserMinus, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface GerenciarCanalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canalId: string;
  canalNome: string;
  isAdmin?: boolean;
  onCanalDeleted?: () => void;
}

export function GerenciarCanalDialog({
  open,
  onOpenChange,
  canalId,
  canalNome,
  isAdmin = false,
  onCanalDeleted,
}: GerenciarCanalDialogProps) {
  const [novosSelecionados, setNovosSelecionados] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTermAtuais, setSearchTermAtuais] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Buscar dados do canal
  const { data: canalData } = useQuery({
    queryKey: ["canal-detalhes", canalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacao_canais")
        .select("*")
        .eq("id", canalId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: open && !!canalId,
  });

  // Atualizar campos quando dados do canal carregarem
  useEffect(() => {
    if (canalData) {
      setNome(canalData.nome || "");
      setDescricao(canalData.descricao || "");
    }
  }, [canalData]);

  // Buscar todos os usuários
  const { data: todosUsuarios } = useQuery({
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

  // Buscar participantes atuais do canal
  const { data: participantesAtuais } = useQuery({
    queryKey: ["canal-participantes", canalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacao_participantes")
        .select("user_id")
        .eq("canal_id", canalId);

      if (error) throw error;
      return data.map((p) => p.user_id);
    },
    enabled: open,
  });

  // Usuários que já estão no canal
  const participantesDoCanal = todosUsuarios?.filter(
    (u) => participantesAtuais?.includes(u.id)
  );

  // Filtrar participantes atuais por busca
  const participantesFiltrados = participantesDoCanal?.filter((u) => {
    if (!searchTermAtuais.trim()) return true;
    const term = searchTermAtuais.toLowerCase();
    const nomeMatch = u.nome_completo?.toLowerCase().includes(term);
    const emailMatch = u.email?.toLowerCase().includes(term);
    const setor = setores?.find(s => s.id === u.setor_id);
    const setorMatch = setor?.nome?.toLowerCase().includes(term);
    return nomeMatch || emailMatch || setorMatch;
  });

  // Filtrar usuários que ainda não são participantes
  const usuariosDisponiveis = todosUsuarios?.filter(
    (u) => !participantesAtuais?.includes(u.id)
  );

  // Filtrar por busca
  const usuariosFiltrados = usuariosDisponiveis?.filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nomeMatch = u.nome_completo?.toLowerCase().includes(term);
    const emailMatch = u.email?.toLowerCase().includes(term);
    const setor = setores?.find(s => s.id === u.setor_id);
    const setorMatch = setor?.nome?.toLowerCase().includes(term);
    return nomeMatch || emailMatch || setorMatch;
  });

  // Mutation para atualizar canal
  const atualizarCanalMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("comunicacao_canais")
        .update({ nome, descricao: descricao || null })
        .eq("id", canalId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Canal atualizado",
        description: "As informações do canal foram atualizadas.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      queryClient.invalidateQueries({ queryKey: ["canal-detalhes", canalId] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar canal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const adicionarParticipantesMutation = useMutation({
    mutationFn: async () => {
      if (novosSelecionados.length === 0) {
        throw new Error("Selecione pelo menos um participante");
      }

      const participantesData = novosSelecionados.map((userId) => ({
        canal_id: canalId,
        user_id: userId,
      }));

      const { error } = await supabase
        .from("comunicacao_participantes")
        .insert(participantesData);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Participantes adicionados",
        description: "Os participantes foram adicionados ao canal com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["canal-participantes", canalId] });
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      setNovosSelecionados([]);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao adicionar participantes",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removerParticipanteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("comunicacao_participantes")
        .delete()
        .eq("canal_id", canalId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Participante removido",
        description: "O participante foi removido do canal.",
      });
      queryClient.invalidateQueries({ queryKey: ["canal-participantes", canalId] });
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      queryClient.invalidateQueries({ queryKey: ["canal-participantes-full", canalId] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover participante",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const excluirCanalMutation = useMutation({
    mutationFn: async () => {
      // Soft delete: marca as mensagens como excluídas ao invés de deletar
      const { error: mensagensError } = await supabase
        .from("comunicacao_mensagens")
        .update({ deleted_at: new Date().toISOString() })
        .eq("canal_id", canalId);

      if (mensagensError) throw mensagensError;

      // Remove participantes (isso pode continuar sendo hard delete)
      const { error: participantesError } = await supabase
        .from("comunicacao_participantes")
        .delete()
        .eq("canal_id", canalId);

      if (participantesError) throw participantesError;

      // Remove o canal
      const { error: canalError } = await supabase
        .from("comunicacao_canais")
        .delete()
        .eq("id", canalId);

      if (canalError) throw canalError;
    },
    onSuccess: () => {
      toast({
        title: "Canal excluído",
        description: "O canal foi excluído com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
      onOpenChange(false);
      onCanalDeleted?.();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir canal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleParticipante = (userId: string) => {
    setNovosSelecionados((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciar Canal</DialogTitle>
          <DialogDescription>
            Edite as informações e gerencie participantes
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="participantes-atuais" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="participantes-atuais" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Atuais
              {participantesDoCanal && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {participantesDoCanal.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="gap-1">
              <UserPlus className="h-3.5 w-3.5" />
              Adicionar
            </TabsTrigger>
            <TabsTrigger value="info">Informações</TabsTrigger>
          </TabsList>

          {/* Participantes Atuais */}
          <TabsContent value="participantes-atuais" className="flex-1 overflow-hidden flex flex-col gap-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar participante..."
                value={searchTermAtuais}
                onChange={(e) => setSearchTermAtuais(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {participantesFiltrados && participantesFiltrados.length > 0 ? (
              <ScrollArea className="flex-1 max-h-[300px] pr-4">
                <div className="space-y-2">
                  {participantesFiltrados.map((usuario) => {
                    const setor = setores?.find(s => s.id === usuario.setor_id);
                    return (
                      <div
                        key={usuario.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-accent/30 hover:bg-accent/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{usuario.nome_completo}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {usuario.email}
                            {setor && <span className="ml-2">• {setor.nome}</span>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removerParticipanteMutation.mutate(usuario.id)}
                          disabled={removerParticipanteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {participantesAtuais ? (
                  <p>Nenhum participante encontrado</p>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin" />
                )}
              </div>
            )}
          </TabsContent>

          {/* Adicionar Participantes */}
          <TabsContent value="adicionar" className="flex-1 overflow-hidden flex flex-col gap-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário para adicionar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {usuariosFiltrados && usuariosFiltrados.length > 0 ? (
              <>
                <div className="text-sm text-muted-foreground">
                  Selecione os usuários que deseja adicionar ao canal:
                </div>
                <div className="flex-1 max-h-[280px] overflow-y-auto border rounded-lg pr-1">
                  <div className="space-y-2">
                    {usuariosFiltrados.map((usuario) => {
                      const setor = setores?.find(s => s.id === usuario.setor_id);
                      return (
                        <div
                          key={usuario.id}
                          className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => toggleParticipante(usuario.id)}
                        >
                          <Checkbox
                            id={`user-${usuario.id}`}
                            checked={novosSelecionados.includes(usuario.id)}
                            onCheckedChange={() => toggleParticipante(usuario.id)}
                          />
                          <label
                            htmlFor={`user-${usuario.id}`}
                            className="flex-1 cursor-pointer min-w-0"
                          >
                            <div className="font-medium truncate">{usuario.nome_completo}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              {usuario.email}
                              {setor && <span className="ml-2">• {setor.nome}</span>}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    {novosSelecionados.length > 0 && (
                      <span>{novosSelecionados.length} selecionado(s)</span>
                    )}
                  </div>
                  <Button
                    onClick={() => adicionarParticipantesMutation.mutate()}
                    disabled={
                      adicionarParticipantesMutation.isPending ||
                      novosSelecionados.length === 0
                    }
                  >
                    {adicionarParticipantesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Adicionando...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Adicionar
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {participantesAtuais ? (
                  <p>Todos os usuários já são participantes deste canal</p>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin" />
                )}
              </div>
            )}
          </TabsContent>

          {/* Informações */}
          <TabsContent value="info" className="flex-1 space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="canal-nome">Nome do Canal *</Label>
              <Input
                id="canal-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do canal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="canal-descricao">Descrição</Label>
              <Textarea
                id="canal-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do canal (opcional)"
                rows={3}
              />
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              {isAdmin && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Tem certeza que deseja excluir este canal? Todas as mensagens serão perdidas.")) {
                      excluirCanalMutation.mutate();
                    }
                  }}
                  disabled={excluirCanalMutation.isPending}
                >
                  {excluirCanalMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Canal
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={() => atualizarCanalMutation.mutate()}
                disabled={atualizarCanalMutation.isPending || !nome.trim()}
                className={isAdmin ? "" : "ml-auto"}
              >
                {atualizarCanalMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}