import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Upload, Download, Trash2, Loader2, FileText, Image, FileArchive, File, Eye } from "lucide-react";
import { toast } from "sonner";
import { LicitacaoFileViewerDialog } from "@/components/licitacoes/LicitacaoFileViewerDialog";
import { cn } from "@/lib/utils";
import { registrarAuditoria } from "@/lib/auditLogger";

import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";

interface MedicoKanbanAnexosProps {
  cardId: string;
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
  gif: gifIcon,
  bmp: bmpIcon,
};

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[extension];
};

const getFileIconComponent = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
    return <Image className="h-8 w-8 text-green-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <FileArchive className="h-8 w-8 text-yellow-500" />;
  }
  if (['pdf'].includes(extension)) {
    return <FileText className="h-8 w-8 text-red-500" />;
  }
  if (['doc', 'docx'].includes(extension)) {
    return <FileText className="h-8 w-8 text-blue-500" />;
  }
  if (['xls', 'xlsx'].includes(extension)) {
    return <FileText className="h-8 w-8 text-green-600" />;
  }
  return <File className="h-8 w-8 text-muted-foreground" />;
};

export function MedicoKanbanAnexos({ cardId }: MedicoKanbanAnexosProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: anexos, isLoading } = useQuery({
    queryKey: ['medico-kanban-anexos', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_kanban_card_anexos')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!cardId,
  });

  const uploadFile = useCallback(async (file: File) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', userId)
      .single();

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${cardId}/${timestamp}_${safeName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('medico-kanban-anexos')
      .upload(filePath, file);
    
    if (uploadError) throw uploadError;

    const { data: insertedAnexo, error: dbError } = await supabase
      .from('medico_kanban_card_anexos')
      .insert({
        card_id: cardId,
        arquivo_nome: file.name,
        arquivo_url: filePath,
        usuario_id: userId,
        usuario_nome: profile?.nome_completo || 'Usuário',
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Registrar atividade de anexo
    await registrarAuditoria({
      modulo: 'medicos_kanban',
      tabela: 'medico_kanban_card_anexos',
      acao: 'anexar',
      registroId: cardId,
      registroDescricao: file.name,
      detalhes: `Anexo adicionado: ${file.name}`,
    });
  }, [cardId]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
      queryClient.invalidateQueries({ queryKey: ['medico-kanban-anexos', cardId] });
      toast.success('Arquivo(s) enviado(s) com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (anexo: { id: string; arquivo_url: string; arquivo_nome: string }) => {
      const { error: storageError } = await supabase.storage
        .from('medico-kanban-anexos')
        .remove([anexo.arquivo_url]);
      
      if (storageError) console.error('Erro ao remover do storage:', storageError);

      const { error: dbError } = await supabase
        .from('medico_kanban_card_anexos')
        .delete()
        .eq('id', anexo.id);

      if (dbError) throw dbError;

      // Registrar atividade de remoção de anexo
      await registrarAuditoria({
        modulo: 'medicos_kanban',
        tabela: 'medico_kanban_card_anexos',
        acao: 'remover_anexo',
        registroId: cardId,
        registroDescricao: anexo.arquivo_nome,
        detalhes: `Anexo removido: ${anexo.arquivo_nome}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-kanban-anexos', cardId] });
      toast.success('Arquivo removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover arquivo');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      handleUploadFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUploadFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDownload = async (anexo: { arquivo_nome: string; arquivo_url: string }) => {
    try {
      const { data, error } = await supabase.storage
        .from('medico-kanban-anexos')
        .download(anexo.arquivo_url);
      
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = anexo.arquivo_nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao baixar arquivo');
    }
  };

  const handlePreview = (anexo: { arquivo_nome: string; arquivo_url: string }) => {
    setSelectedFile({ url: anexo.arquivo_url, name: anexo.arquivo_nome });
    setViewerOpen(true);
  };

  const truncateFileName = (name: string, maxLength: number = 18) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.lastIndexOf('.'));
    const truncated = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncated}.${ext}`;
  };

  return (
    <div 
      className={cn(
        "border rounded-lg bg-muted/30 transition-colors",
        isDragging && "border-primary border-2 bg-primary/5"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="p-3 flex items-center justify-between border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Anexos ({anexos?.length || 0})
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : anexos && anexos.length > 0 ? (
        <ScrollArea className="h-[120px]">
          <div className="p-3 flex gap-2 flex-wrap">
            {anexos.map((anexo) => {
              const iconSrc = getFileIcon(anexo.arquivo_nome);
              return (
                <div
                  key={anexo.id}
                  className="group relative flex flex-col items-center gap-1 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors w-[90px]"
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => handlePreview(anexo)}
                  >
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      getFileIconComponent(anexo.arquivo_nome)
                    )}
                  </div>
                  
                  <span 
                    className="text-xs text-center truncate w-full cursor-pointer"
                    onClick={() => handlePreview(anexo)}
                    title={anexo.arquivo_nome}
                  >
                    {truncateFileName(anexo.arquivo_nome)}
                  </span>

                  <div className="flex gap-0.5 mt-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => handlePreview(anexo)}
                      title="Visualizar"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => handleDownload(anexo)}
                      title="Download"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(anexo)}
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <div 
          className={cn(
            "py-6 text-center transition-colors cursor-pointer",
            isDragging ? "text-primary" : "text-muted-foreground"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">
            {isDragging ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para adicionar"}
          </p>
        </div>
      )}

      <LicitacaoFileViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={selectedFile?.url || null}
        fileName={selectedFile?.name || null}
        bucket="medico-kanban-anexos"
      />
    </div>
  );
}
