import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Upload, Download, Trash2, Loader2, FileText, Image, FileArchive, File, Eye, Link2, Send } from "lucide-react";
import { toast } from "sonner";
import { LicitacaoFileViewerDialog } from "./LicitacaoFileViewerDialog";

import * as pdfjsLib from "pdfjs-dist";

import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";

// Configurar worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface LicitacaoAnexosBarProps {
  licitacaoId: string;
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

const getFileIconComponent = (fileName: string, size: "sm" | "lg" = "lg") => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const sizeClass = size === "lg" ? "h-16 w-16" : "h-8 w-8";
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
    return <Image className={`${sizeClass} text-green-500`} />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <FileArchive className={`${sizeClass} text-yellow-500`} />;
  }
  if (['pdf'].includes(extension)) {
    return <FileText className={`${sizeClass} text-red-500`} />;
  }
  if (['doc', 'docx'].includes(extension)) {
    return <FileText className={`${sizeClass} text-blue-500`} />;
  }
  if (['xls', 'xlsx'].includes(extension)) {
    return <FileText className={`${sizeClass} text-green-600`} />;
  }
  return <File className={`${sizeClass} text-muted-foreground`} />;
};

// Sanitiza nome do arquivo removendo caracteres especiais e acentos brasileiros
const sanitizeFileName = (fileName: string): string => {
  const normalized = fileName.normalize('NFD');
  const withoutAccents = normalized.replace(/[\u0300-\u036f]/g, '');
  const sanitized = withoutAccents.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.replace(/_+/g, '_');
};

// Verifica se o arquivo é uma imagem
const isImageFile = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
};

// Verifica se o arquivo é PDF
const isPdfFile = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return extension === 'pdf';
};

// Gera thumbnail da primeira página do PDF com melhor qualidade
const generatePdfThumbnail = async (pdfUrl: string): Promise<string | null> => {
  try {
    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    // Scale maior para melhor qualidade de thumbnail
    const scale = 1.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.error('Erro ao gerar thumbnail do PDF:', error);
    return null;
  }
};

export function LicitacaoAnexosBar({ licitacaoId }: LicitacaoAnexosBarProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [analysisSucceeded, setAnalysisSucceeded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ url: string; name: string; bucket?: string } | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();


  // Query para anexos da tabela licitacoes_anexos (upload manual)
  const { data: anexosTabela } = useQuery({
    queryKey: ['licitacao-anexos-tabela', licitacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitacoes_anexos')
        .select('*')
        .eq('licitacao_id', licitacaoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!licitacaoId,
  });

  // Query para anexos do bucket editais-pdfs (automação via API)
  const { data: anexosBucket, isLoading } = useQuery({
    queryKey: ['licitacao-anexos-bucket', licitacaoId],
    queryFn: async () => {
      const { data: files, error } = await supabase.storage
        .from('editais-pdfs')
        .list(`${licitacaoId}/`);
      
      if (error) {
        console.error('Erro ao listar arquivos do bucket:', error);
        return [];
      }
      
      return (files || []).map(f => ({
        id: f.id,
        arquivo_nome: f.name,
        arquivo_url: `${licitacaoId}/${f.name}`,
        created_at: f.created_at,
        source: 'bucket' as const
      }));
    },
    enabled: !!licitacaoId,
  });

  // Tipo unificado para anexos
  type AnexoUnificado = {
    id: string;
    arquivo_nome: string;
    arquivo_url: string;
    created_at?: string | null;
    source: 'tabela' | 'bucket';
  };

  // Combinar anexos de ambas as fontes (evitando duplicatas)
  const anexos = useMemo((): AnexoUnificado[] => {
    const tabelaAnexos: AnexoUnificado[] = (anexosTabela || []).map(a => ({ 
      id: a.id,
      arquivo_nome: a.arquivo_nome,
      arquivo_url: a.arquivo_url,
      created_at: a.created_at,
      source: 'tabela' as const 
    }));
    const bucketAnexos: AnexoUnificado[] = anexosBucket || [];
    
    // Remover duplicatas baseado no nome do arquivo
    const allAnexos = [...tabelaAnexos];
    const tabelaNomes = new Set(tabelaAnexos.map(a => a.arquivo_nome.toLowerCase()));
    
    for (const ba of bucketAnexos) {
      if (!tabelaNomes.has(ba.arquivo_nome.toLowerCase())) {
        allAnexos.push(ba);
      }
    }
    
    return allAnexos.sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [anexosTabela, anexosBucket]);

  // Carregar thumbnails para imagens e PDFs
  useEffect(() => {
    const loadThumbnails = async () => {
      const newUrls: Record<string, string> = {};
      
      for (const anexo of anexos) {
        // Skip se já temos o thumbnail
        if (thumbnailUrls[anexo.id]) continue;
        
        const bucketName = anexo.source === 'bucket' ? 'editais-pdfs' : 'licitacoes-anexos';
        
        if (isImageFile(anexo.arquivo_nome)) {
          // Para imagens, usar URL assinada diretamente
          const { data } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(anexo.arquivo_url, 3600);
          
          if (data?.signedUrl) {
            newUrls[anexo.id] = data.signedUrl;
          }
        } else if (isPdfFile(anexo.arquivo_nome)) {
          // Para PDFs, gerar thumbnail da primeira página
          try {
            const { data } = await supabase.storage
              .from(bucketName)
              .createSignedUrl(anexo.arquivo_url, 3600);
            
            if (data?.signedUrl) {
              const thumbnail = await generatePdfThumbnail(data.signedUrl);
              // Se gerou thumbnail usa, senão marca como 'icon' para não ficar em loading infinito
              newUrls[anexo.id] = thumbnail || 'icon';
            } else {
              newUrls[anexo.id] = 'icon';
            }
          } catch {
            newUrls[anexo.id] = 'icon';
          }
        }
      }
      
      if (Object.keys(newUrls).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
    };
    
    if (anexos.length > 0) {
      loadThumbnails();
    }
  }, [anexos]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', userId)
        .single();

      const timestamp = Date.now();
      const safeName = sanitizeFileName(file.name);
      const filePath = `${licitacaoId}/${timestamp}_${safeName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('licitacoes-anexos')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('licitacoes_anexos')
        .insert({
          licitacao_id: licitacaoId,
          arquivo_nome: file.name,
          arquivo_url: filePath,
          usuario_id: userId,
          usuario_nome: profile?.nome_completo || 'Usuário',
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-tabela', licitacaoId] });
      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-bucket', licitacaoId] });
      toast.success('Arquivo enviado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar arquivo');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (anexo: AnexoUnificado) => {
      const bucketName = anexo.source === 'bucket' ? 'editais-pdfs' : 'licitacoes-anexos';
      
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([anexo.arquivo_url]);
      
      if (storageError) console.error('Erro ao remover do storage:', storageError);

      // Só deletar da tabela se veio da tabela
      if (anexo.source === 'tabela') {
        const { error: dbError } = await supabase
          .from('licitacoes_anexos')
          .delete()
          .eq('id', anexo.id);

        if (dbError) throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-tabela', licitacaoId] });
      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-bucket', licitacaoId] });
      toast.success('Arquivo removido');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover arquivo');
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        await uploadMutation.mutateAsync(file);
      } catch (err) {
        console.error('Erro ao fazer upload:', err);
      }
    }
    setUploading(false);
  };

  // Handler para Ctrl+V de imagens/arquivos (screenshots)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToUpload: { file: globalThis.File; customName: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            // Gerar nome para screenshots colados (que vêm sem nome ou com nome genérico)
            let fileName = file.name;
            if (!fileName || fileName === 'image.png' || fileName === 'image') {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const ext = file.type.split('/')[1] || 'png';
              fileName = `screenshot_${timestamp}.${ext}`;
            }
            filesToUpload.push({ file, customName: fileName });
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        setUploading(true);
        
        for (const { file, customName } of filesToUpload) {
          try {
            // Fazer upload diretamente com nome customizado
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;
            
            const { data: profile } = await supabase
              .from('profiles')
              .select('nome_completo')
              .eq('id', userId)
              .single();

            const timestamp = Date.now();
            const safeName = sanitizeFileName(customName);
            const filePath = `${licitacaoId}/${timestamp}_${safeName}`;
            
            const { error: uploadError } = await supabase.storage
              .from('licitacoes-anexos')
              .upload(filePath, file);
            
            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase
              .from('licitacoes_anexos')
              .insert({
                licitacao_id: licitacaoId,
                arquivo_nome: customName,
                arquivo_url: filePath,
                usuario_id: userId,
                usuario_nome: profile?.nome_completo || 'Usuário',
              });

            if (dbError) throw dbError;
          } catch (err) {
            console.error('Erro ao fazer upload:', err);
            toast.error('Erro ao colar arquivo');
          }
        }
        
        queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-tabela', licitacaoId] });
        queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-bucket', licitacaoId] });
        setUploading(false);
        toast.success(`${filesToUpload.length} arquivo(s) colado(s) com sucesso!`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [licitacaoId, queryClient]);

  // Handlers de drag-and-drop
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
  }, []);

  const handleDownload = async (anexo: AnexoUnificado) => {
    try {
      const bucketName = anexo.source === 'bucket' ? 'editais-pdfs' : 'licitacoes-anexos';
      
      const { data, error } = await supabase.storage
        .from(bucketName)
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

  const handlePreview = async (anexo: AnexoUnificado) => {
    const bucketName = anexo.source === 'bucket' ? 'editais-pdfs' : 'licitacoes-anexos';
    const extension = anexo.arquivo_nome?.split('.').pop()?.toLowerCase() || '';

    if (extension === 'pdf') {
      try {
        const key = anexo.arquivo_url.startsWith('http')
          ? (() => {
              const markers = [`/${bucketName}/`];
              for (const m of markers) {
                const idx = anexo.arquivo_url.indexOf(m);
                if (idx !== -1) return anexo.arquivo_url.substring(idx + m.length);
              }
              return anexo.arquivo_url;
            })()
          : anexo.arquivo_url;

        const { data, error } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(key, 3600);

        if (error) throw error;
        window.open(data.signedUrl, '_blank');
      } catch (err) {
        console.error('Erro ao abrir PDF:', err);
        toast.error('Erro ao abrir PDF');
      }
      return;
    }

    setSelectedFile({ url: anexo.arquivo_url, name: anexo.arquivo_nome, bucket: bucketName });
    setViewerOpen(true);
  };

  const handleSendWebhook = async () => {
    if (!anexos || anexos.length === 0) {
      toast.error("Nenhum arquivo para enviar");
      return;
    }

    setSendingWebhook(true);
    toast.info("Reanálise em andamento...");

    try {
      // Get current user info
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const { data: profile } = userId ? await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', userId)
        .single() : { data: null };

      const userName = profile?.nome_completo || 'Usuário';

      // Get licitação info for notifications
      const { data: licitacaoInfo } = await supabase
        .from('licitacoes')
        .select('numero_edital, responsavel_id, titulo')
        .eq('id', licitacaoId)
        .single();

      const tituloLicitacao = licitacaoInfo?.numero_edital || licitacaoInfo?.titulo || 'Licitação';

      // Notify responsible person that re-analysis was requested
      if (licitacaoInfo?.responsavel_id && licitacaoInfo.responsavel_id !== userId) {
        await supabase.from('system_notifications').insert({
          user_id: licitacaoInfo.responsavel_id,
          tipo: 'licitacao_reanalise_solicitada',
          titulo: `📋 Reanálise solicitada: ${tituloLicitacao}`,
          mensagem: `${userName} solicitou a reanálise do edital "${tituloLicitacao}".`,
          link: `/licitacoes?open=${licitacaoId}`,
          referencia_id: licitacaoId,
        });
      }

      // Build array of files to send in a single request
      const files = anexos.map(anexo => ({
        bucket_name: anexo.source === 'bucket' ? 'editais-pdfs' : 'licitacoes-anexos',
        file_path: anexo.arquivo_url,
        file_name: anexo.arquivo_nome,
      }));

      const { data: result, error } = await supabase.functions.invoke('webhook-proxy', {
        body: { licitacao_id: licitacaoId, files },
      });

      if (error) {
        console.error('Erro ao enviar webhook:', error);
        toast.error("Reanálise falhou.");
      } else if (result?.success) {
        toast.success("Reanálise concluída com sucesso!");
        setAnalysisSucceeded(true);

        // Notify the requester that the analysis is complete
        if (userId) {
          await supabase.from('system_notifications').insert({
            user_id: userId,
            tipo: 'licitacao_reanalise_concluida',
            titulo: `✅ Reanálise concluída: ${tituloLicitacao}`,
            mensagem: `A reanálise do edital "${tituloLicitacao}" foi concluída com sucesso.`,
            link: `/licitacoes?open=${licitacaoId}`,
            referencia_id: licitacaoId,
          });
        }
      } else {
        console.error('Reanálise falhou:', result);
        toast.error("Reanálise falhou.");
      }
    } catch (error: any) {
      console.error('Erro ao enviar webhook:', error);
      toast.error(error.message || 'Erro ao reanalizar');
    } finally {
      setSendingWebhook(false);
    }
  };

  const truncateFileName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.lastIndexOf('.'));
    const truncated = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncated}.${ext}`;
  };

  return (
    <div 
      className={`relative border-t bg-muted/30 transition-colors ${isDragOver ? 'bg-primary/10 border-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
            onClick={handleSendWebhook}
            disabled={sendingWebhook || analysisSucceeded || !anexos || anexos.length === 0}
            title="Reanalizar arquivos via webhook"
          >
            {sendingWebhook ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Reanalisando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Reanalizar
              </>
            )}
          </Button>
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

      {/* Overlay de drag */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <p className="text-primary font-medium">Solte para anexar</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : anexos && anexos.length > 0 ? (
        <ScrollArea className="h-[450px]">
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {anexos.map((anexo: any) => {
              const iconSrc = getFileIcon(anexo.arquivo_nome);
              const isImage = isImageFile(anexo.arquivo_nome);
              const isPdf = isPdfFile(anexo.arquivo_nome);
              const thumbnailUrl = thumbnailUrls[anexo.id];
              const hasThumbnail = (isImage || isPdf) && thumbnailUrl && thumbnailUrl !== 'icon';
              const isLoadingThumbnail = (isImage || isPdf) && !thumbnailUrl;
              
              return (
                <div
                  key={anexo.id}
                  className="group relative flex flex-col items-center gap-2 p-3 rounded-xl border bg-background hover:bg-muted/50 transition-colors shadow-sm"
                >
                  {/* Preview thumbnail ou ícone */}
                  <div
                    className="cursor-pointer w-full aspect-[4/3] flex items-center justify-center overflow-hidden rounded-lg bg-muted/30 border relative"
                    onClick={() => handlePreview(anexo)}
                  >
                    {isLoadingThumbnail ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="text-xs">Carregando...</span>
                      </div>
                    ) : hasThumbnail ? (
                      <img 
                        src={thumbnailUrl} 
                        alt={anexo.arquivo_nome} 
                        className="w-full h-full object-cover"
                      />
                    ) : iconSrc ? (
                      <img src={iconSrc} alt="" className="h-16 w-16 object-contain" />
                    ) : (
                      getFileIconComponent(anexo.arquivo_nome, "lg")
                    )}
                    {/* Badge indicando PDF */}
                    {isPdf && (
                      <div className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        PDF
                      </div>
                    )}
                  </div>
                  
                  <span 
                    className="text-xs text-center line-clamp-2 w-full cursor-pointer leading-tight font-medium"
                    onClick={() => handlePreview(anexo)}
                    title={anexo.arquivo_nome}
                  >
                    {truncateFileName(anexo.arquivo_nome, 25)}
                  </span>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 mt-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => handlePreview(anexo)}
                      title="Visualizar"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => handleDownload(anexo)}
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(anexo)}
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Nenhum anexo. Arraste arquivos ou clique em Upload.
        </div>
      )}

      

      <LicitacaoFileViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={selectedFile?.url || null}
        fileName={selectedFile?.name || null}
        bucket={selectedFile?.bucket || 'licitacoes-anexos'}
      />
    </div>
  );
}