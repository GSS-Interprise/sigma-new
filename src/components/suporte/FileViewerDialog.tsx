import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FileViewerDialogProps {
  filePath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileViewerDialog({ filePath, open, onOpenChange }: FileViewerDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!filePath || !open) {
      setFileUrl(null);
      return;
    }

    loadFile();
  }, [filePath, open]);

  const loadFile = async () => {
    if (!filePath) return;

    setIsLoading(true);
    try {
      // Extrair e formatar o nome do arquivo primeiro
      const fullFileName = filePath.split('/').pop() || 'arquivo';
      const cleanFileName = fullFileName.replace(/^\d+_/, '');
      const displayName = cleanFileName.replace(/_/g, ' ');
      setFileName(displayName);
      
      const extension = cleanFileName.split('.').pop()?.toLowerCase() || '';
      setFileType(extension);

      // Usar signed URL para todos os tipos de arquivo (permite visualização mesmo em buckets privados)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('suporte-anexos')
        .createSignedUrl(filePath, 3600);

      if (signedError) {
        console.error('Erro ao criar signed URL:', signedError);
        // Fallback para download se signed URL falhar
        const { data, error } = await supabase.storage
          .from('suporte-anexos')
          .download(filePath);

        if (error) throw error;
        const url = URL.createObjectURL(data);
        setFileUrl(url);
      } else {
        setFileUrl(signedData.signedUrl);
      }
    } catch (error) {
      console.error('Erro ao carregar arquivo:', error);
      toast.error('Erro ao carregar arquivo');
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!fileUrl || !fileName) return;

    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download iniciado');
  };

  const renderFileContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[600px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!fileUrl) return null;

    // Imagens
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(fileType)) {
      return (
        <div className="flex items-center justify-center bg-muted/20 rounded-lg p-4 min-h-[80vh]">
          <img 
            src={fileUrl} 
            alt={fileName}
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg"
          />
        </div>
      );
    }

    // PDFs
    if (fileType === 'pdf') {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[80vh] rounded-lg border"
          title={fileName}
        />
      );
    }

    // Documentos do Office (Word, Excel, PowerPoint) - usar Office Online Viewer
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileType)) {
      // Usar o visualizador do Google Docs que suporta Office
      const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
      
      return (
        <div className="space-y-4">
          <iframe
            src={viewerUrl}
            className="w-full h-[80vh] rounded-lg border bg-background"
            title={fileName}
            onError={() => {
              toast.error('Erro ao carregar visualização. Tente fazer o download.');
            }}
          />
          <div className="flex justify-center">
            <Button onClick={handleDownload} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Baixar Documento
            </Button>
          </div>
        </div>
      );
    }

    // Arquivos de texto - renderizar com melhor formatação
    if (['txt', 'csv', 'log', 'json', 'xml', 'md'].includes(fileType)) {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[600px] rounded-lg border bg-white"
          title={fileName}
        />
      );
    }

    // Arquivos compactados
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileType)) {
      return (
        <div className="flex flex-col items-center justify-center h-[600px] space-y-4 bg-muted/20 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Arquivo Compactado</p>
            <p className="text-sm text-muted-foreground">
              {fileName}
            </p>
          </div>
          <Button onClick={handleDownload} size="lg">
            <Download className="h-5 w-5 mr-2" />
            Baixar Arquivo
          </Button>
        </div>
      );
    }

    // Outros tipos de arquivo
    return (
      <div className="bg-muted/50 p-6 rounded-lg text-center h-[400px] flex flex-col items-center justify-center">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-lg font-medium">Tipo de arquivo: .{fileType}</p>
            <p className="text-sm text-muted-foreground">
              {fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              Visualização não disponível para este formato
            </p>
          </div>
          <Button onClick={handleDownload} size="lg">
            <Download className="h-5 w-5 mr-2" />
            Baixar Arquivo
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[98vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader className="pr-14 md:pr-16">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <DialogTitle className="text-lg truncate flex-1 min-w-0">{fileName}</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!fileUrl}
              className="flex-shrink-0"
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {renderFileContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
