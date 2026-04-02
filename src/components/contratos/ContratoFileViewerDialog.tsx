import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ZoomableImage } from "./ZoomableImage";

interface ContratoFileViewerDialogProps {
  fileUrl: string | null;
  fileName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContratoFileViewerDialog({ 
  fileUrl: initialFileUrl, 
  fileName: initialFileName, 
  open, 
  onOpenChange 
}: ContratoFileViewerDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  // Verifica se a URL é externa (não do Supabase storage)
  const isExternalUrl = (url: string) => {
    if (!url) return false;
    // Se não contém o domínio do Supabase ou não contém os buckets conhecidos
    const supabaseDomain = 'qyapnxtghhdcfafnogii.supabase.co';
    const knownBuckets = ['/contratos-documentos/', '/licitacoes-anexos/', '/contrato-rascunho-anexos/'];
    
    if (!url.includes(supabaseDomain)) return true;
    return !knownBuckets.some(bucket => url.includes(bucket));
  };

  const getKeyFromUrl = (urlOrKey: string) => {
    if (!urlOrKey) return '';
    if (urlOrKey.startsWith('http')) {
      // Tentar múltiplos buckets
      const buckets = ['/contratos-documentos/', '/licitacoes-anexos/', '/contrato-rascunho-anexos/'];
      for (const marker of buckets) {
        const idx = urlOrKey.indexOf(marker);
        if (idx !== -1) {
          return urlOrKey.substring(idx + marker.length);
        }
      }
      return '';
    }
    return urlOrKey;
  };

  const getBucketFromUrl = (url: string): string => {
    if (url.includes('/contratos-documentos/')) return 'contratos-documentos';
    if (url.includes('/licitacoes-anexos/')) return 'licitacoes-anexos';
    if (url.includes('/contrato-rascunho-anexos/')) return 'contrato-rascunho-anexos';
    return 'contratos-documentos';
  };

  useEffect(() => {
    if (!initialFileUrl || !open) {
      setFileUrl(null);
      return;
    }

    loadFile();
  }, [initialFileUrl, open]);

  const loadFile = async () => {
    if (!initialFileUrl) return;

    setIsLoading(true);
    try {
      // Determinar nome do arquivo
      const fullFileName = initialFileName || initialFileUrl.split('/').pop() || 'arquivo';
      const cleanFileName = fullFileName.replace(/^\d+_/, '');
      const displayName = decodeURIComponent(cleanFileName.replace(/_/g, ' '));
      setFileName(displayName);
      
      const extension = cleanFileName.split('.').pop()?.toLowerCase() || '';
      setFileType(extension);

      // Se for URL externa, usar diretamente
      if (isExternalUrl(initialFileUrl)) {
        setFileUrl(initialFileUrl);
        setIsLoading(false);
        return;
      }

      const key = getKeyFromUrl(initialFileUrl);
      const bucket = getBucketFromUrl(initialFileUrl);

      // Usar signed URL para todos os tipos de arquivo (permite visualização mesmo em buckets privados)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 3600);

      if (signedError) {
        console.error('Erro ao criar signed URL:', signedError);
        // Fallback para download se signed URL falhar
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(key);

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

  const handleDownload = async () => {
    if (!initialFileUrl) return;

    try {
      // Se for URL externa, abrir em nova aba
      if (isExternalUrl(initialFileUrl)) {
        window.open(initialFileUrl, '_blank');
        toast.success('Abrindo arquivo em nova aba');
        return;
      }

      const key = getKeyFromUrl(initialFileUrl);
      const bucket = getBucketFromUrl(initialFileUrl);
      const { data, error } = await supabase.storage.from(bucket).download(key);
      if (error) throw error;
      
      const blob = data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || key;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (e: any) {
      console.error('Erro ao baixar arquivo:', e);
      toast.error('Erro ao baixar arquivo');
    }
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

    // Imagens com zoom via scroll
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(fileType)) {
      return <ZoomableImage src={fileUrl} alt={fileName} />;
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

    // Documentos do Office
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileType)) {
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

    // Arquivos de texto
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
