import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Table, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZoomableImage } from "@/components/contratos/ZoomableImage";

interface LicitacaoFileViewerDialogProps {
  fileUrl: string | null;
  fileName: string | null;
  bucket?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicitacaoFileViewerDialog({ 
  fileUrl: initialFileUrl, 
  fileName: initialFileName,
  bucket = 'licitacoes-anexos',
  open, 
  onOpenChange 
}: LicitacaoFileViewerDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  
  // Estado para visualização de planilhas
  const [spreadsheetData, setSpreadsheetData] = useState<{ sheets: string[]; data: Record<string, any[][]> } | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [spreadsheetError, setSpreadsheetError] = useState<string | null>(null);
  const [isLoadingSpreadsheet, setIsLoadingSpreadsheet] = useState(false);

  const getKeyFromUrl = (urlOrKey: string) => {
    if (!urlOrKey) return '';
    if (urlOrKey.startsWith('http')) {
      // Handle all bucket names
      const markers = ['/licitacoes-anexos/', '/editais-pdfs/', '/lead-anexos/', '/medico-kanban-anexos/', '/medicos-documentos/'];
      for (const marker of markers) {
        const idx = urlOrKey.indexOf(marker);
        if (idx !== -1) {
          return urlOrKey.substring(idx + marker.length);
        }
      }
      return '';
    }
    return urlOrKey;
  };

  const isPublicUrl = (url: string): boolean => {
    return url.startsWith('http') && url.includes('supabase.co/storage/v1/object/public/');
  };

  // Verifica se a URL é externa (não do Supabase storage)
  const isExternalUrl = (url: string): boolean => {
    if (!url || !url.startsWith('http')) return false;
    const supabaseDomain = 'qyapnxtghhdcfafnogii.supabase.co';
    return !url.includes(supabaseDomain);
  };

  useEffect(() => {
    if (!initialFileUrl || !open) {
      setFileUrl(null);
      setSpreadsheetData(null);
      setSpreadsheetError(null);
      return;
    }
    loadFile();
  }, [initialFileUrl, open, bucket]);

  // Carregar dados da planilha quando for xls/xlsx
  useEffect(() => {
    if (!fileUrl || !['xls', 'xlsx'].includes(fileType) || spreadsheetData || spreadsheetError || isLoadingSpreadsheet) {
      return;
    }
    
    const loadSpreadsheet = async () => {
      setIsLoadingSpreadsheet(true);
      try {
        setSpreadsheetError(null);
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Erro ao carregar planilha');
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        const sheets = workbook.SheetNames;
        const data: Record<string, any[][]> = {};
        
        for (const sheetName of sheets) {
          const worksheet = workbook.Sheets[sheetName];
          data[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        }
        
        setSpreadsheetData({ sheets, data });
        setActiveSheet(sheets[0] || '');
      } catch (error) {
        console.error('Erro ao processar planilha:', error);
        setSpreadsheetError('Não foi possível processar a planilha. Tente fazer o download.');
      } finally {
        setIsLoadingSpreadsheet(false);
      }
    };
    
    loadSpreadsheet();
  }, [fileUrl, fileType, spreadsheetData, spreadsheetError, isLoadingSpreadsheet]);

  const loadFile = async () => {
    if (!initialFileUrl) return;

    setIsLoading(true);
    try {
      const fullFileName = initialFileName || initialFileUrl.split('/').pop() || 'arquivo';
      const cleanFileName = fullFileName.replace(/^\d+_/, '');
      const displayName = decodeURIComponent(cleanFileName.replace(/_/g, ' '));
      setFileName(displayName);
      
      const extension = cleanFileName.split('.').pop()?.toLowerCase() || '';
      setFileType(extension);

      // Se é uma URL externa (não do Supabase), usar diretamente
      if (isExternalUrl(initialFileUrl)) {
        setFileUrl(initialFileUrl);
        setIsLoading(false);
        return;
      }

      // Se é uma URL pública do Supabase, usar fetch direto
      if (isPublicUrl(initialFileUrl)) {
        if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
          // Office files podem usar a URL diretamente
          setFileUrl(initialFileUrl);
        } else {
          // Para outros arquivos, fazer fetch e criar blob URL
          const response = await fetch(initialFileUrl);
          if (!response.ok) throw new Error('Erro ao carregar arquivo');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setFileUrl(url);
        }
      } else {
        // Arquivos no storage - usar API do Supabase com signed URLs para todos os tipos
        const key = getKeyFromUrl(initialFileUrl);
        
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
      // Se é URL externa, abrir em nova aba
      if (isExternalUrl(initialFileUrl)) {
        window.open(initialFileUrl, '_blank');
        toast.success('Abrindo arquivo em nova aba');
        return;
      }

      let blob: Blob;
      
      // Se é uma URL pública, usar fetch direto
      if (isPublicUrl(initialFileUrl)) {
        const response = await fetch(initialFileUrl);
        if (!response.ok) throw new Error('Erro ao baixar arquivo');
        blob = await response.blob();
      } else {
        const key = getKeyFromUrl(initialFileUrl);
        const { data, error } = await supabase.storage.from(bucket).download(key);
        if (error) throw error;
        blob = data as Blob;
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || initialFileUrl.split('/').pop() || 'arquivo';
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

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(fileType)) {
      return <ZoomableImage src={fileUrl} alt={fileName} />;
    }

    if (fileType === 'pdf') {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[80vh] rounded-lg border"
          title={fileName}
        />
      );
    }

    if (['xls', 'xlsx'].includes(fileType)) {
      // Para planilhas Excel, usar visualizador nativo
      
      // Carregar dados da planilha se ainda não carregou
      if (isLoadingSpreadsheet || (!spreadsheetData && !spreadsheetError)) {
        return (
          <div className="flex items-center justify-center h-[600px]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Processando planilha...</span>
            </div>
          </div>
        );
      }

      if (spreadsheetError) {
        return (
          <div className="flex flex-col items-center justify-center h-[400px] space-y-4 bg-muted/20 rounded-lg">
            <div className="text-center space-y-2">
              <Table className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-lg font-medium">Planilha Excel</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
              <p className="text-xs text-destructive">{spreadsheetError}</p>
            </div>
            <Button onClick={handleDownload} size="lg">
              <Download className="h-5 w-5 mr-2" />
              Baixar Planilha
            </Button>
          </div>
        );
      }

      if (spreadsheetData) {
        const currentSheetData = spreadsheetData.data[activeSheet] || [];
        const headers = currentSheetData[0] || [];
        const rows = currentSheetData.slice(1);
        
        return (
          <div className="space-y-3">
            {/* Seletor de abas */}
            {spreadsheetData.sheets.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Aba:</span>
                <Select value={activeSheet} onValueChange={setActiveSheet}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spreadsheetData.sheets.map((sheet) => (
                      <SelectItem key={sheet} value={sheet}>
                        {sheet}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Tabela de dados */}
            <ScrollArea className="h-[65vh] rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground border-b w-12">#</th>
                      {headers.map((header: any, idx: number) => (
                        <th key={idx} className="px-3 py-2 text-left font-medium border-b whitespace-nowrap">
                          {header ?? `Col ${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((row: any[], rowIdx: number) => (
                      <tr key={rowIdx} className="hover:bg-muted/30 border-b">
                        <td className="px-3 py-2 text-muted-foreground text-xs">{rowIdx + 1}</td>
                        {headers.map((_: any, colIdx: number) => (
                          <td key={colIdx} className="px-3 py-2 whitespace-nowrap max-w-[300px] truncate">
                            {row[colIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 500 && (
                <div className="p-3 text-center text-sm text-muted-foreground bg-muted/20">
                  Mostrando primeiras 500 linhas de {rows.length.toLocaleString('pt-BR')} total
                </div>
              )}
            </ScrollArea>
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {rows.length.toLocaleString('pt-BR')} linhas • {headers.length} colunas
              </span>
              <Button onClick={handleDownload} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Baixar Planilha
              </Button>
            </div>
          </div>
        );
      }
    }

    if (['doc', 'docx', 'ppt', 'pptx'].includes(fileType)) {
      // Google Docs Viewer funciona com URLs públicas e signed URLs (ambas são acessíveis publicamente)
      const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
      
      return (
        <div className="space-y-4">
          <iframe
            src={viewerUrl}
            className="w-full h-[80vh] rounded-lg border bg-background"
            title={fileName}
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

    if (['txt', 'csv', 'log', 'json', 'xml', 'md'].includes(fileType)) {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[600px] rounded-lg border bg-white"
          title={fileName}
        />
      );
    }

    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileType)) {
      return (
        <div className="flex flex-col items-center justify-center h-[600px] space-y-4 bg-muted/20 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Arquivo Compactado</p>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>
          <Button onClick={handleDownload} size="lg">
            <Download className="h-5 w-5 mr-2" />
            Baixar Arquivo
          </Button>
        </div>
      );
    }

    return (
      <div className="bg-muted/50 p-6 rounded-lg text-center h-[400px] flex flex-col items-center justify-center">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-lg font-medium">Tipo de arquivo: .{fileType}</p>
            <p className="text-sm text-muted-foreground">{fileName}</p>
            <p className="text-xs text-muted-foreground">Visualização não disponível</p>
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