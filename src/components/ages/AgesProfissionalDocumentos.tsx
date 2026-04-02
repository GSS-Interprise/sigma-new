import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Link2, Loader2, File, FileText, Image, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { LicitacaoFileViewerDialog } from "@/components/licitacoes/LicitacaoFileViewerDialog";

import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";

interface AgesProfissionalDocumentosProps {
  profissionalId: string;
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
    return <Image className="h-10 w-10 text-green-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <FileArchive className="h-10 w-10 text-yellow-500" />;
  }
  if (['pdf'].includes(extension)) {
    return <FileText className="h-10 w-10 text-red-500" />;
  }
  if (['doc', 'docx'].includes(extension)) {
    return <FileText className="h-10 w-10 text-blue-500" />;
  }
  if (['xls', 'xlsx'].includes(extension)) {
    return <FileText className="h-10 w-10 text-green-600" />;
  }
  return <File className="h-10 w-10 text-muted-foreground" />;
};

const sanitizeFileName = (fileName: string): string => {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
};

const truncateFileName = (name: string, maxLength: number = 18) => {
  if (name.length <= maxLength) return name;
  const ext = name.split('.').pop() || '';
  const baseName = name.slice(0, name.lastIndexOf('.'));
  const truncated = baseName.slice(0, maxLength - ext.length - 4) + '...';
  return `${truncated}.${ext}`;
};

const AgesProfissionalDocumentos = ({ profissionalId }: AgesProfissionalDocumentosProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNome, setLinkNome] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["ages-profissional-documentos", profissionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_profissionais_documentos")
        .select("*")
        .eq("profissional_id", profissionalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      // Tentar remover do storage se não for link externo
      if (!isLink(doc.arquivo_url)) {
        try {
          const path = doc.arquivo_url.split('/ages-documentos/').pop();
          if (path) {
            await supabase.storage.from("ages-documentos").remove([path]);
          }
        } catch (e) {
          console.error("Erro ao remover do storage:", e);
        }
      }
      const { error } = await supabase
        .from("ages_profissionais_documentos")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-profissional-documentos", profissionalId] });
      toast.success("Documento removido");
    },
    onError: () => {
      toast.error("Erro ao remover documento");
    },
  });

  const processFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    
    for (const file of files) {
      try {
        const sanitizedName = sanitizeFileName(file.name);
        const filePath = `profissionais/${profissionalId}/${Date.now()}_${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
          .from("ages-documentos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("ages-documentos")
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from("ages_profissionais_documentos")
          .insert({
            profissional_id: profissionalId,
            tipo_documento: "Documento",
            arquivo_nome: file.name,
            arquivo_url: urlData.publicUrl,
            uploaded_by: user?.id,
          });

        if (dbError) throw dbError;
        toast.success(`${file.name} enviado`);
      } catch (error) {
        console.error(error);
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ["ages-profissional-documentos", profissionalId] });
    setUploading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [profissionalId, user?.id]);

  const handleAddLink = async () => {
    if (!linkUrl || !linkNome) {
      toast.error("Preencha o nome e URL do link");
      return;
    }

    setUploading(true);
    try {
      const { error: dbError } = await supabase
        .from("ages_profissionais_documentos")
        .insert({
          profissional_id: profissionalId,
          tipo_documento: "Link do Drive",
          arquivo_nome: linkNome,
          arquivo_url: linkUrl,
          uploaded_by: user?.id,
        });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["ages-profissional-documentos", profissionalId] });
      toast.success("Link adicionado");
      setLinkUrl("");
      setLinkNome("");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao adicionar link");
    } finally {
      setUploading(false);
    }
  };

  const isLink = (url: string) => {
    return url.includes("drive.google.com") || url.includes("docs.google.com") || !url.includes("supabase");
  };

  const handlePreview = (doc: any) => {
    if (isLink(doc.arquivo_url)) {
      window.open(doc.arquivo_url, "_blank");
    } else {
      setSelectedFile({ url: doc.arquivo_url, name: doc.arquivo_nome });
      setViewerOpen(true);
    }
  };

  const handleDownload = async (doc: any) => {
    if (isLink(doc.arquivo_url)) {
      window.open(doc.arquivo_url, "_blank");
      return;
    }
    
    try {
      const path = doc.arquivo_url.split('/ages-documentos/').pop();
      if (!path) throw new Error("Path inválido");
      
      const { data, error } = await supabase.storage
        .from("ages-documentos")
        .download(path);
      
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.arquivo_nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao baixar arquivo');
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-sm">Anexar Documentos</h4>
      
      {/* Área de drag-and-drop */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {uploading ? "Enviando..." : "Arraste arquivos aqui ou clique para selecionar"}
          </p>
          <p className="text-xs text-muted-foreground">
            Múltiplos arquivos permitidos
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, imagens (JPG, PNG, GIF, BMP, WEBP, SVG), TXT, CSV, ZIP, RAR (máx. 50MB por arquivo)
      </p>

      {/* Adicionar link */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          Adicionar Link do Drive
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nome do Documento</Label>
            <Input
              value={linkNome}
              onChange={(e) => setLinkNome(e.target.value)}
              placeholder="Ex: Diploma Registrado"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">URL do Link</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="h-9"
            />
          </div>
        </div>
        <Button 
          onClick={handleAddLink} 
          disabled={uploading || !linkUrl || !linkNome}
          size="sm"
          className="gap-2"
        >
          <Link2 className="h-4 w-4" />
          Adicionar Link
        </Button>
      </div>

      {/* Anexos existentes */}
      <div>
        <h4 className="font-medium text-sm mb-3">Anexos Existentes:</h4>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documentos.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            Nenhum documento enviado
          </div>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {documentos.map((doc) => {
              const iconSrc = !isLink(doc.arquivo_url) ? getFileIcon(doc.arquivo_nome) : null;
              return (
                <div
                  key={doc.id}
                  className="group relative flex flex-col items-center gap-1 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors w-[120px]"
                >
                  {/* Botão X para remover */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteMutation.mutate(doc)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>

                  <div
                    className="cursor-pointer"
                    onClick={() => handlePreview(doc)}
                  >
                    {isLink(doc.arquivo_url) ? (
                      <Link2 className="h-10 w-10 text-blue-500" />
                    ) : iconSrc ? (
                      <img src={iconSrc} alt="" className="h-10 w-10 object-contain" />
                    ) : (
                      getFileIconComponent(doc.arquivo_nome)
                    )}
                  </div>
                  
                  <span 
                    className="text-xs text-center truncate w-full cursor-pointer"
                    onClick={() => handlePreview(doc)}
                    title={doc.arquivo_nome}
                  >
                    {truncateFileName(doc.arquivo_nome)}
                  </span>
                  
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(doc.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LicitacaoFileViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={selectedFile?.url || null}
        fileName={selectedFile?.name || null}
        bucket="ages-documentos"
      />
    </div>
  );
};

export default AgesProfissionalDocumentos;
