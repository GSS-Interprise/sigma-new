import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Search, 
  Folder, 
  Star, 
  Briefcase, 
  BookOpen, 
  Settings, 
  Users,
  FileText,
  Calendar,
  Lightbulb,
  Target,
  MoreVertical,
  Trash2,
  Edit,
  Pin,
  Archive,
  CheckSquare,
  Link2,
  ArchiveRestore
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceNotaDialog } from "./WorkspaceNotaDialog";
import { WorkspacePastaDialog } from "./WorkspacePastaDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ICONS: Record<string, any> = {
  folder: Folder,
  star: Star,
  briefcase: Briefcase,
  book: BookOpen,
  settings: Settings,
  users: Users,
  file: FileText,
  calendar: Calendar,
  idea: Lightbulb,
  target: Target,
};

export function WorkspaceArea() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPasta, setSelectedPasta] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [notaDialogOpen, setNotaDialogOpen] = useState(false);
  const [pastaDialogOpen, setPastaDialogOpen] = useState(false);
  const [editingNota, setEditingNota] = useState<any>(null);
  const [editingPasta, setEditingPasta] = useState<any>(null);

  // Buscar pastas
  const { data: pastas = [], isLoading: loadingPastas } = useQuery({
    queryKey: ['user-pastas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_pastas')
        .select('*')
        .order('ordem');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Buscar notas
  const { data: notas = [], isLoading: loadingNotas } = useQuery({
    queryKey: ['user-notas', selectedPasta, showArchived],
    queryFn: async () => {
      let query = supabase
        .from('user_notas')
        .select(`
          *,
          user_notas_checklist(id, concluido),
          user_notas_anexos(id)
        `)
        .eq('arquivada', showArchived)
        .order('fixada', { ascending: false })
        .order('updated_at', { ascending: false });

      if (selectedPasta) {
        query = query.eq('pasta_id', selectedPasta);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Desarquivar nota
  const unarchiveNotaMutation = useMutation({
    mutationFn: async (notaId: string) => {
      const { error } = await supabase.from('user_notas').update({ arquivada: false }).eq('id', notaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
      toast.success("Nota restaurada!");
    },
  });

  // Deletar pasta
  const deletePastaMutation = useMutation({
    mutationFn: async (pastaId: string) => {
      const { error } = await supabase.from('user_pastas').delete().eq('id', pastaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-pastas'] });
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
      if (selectedPasta) setSelectedPasta(null);
      toast.success("Pasta excluída!");
    },
  });

  // Deletar nota
  const deleteNotaMutation = useMutation({
    mutationFn: async (notaId: string) => {
      const { error } = await supabase.from('user_notas').delete().eq('id', notaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
      toast.success("Nota excluída!");
    },
  });

  // Fixar/Desfixar nota
  const togglePinMutation = useMutation({
    mutationFn: async ({ notaId, fixada }: { notaId: string; fixada: boolean }) => {
      const { error } = await supabase.from('user_notas').update({ fixada }).eq('id', notaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
    },
  });

  // Arquivar nota
  const archiveNotaMutation = useMutation({
    mutationFn: async (notaId: string) => {
      const { error } = await supabase.from('user_notas').update({ arquivada: true }).eq('id', notaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
      toast.success("Nota arquivada!");
    },
  });

  const filteredNotas = notas.filter((nota: any) =>
    nota.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nota.conteudo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nota.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getIconComponent = (iconId: string) => {
    return ICONS[iconId] || Folder;
  };

  const handleEditNota = (nota: any) => {
    setEditingNota(nota);
    setNotaDialogOpen(true);
  };

  const handleNewNota = () => {
    setEditingNota(null);
    setNotaDialogOpen(true);
  };

  const handleEditPasta = (pasta: any) => {
    setEditingPasta(pasta);
    setPastaDialogOpen(true);
  };

  const handleNewPasta = () => {
    setEditingPasta(null);
    setPastaDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar notas..."
              className="pl-10"
            />
          </div>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2"
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Arquivadas" : "Ativas"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleNewPasta}>
            <Folder className="h-4 w-4 mr-2" />
            Nova Pasta
          </Button>
          <Button onClick={handleNewNota}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Nota
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Sidebar - Pastas */}
        <div className="w-64 flex-shrink-0">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-1">
              <button
                onClick={() => setSelectedPasta(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  selectedPasta === null 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span className="flex-1">Todas as Notas</span>
                <Badge variant="secondary" className="text-xs">
                  {notas.length}
                </Badge>
              </button>

              {pastas.map((pasta: any) => {
                const IconComponent = getIconComponent(pasta.icone);
                const notasCount = notas.filter((n: any) => n.pasta_id === pasta.id).length;
                
                return (
                  <div key={pasta.id} className="group relative">
                    <button
                      onClick={() => setSelectedPasta(pasta.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                        selectedPasta === pasta.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <IconComponent 
                        className="h-4 w-4" 
                        style={{ color: selectedPasta === pasta.id ? undefined : pasta.cor }} 
                      />
                      <span className="flex-1 truncate">{pasta.nome}</span>
                      <Badge variant="secondary" className="text-xs">
                        {notasCount}
                      </Badge>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditPasta(pasta)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => deletePastaMutation.mutate(pasta.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Content - Notas */}
        <div className="flex-1 min-w-0">
          <ScrollArea className="h-full">
            {loadingNotas ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredNotas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <FileText className="h-12 w-12 mb-2 opacity-50" />
                <p>Nenhuma nota encontrada</p>
                <Button variant="link" onClick={handleNewNota} className="mt-2">
                  Criar primeira nota
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                {filteredNotas.map((nota: any) => {
                  const checklistTotal = nota.user_notas_checklist?.length || 0;
                  const checklistDone = nota.user_notas_checklist?.filter((c: any) => c.concluido).length || 0;
                  const anexosCount = nota.user_notas_anexos?.length || 0;

                  return (
                    <Card 
                      key={nota.id} 
                      className={`group cursor-pointer hover:shadow-md transition-shadow ${
                        nota.fixada ? 'ring-2 ring-primary/50' : ''
                      }`}
                      onClick={() => handleEditNota(nota)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-medium line-clamp-1 flex items-center gap-2">
                            {nota.fixada && <Pin className="h-3 w-3 text-primary" />}
                            {nota.titulo}
                          </h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { 
                                e.stopPropagation(); 
                                togglePinMutation.mutate({ notaId: nota.id, fixada: !nota.fixada }); 
                              }}>
                                <Pin className="h-4 w-4 mr-2" />
                                {nota.fixada ? 'Desfixar' : 'Fixar'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { 
                                e.stopPropagation(); 
                                if (nota.arquivada) {
                                  unarchiveNotaMutation.mutate(nota.id);
                                } else {
                                  archiveNotaMutation.mutate(nota.id);
                                }
                              }}>
                                {nota.arquivada ? (
                                  <>
                                    <ArchiveRestore className="h-4 w-4 mr-2" />
                                    Restaurar
                                  </>
                                ) : (
                                  <>
                                    <Archive className="h-4 w-4 mr-2" />
                                    Arquivar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  deleteNotaMutation.mutate(nota.id); 
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {nota.conteudo && (
                          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                            {nota.conteudo}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1 mb-3">
                          {nota.tags?.slice(0, 3).map((tag: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {nota.tags?.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{nota.tags.length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {format(new Date(nota.updated_at), "dd MMM", { locale: ptBR })}
                          </span>
                          <div className="flex items-center gap-2">
                            {checklistTotal > 0 && (
                              <span className="flex items-center gap-1">
                                <CheckSquare className="h-3 w-3" />
                                {checklistDone}/{checklistTotal}
                              </span>
                            )}
                            {anexosCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Link2 className="h-3 w-3" />
                                {anexosCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Dialogs */}
      <WorkspaceNotaDialog
        open={notaDialogOpen}
        onOpenChange={setNotaDialogOpen}
        nota={editingNota}
        pastaId={selectedPasta}
      />
      <WorkspacePastaDialog
        open={pastaDialogOpen}
        onOpenChange={setPastaDialogOpen}
        pasta={editingPasta}
      />
    </div>
  );
}