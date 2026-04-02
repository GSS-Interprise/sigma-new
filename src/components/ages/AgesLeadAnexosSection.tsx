import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, Paperclip, Trash2, File, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LicitacaoFileViewerDialog } from "@/components/licitacoes/LicitacaoFileViewerDialog";

// File icons mapping
import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";

interface AgesLeadAnexosSectionProps {
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

export function AgesLeadAnexosSection({ leadId }: AgesLeadAnexosSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

  const { data: anexos, isLoading } = useQuery({
    queryKey: ['ages-lead-anexos', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_lead_anexos')
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

  const getBucketFromUrl = (url: string): string => {
    return 'ages-documentos';
  };

  const getPathFromUrl = (url: string): string => {
    if (url.includes('/ages-documentos/')) {
      return url.split('/ages-documentos/').pop() || url;
    }
    return url;
  };

  const deleteMutation = useMutation({
    mutationFn: async (anexoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user?.id)
        .single();

      const anexo = anexos?.find(a => a.id === anexoId);
      
      if (anexo?.arquivo_url) {
        const path = getPathFromUrl(anexo.arquivo_url);
        await supabase.storage.from('ages-documentos').remove([path]);
      }
      
      const { error } = await supabase
        .from('ages_lead_anexos')
        .delete()
        .eq('id', anexoId);
      
      if (error) throw error;

      if (anexo) {
        await supabase.from('ages_lead_historico').insert({
          lead_id: leadId,
          tipo_evento: 'documento_removido',
          descricao_resumida: `Documento removido: ${anexo.arquivo_nome}`,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-lead-anexos', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      toast.success('Arquivo removido!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover arquivo');
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
      .from('ages-documentos')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('ages-documentos')
      .getPublicUrl(fileName);

    const { error: insertError } = await supabase
      .from('ages_lead_anexos')
      .insert({
        lead_id: leadId,
        arquivo_nome: file.name,
        arquivo_url: publicUrl,
        uploaded_by: user.id,
        uploaded_by_nome: profile?.nome_completo || 'Usuário',
      });

    if (insertError) throw insertError;

    // Log history
    await supabase.from('ages_lead_historico').insert({
      lead_id: leadId,
      tipo_evento: 'documento_anexado',
      descricao_resumida: `Documento anexado: ${file.name}`,
      usuario_id: user.id,
      usuario_nome: profile?.nome_completo,
    });
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
      queryClient.invalidateQueries({ queryKey: ['ages-lead-anexos', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      toast.success('Arquivo(s) enviado(s) com sucesso!');
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
    if (url.startsWith('http')) return url;
    const path = getPathFromUrl(url);
    const { data } = supabase.storage.from('ages-documentos').getPublicUrl(path);
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

  const truncateFileName = (name: string, maxLength: number = 16) => {
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
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
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
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={uploading}
          className="gap-2"
        >
          <Paperclip className="h-4 w-4" />
          {uploading ? 'Enviando...' : 'Selecionar Arquivos'}
        </Button>
      </div>

      {/* File List - Horizontal Scroll with Cards */}
      {anexos && anexos.length > 0 ? (
        <div className="space-y-3 w-full max-w-full overflow-hidden">
          <p className="text-sm font-medium">Anexos Existentes:</p>
          <div 
            className="flex gap-3 pb-4"
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
              
              return (
                <div 
                  key={anexo.id} 
                  className="relative flex-shrink-0 w-36 flex flex-col bg-background rounded-lg border-2 border-border hover:border-primary transition-colors shadow-sm overflow-hidden"
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
                    onClick={() => setPreviewFile({ url: getPublicUrl(anexo.arquivo_url), name: anexo.arquivo_nome })}
                    className="flex items-center justify-center p-4 hover:bg-muted/50 transition-colors border-b"
                    title="Clique para visualizar"
                  >
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className="h-12 w-12 object-contain" />
                    ) : (
                      <IconComponent className="h-12 w-12 text-muted-foreground" />
                    )}
                  </button>

                  {/* Nome do arquivo - Clicável para baixar */}
                  <button
                    onClick={() => handleDownload(anexo.arquivo_url, anexo.arquivo_nome)}
                    className="flex flex-col items-center gap-0.5 p-2 hover:bg-muted/50 transition-colors"
                    title="Clique para baixar"
                  >
                    <p className="text-xs font-medium text-primary hover:underline truncate w-full text-center px-1">
                      {truncateFileName(anexo.arquivo_nome)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(anexo.created_at), "dd/MM/yy", { locale: ptBR })}
                    </p>
                  </button>
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
        bucket="ages-documentos"
      />
    </div>
  );
}
