import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Paperclip, Trash2, Download, Eye, File, FileText, Image, CalendarClock, Edit2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LicitacaoFileViewerDialog } from "@/components/licitacoes/LicitacaoFileViewerDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// File icons mapping
import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";

interface LeadAnexosSectionProps {
  leadId: string;
}

const FILE_ICONS: Record<string, string> = {
  pdf: pdfIcon,
  doc: docIcon,
  docx: docxIcon,
  xls: xlsIcon,
  xlsx: xlsxIcon,
  jpg: jpgIcon,
  jpeg: jpgIcon,
  png: pngIcon,
};

function getFileIcon(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || null;
}

function getFileIconComponent(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
  
  if (imageExts.includes(ext)) return Image;
  if (docExts.includes(ext)) return FileText;
  return File;
}

export function LeadAnexosSection({ leadId }: LeadAnexosSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [validadeDateOpen, setValidadeDateOpen] = useState<string | null>(null);

  // Fetch attachments - sempre refetch quando componente monta para garantir dados atualizados
  const { data: anexos, isLoading } = useQuery({
    queryKey: ['lead-anexos', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_anexos')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Detectar bucket correto baseado na URL do anexo
  const getBucketFromUrl = (url: string): string => {
    if (url.startsWith('medico-kanban-anexos/')) {
      return 'medico-kanban-anexos';
    }
    return 'lead-anexos';
  };

  const getPathFromUrl = (url: string): string => {
    if (url.startsWith('medico-kanban-anexos/')) {
      return url.replace('medico-kanban-anexos/', '');
    }
    // URL pública - extrair path
    if (url.includes('/lead-anexos/')) {
      return url.split('/lead-anexos/').pop() || url;
    }
    return url;
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (anexoId: string) => {
      const anexo = anexos?.find(a => a.id === anexoId);
      if (anexo?.arquivo_url) {
        const bucket = getBucketFromUrl(anexo.arquivo_url);
        const path = getPathFromUrl(anexo.arquivo_url);
        await supabase.storage.from(bucket).remove([path]);
      }
      
      const { error } = await supabase
        .from('lead_anexos')
        .delete()
        .eq('id', anexoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-anexos', leadId] });
      toast.success('Anexo removido com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover anexo');
    },
  });

  // Rename mutation
  const renameMutation = useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      const { error } = await supabase
        .from('lead_anexos')
        .update({ arquivo_nome: newName } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-anexos', leadId] });
      toast.success('Nome atualizado');
      setEditingNameId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao renomear');
    },
  });

  // Validade mutation
  const validadeMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: Date | null }) => {
      const { error } = await supabase
        .from('lead_anexos')
        .update({ data_validade: date ? format(date, 'yyyy-MM-dd') : null } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-anexos', leadId] });
      toast.success('Validade atualizada');
      setValidadeDateOpen(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar validade');
    },
  });

  const uploadFile = async (file: File) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: profile } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', user.id)
      .single();

    const fileExt = file.name.split('.').pop();
    const fileName = `${leadId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('lead-anexos')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('lead-anexos')
      .getPublicUrl(fileName);

    const { error: insertError } = await supabase
      .from('lead_anexos')
      .insert({
        lead_id: leadId,
        arquivo_nome: file.name,
        arquivo_url: publicUrl,
        arquivo_tipo: file.type,
        arquivo_tamanho: file.size,
        usuario_id: user.id,
        usuario_nome: profile?.nome_completo || 'Usuário',
      });

    if (insertError) throw insertError;
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
      queryClient.invalidateQueries({ queryKey: ['lead-anexos', leadId] });
      toast.success('Arquivo(s) enviado(s) com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const getPublicUrl = (url: string): string => {
    // Se já é uma URL pública completa
    if (url.startsWith('http')) return url;
    
    // Se é um path de storage
    const bucket = getBucketFromUrl(url);
    const path = getPathFromUrl(url);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      const publicUrl = getPublicUrl(url);
      const response = await fetch(publicUrl);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      toast.error('Erro ao baixar arquivo');
    }
  };

  const truncateFileName = (name: string, maxLength: number = 30) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncated = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncated}.${ext}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-2">
          Arraste arquivos aqui ou
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-2"
        >
          <Paperclip className="h-4 w-4" />
          {uploading ? 'Enviando...' : 'Selecionar Arquivos'}
        </Button>
      </div>

      {/* File List - Horizontal Scroll */}
      {anexos && anexos.length > 0 ? (
        <div className="space-y-3 w-full max-w-full overflow-hidden">
          <p className="text-sm font-medium">Anexos Existentes:</p>
          <div 
            className="anexos-horizontal-scroll flex gap-3 pb-4"
            style={{
              overflowX: 'auto',
              overflowY: 'hidden',
              maxWidth: '100%',
              width: '100%'
            }}
          >
            {anexos.map((anexo) => {
              const iconSrc = getFileIcon(anexo.arquivo_nome);
              const IconComponent = getFileIconComponent(anexo.arquivo_nome);
              
              const dataValidade = (anexo as any).data_validade;
              const validadeDate = dataValidade ? new Date(dataValidade + 'T12:00:00') : null;
              const hoje = new Date();
              const diffDays = validadeDate ? Math.ceil((validadeDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const isVencido = diffDays !== null && diffDays < 0;
              const isProximo = diffDays !== null && diffDays >= 0 && diffDays <= 30;

              return (
                <div 
                  key={anexo.id} 
                  className="relative flex-shrink-0 w-44 flex flex-col bg-background rounded-lg border-2 border-border hover:border-primary transition-colors shadow-sm overflow-hidden"
                >
                  {/* Botão de deletar */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 z-10 bg-background/90 hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                    onClick={() => {
                      if (confirm('Deseja remover este anexo?')) {
                        deleteMutation.mutate(anexo.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>

                  {/* Ícone do arquivo - Clicável para visualizar */}
                  <button
                    onClick={() => {
                      if ((anexo as any).arquivo_tipo === 'link_externo') {
                        window.open(anexo.arquivo_url, '_blank', 'noopener,noreferrer');
                      } else {
                        setPreviewFile({ url: getPublicUrl(anexo.arquivo_url), name: anexo.arquivo_nome });
                      }
                    }}
                    className="flex items-center justify-center p-4 hover:bg-muted/50 transition-colors border-b"
                    title={(anexo as any).arquivo_tipo === 'link_externo' ? 'Abrir link externo' : 'Clique para visualizar'}
                  >
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className="h-12 w-12 object-contain" />
                    ) : (
                      <IconComponent className="h-12 w-12 text-muted-foreground" />
                    )}
                  </button>

                  {/* Info section */}
                  <div className="flex flex-col items-center gap-0.5 p-2 border-b">
                    {editingNameId === anexo.id ? (
                      <div className="flex items-center gap-1 w-full px-1">
                        <Input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          className="h-6 text-xs px-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameMutation.mutate({ id: anexo.id, newName: editNameValue });
                            if (e.key === 'Escape') setEditingNameId(null);
                          }}
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => renameMutation.mutate({ id: anexo.id, newName: editNameValue })}>
                          <Check className="h-3 w-3 text-green-600" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingNameId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if ((anexo as any).arquivo_tipo === 'link_externo') {
                            window.open(anexo.arquivo_url, '_blank', 'noopener,noreferrer');
                          } else {
                            handleDownload(anexo.arquivo_url, anexo.arquivo_nome);
                          }
                        }}
                        className="hover:bg-muted/50 transition-colors w-full"
                        title={(anexo as any).arquivo_tipo === 'link_externo' ? 'Abrir link externo' : 'Clique para baixar'}
                      >
                        <p className="text-xs font-medium text-primary hover:underline truncate w-full text-center px-1">
                          {truncateFileName(anexo.arquivo_nome, 18)}
                        </p>
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Upload: {format(new Date(anexo.created_at), "dd/MM/yy", { locale: ptBR })}
                    </p>
                    {/* Validade visual */}
                    {validadeDate && (
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5",
                        isVencido 
                          ? "bg-destructive/10 text-destructive" 
                          : isProximo 
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" 
                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      )}>
                        {isVencido ? '⚠ Vencido' : isProximo ? '⏳ Vence breve' : '✓ Válido'}: {format(validadeDate, 'dd/MM/yy')}
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-center gap-1 p-1.5">
                    <Popover open={validadeDateOpen === anexo.id} onOpenChange={(open) => setValidadeDateOpen(open ? anexo.id : null)}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2" title="Definir validade">
                          <CalendarClock className="h-3 w-3" />
                          Validade
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center">
                        <Calendar
                          mode="single"
                          selected={validadeDate || undefined}
                          onSelect={(date) => {
                            validadeMutation.mutate({ id: anexo.id, date: date || null });
                          }}
                          className={cn("p-3 pointer-events-auto")}
                          locale={ptBR}
                        />
                        {validadeDate && (
                          <div className="px-3 pb-3">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm" 
                              className="w-full text-xs"
                              onClick={() => validadeMutation.mutate({ id: anexo.id, date: null })}
                            >
                              Remover validade
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] gap-1 px-2"
                      title="Renomear"
                      onClick={() => {
                        setEditingNameId(anexo.id);
                        setEditNameValue(anexo.arquivo_nome);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                      Renomear
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/20 p-8 text-center">
          <Paperclip className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhum arquivo anexado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Arraste arquivos ou clique para selecionar
          </p>
        </div>
      )}

      {/* File Viewer Dialog */}
      <LicitacaoFileViewerDialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
        bucket="lead-anexos"
      />
    </div>
  );
}
