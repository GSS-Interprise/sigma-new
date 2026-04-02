import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  X, 
  Save, 
  Link2, 
  Trash2, 
  CheckSquare,
  GripVertical,
  Upload
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface WorkspaceNotaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nota?: any;
  pastaId?: string | null;
  onSuccess?: () => void;
}

interface ChecklistItem {
  id: string;
  texto: string;
  concluido: boolean;
  ordem: number;
}

interface AnexoItem {
  id: string;
  tipo: 'link' | 'arquivo';
  nome: string;
  url: string;
}

export function WorkspaceNotaDialog({ 
  open, 
  onOpenChange, 
  nota, 
  pastaId,
  onSuccess 
}: WorkspaceNotaDialogProps) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [novaTag, setNovaTag] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [novoChecklistItem, setNovoChecklistItem] = useState("");
  const [anexos, setAnexos] = useState<AnexoItem[]>([]);
  const [novoLinkNome, setNovoLinkNome] = useState("");
  const [novoLinkUrl, setNovoLinkUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  // Track se já inicializamos os dados para evitar sobrescrever edições do usuário
  // Usamos refs para evitar re-renders desnecessários e manter o estado entre renders
  const [dataInitialized, setDataInitialized] = useState<{checklist: boolean, anexos: boolean}>({
    checklist: false,
    anexos: false
  });

  // Carregar checklist existente
  const { data: checklistData, isFetched: checklistFetched } = useQuery({
    queryKey: ['nota-checklist', nota?.id],
    queryFn: async () => {
      if (!nota?.id) return [];
      const { data, error } = await supabase
        .from('user_notas_checklist')
        .select('*')
        .eq('nota_id', nota.id)
        .order('ordem');
      if (error) throw error;
      return data || [];
    },
    enabled: !!nota?.id && open,
    staleTime: 0, // Sempre buscar dados frescos
  });

  // Carregar anexos existentes
  const { data: anexosData, isFetched: anexosFetched } = useQuery({
    queryKey: ['nota-anexos', nota?.id],
    queryFn: async () => {
      if (!nota?.id) return [];
      const { data, error } = await supabase
        .from('user_notas_anexos')
        .select('*')
        .eq('nota_id', nota.id)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!nota?.id && open,
    staleTime: 0, // Sempre buscar dados frescos
  });

  useEffect(() => {
    if (nota) {
      setTitulo(nota.titulo || "");
      setConteudo(nota.conteudo || "");
      setTags(nota.tags || []);
    } else {
      setTitulo("");
      setConteudo("");
      setTags([]);
      setChecklist([]);
      setAnexos([]);
    }
    // Reset initialization flags when dialog opens/nota changes
    setDataInitialized({ checklist: false, anexos: false });
  }, [nota, open]);

  useEffect(() => {
    // Só inicializa uma vez após o fetch completar para evitar sobrescrever edições do usuário
    if (checklistFetched && checklistData && !dataInitialized.checklist) {
      setChecklist(checklistData.map((item: any) => ({
        id: item.id,
        texto: item.texto,
        concluido: item.concluido,
        ordem: item.ordem,
      })));
      setDataInitialized(prev => ({ ...prev, checklist: true }));
    }
  }, [checklistData, checklistFetched, dataInitialized.checklist]);

  useEffect(() => {
    // Só inicializa uma vez após o fetch completar para evitar sobrescrever edições do usuário
    if (anexosFetched && anexosData && !dataInitialized.anexos) {
      setAnexos(anexosData.map((item: any) => ({
        id: item.id,
        tipo: item.tipo as 'link' | 'arquivo',
        nome: item.nome,
        url: item.url,
      })));
      setDataInitialized(prev => ({ ...prev, anexos: true }));
    }
  }, [anexosData, anexosFetched, dataInitialized.anexos]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      let notaId = nota?.id;

      if (notaId) {
        // Atualizar
        const { error } = await supabase
          .from('user_notas')
          .update({ titulo, conteudo, tags })
          .eq('id', notaId);
        if (error) throw error;
      } else {
        // Criar
        const { data, error } = await supabase
          .from('user_notas')
          .insert({
            user_id: userData.user.id,
            pasta_id: pastaId || null,
            titulo,
            conteudo,
            tags,
          })
          .select()
          .single();
        if (error) throw error;
        notaId = data.id;
      }

      // Salvar checklist
      if (notaId) {
        // Deletar itens removidos
        const existingIds = checklist.filter(c => !c.id.startsWith('new-')).map(c => c.id);
        if (nota?.id) {
          if (existingIds.length > 0) {
            await supabase
              .from('user_notas_checklist')
              .delete()
              .eq('nota_id', notaId)
              .not('id', 'in', `(${existingIds.join(',')})`);
          } else {
            await supabase
              .from('user_notas_checklist')
              .delete()
              .eq('nota_id', notaId);
          }
        }

        // Upsert checklist items
        for (const item of checklist) {
          if (item.id.startsWith('new-')) {
            await supabase
              .from('user_notas_checklist')
              .insert({ nota_id: notaId, texto: item.texto, concluido: item.concluido, ordem: item.ordem });
          } else {
            await supabase
              .from('user_notas_checklist')
              .update({ texto: item.texto, concluido: item.concluido, ordem: item.ordem })
              .eq('id', item.id);
          }
        }

        // Gerenciar anexos
        // Primeiro, pegar IDs dos anexos existentes que devem permanecer
        const existingAnexoIds = anexos.filter(a => !a.id.startsWith('new-')).map(a => a.id);
        
        // Deletar anexos que foram removidos
        if (nota?.id) {
          let deleteQuery = supabase
            .from('user_notas_anexos')
            .select('id, tipo, url')
            .eq('nota_id', notaId);
          
          if (existingAnexoIds.length > 0) {
            deleteQuery = deleteQuery.not('id', 'in', `(${existingAnexoIds.join(',')})`);
          }
          
          const { data: anexosToDelete } = await deleteQuery;
          
          if (anexosToDelete && anexosToDelete.length > 0) {
            // Deletar arquivos do storage
            const arquivosParaDeletar = anexosToDelete
              .filter((a: any) => a.tipo === 'arquivo')
              .map((a: any) => a.url);
            
            if (arquivosParaDeletar.length > 0) {
              await supabase.storage.from('user-notas-anexos').remove(arquivosParaDeletar);
            }
            
            // Deletar registros
            const ids = anexosToDelete.map((a: any) => a.id);
            await supabase
              .from('user_notas_anexos')
              .delete()
              .in('id', ids);
          }
        }
        
        // Salvar novos anexos (links e arquivos)
        for (const anexo of anexos) {
          if (anexo.id.startsWith('new-')) {
            const { error: anexoError } = await supabase
              .from('user_notas_anexos')
              .insert({ nota_id: notaId, tipo: anexo.tipo, nome: anexo.nome, url: anexo.url });
            
            if (anexoError) {
              console.error('Erro ao salvar anexo:', anexoError);
            }
          }
        }
      }

      return notaId;
    },
    onSuccess: (savedNotaId) => {
      // Invalidar e refetch imediato para garantir que os dados estejam sincronizados
      queryClient.invalidateQueries({ queryKey: ['user-notas'] });
      queryClient.invalidateQueries({ queryKey: ['nota-checklist', savedNotaId] });
      queryClient.invalidateQueries({ queryKey: ['nota-anexos', savedNotaId] });
      // Também invalidar com o ID original caso seja uma atualização
      if (nota?.id && nota.id !== savedNotaId) {
        queryClient.invalidateQueries({ queryKey: ['nota-checklist', nota.id] });
        queryClient.invalidateQueries({ queryKey: ['nota-anexos', nota.id] });
      }
      toast.success(nota ? "Nota atualizada!" : "Nota criada!");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar nota");
    },
  });

  const handleAddTag = () => {
    if (novaTag.trim() && !tags.includes(novaTag.trim())) {
      setTags([...tags, novaTag.trim()]);
      setNovaTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleAddChecklistItem = () => {
    if (novoChecklistItem.trim()) {
      setChecklist([
        ...checklist,
        {
          id: `new-${Date.now()}`,
          texto: novoChecklistItem.trim(),
          concluido: false,
          ordem: checklist.length,
        },
      ]);
      setNovoChecklistItem("");
    }
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklist(checklist.map(item =>
      item.id === id ? { ...item, concluido: !item.concluido } : item
    ));
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklist(checklist.filter(item => item.id !== id));
  };

  const handleAddLink = () => {
    if (novoLinkNome.trim() && novoLinkUrl.trim()) {
      setAnexos([
        ...anexos,
        {
          id: `new-${Date.now()}`,
          tipo: 'link',
          nome: novoLinkNome.trim(),
          url: novoLinkUrl.trim(),
        },
      ]);
      setNovoLinkNome("");
      setNovoLinkUrl("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      const filePath = `${userData.user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('user-notas-anexos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-notas-anexos')
        .getPublicUrl(filePath);

      setAnexos([
        ...anexos,
        {
          id: `new-${Date.now()}`,
          tipo: 'arquivo',
          nome: file.name,
          url: filePath,
        },
      ]);
      toast.success("Arquivo anexado!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAnexo = async (anexo: AnexoItem) => {
    if (!anexo.id.startsWith('new-')) {
      await supabase.from('user_notas_anexos').delete().eq('id', anexo.id);
      if (anexo.tipo === 'arquivo') {
        await supabase.storage.from('user-notas-anexos').remove([anexo.url]);
      }
    }
    setAnexos(anexos.filter(a => a.id !== anexo.id));
  };

  const checklistProgress = checklist.length > 0
    ? Math.round((checklist.filter(c => c.concluido).length / checklist.length) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{nota ? "Editar Nota" : "Nova Nota"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 pb-4">
            {/* Título */}
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título da nota..."
              />
            </div>

            {/* Conteúdo */}
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Escreva sua nota aqui..."
                rows={6}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1">
                    {tag}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => handleRemoveTag(tag)} 
                    />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                  placeholder="Nova tag..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Checklist
                </Label>
                {checklist.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {checklistProgress}% concluído
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    <Checkbox
                      checked={item.concluido}
                      onCheckedChange={() => handleToggleChecklistItem(item.id)}
                    />
                    <span className={item.concluido ? "line-through text-muted-foreground flex-1" : "flex-1"}>
                      {item.texto}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={novoChecklistItem}
                  onChange={(e) => setNovoChecklistItem(e.target.value)}
                  placeholder="Novo item..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddChecklistItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Anexos e Links */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Anexos e Links
              </Label>
              <div className="space-y-2">
                {anexos.map((anexo) => (
                  <div key={anexo.id} className="flex items-center gap-2 p-2 bg-muted rounded group">
                    {anexo.tipo === 'link' ? (
                      <Link2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Upload className="h-4 w-4 text-green-600" />
                    )}
                    <span 
                      className="flex-1 text-sm hover:underline truncate cursor-pointer"
                      onClick={async (e) => {
                        e.preventDefault();
                        if (anexo.tipo === 'link') {
                          window.open(anexo.url, '_blank');
                        } else {
                          try {
                            const { data, error } = await supabase.storage
                              .from('user-notas-anexos')
                              .createSignedUrl(anexo.url, 3600);
                            if (error) throw error;
                            window.open(data.signedUrl, '_blank');
                          } catch (err: any) {
                            toast.error('Erro ao abrir arquivo: ' + err.message);
                          }
                        }
                      }}
                    >
                      {anexo.nome}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleRemoveAnexo(anexo)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              
              {/* Adicionar Link */}
              <div className="flex gap-2">
                <Input
                  value={novoLinkNome}
                  onChange={(e) => setNovoLinkNome(e.target.value)}
                  placeholder="Nome do link..."
                  className="flex-1"
                />
                <Input
                  value={novoLinkUrl}
                  onChange={(e) => setNovoLinkUrl(e.target.value)}
                  placeholder="URL..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddLink}>
                  <Link2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Upload de arquivo */}
              <div className="flex gap-2">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !titulo.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}