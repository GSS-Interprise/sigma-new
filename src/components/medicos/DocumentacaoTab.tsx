import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Download, Trash2, Eye, Edit2, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DocumentacaoTabProps {
  medicoId: string;
  leadId?: string | null;
}

type TipoDocumento = 'diploma' | 'certificado' | 'rg' | 'cpf' | 'crm' | 'rqe' | 'titulo_especialista' | 'comprovante_residencia' | 'certidao' | 'carta_recomendacao' | 'contrato_aditivo' | 'link_externo' | 'outro';

const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  diploma: 'Diploma',
  certificado: 'Certificado',
  rg: 'RG',
  cpf: 'CPF',
  crm: 'CRM',
  rqe: 'RQE',
  titulo_especialista: 'Título de Especialista',
  comprovante_residencia: 'Comprovante de Residência',
  certidao: 'Certidão',
  carta_recomendacao: 'Carta de Recomendação',
  contrato_aditivo: 'Contrato/Aditivo',
  link_externo: 'Link Externo (Google Drive / OneDrive)',
  outro: 'Outro'
};

export function DocumentacaoTab({ medicoId, leadId }: DocumentacaoTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | 'other' | null>(null);

  // Form states
  const [uploadForm, setUploadForm] = useState({
    files: [] as File[],
    tipo_documento: 'outro' as TipoDocumento,
    url_externa: '',
    emissor: '',
    data_emissao: '',
    data_validade: '',
    observacoes: ''
  });
  const [loadingExternalDocs, setLoadingExternalDocs] = useState(false);

  // Buscar resumo IA do médico
  const { data: medicoData } = useQuery({
    queryKey: ['medico', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('resumo_ia, resumo_ia_gerado_em, resumo_ia_aprovado')
        .eq('id', medicoId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!medicoId
  });

  // Buscar documentos do médico
  const { data: medicoDocumentos, isLoading: loadingMedicoDocumentos } = useQuery({
    queryKey: ['medico-documentos', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_documentos')
        .select('*')
        .eq('medico_id', medicoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!medicoId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Buscar anexos do lead (documentos migrados)
  const { data: leadAnexos, isLoading: loadingLeadAnexos } = useQuery({
    queryKey: ['lead-anexos-documentacao', leadId],
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

  // Combinar documentos de ambas as fontes SEM deduplicação (cada tabela é independente)
  const medicoDocsNormalized = (medicoDocumentos || []).map(doc => ({ ...doc, source: 'medico' as const }));
  
  const leadAnexosNormalized = (leadAnexos || []).map(anexo => {
    // Detectar link externo: tipo é link_externo OU url começa com http e não é do Supabase
    const isExternalLink = anexo.arquivo_tipo === 'link_externo' || 
      (anexo.arquivo_url?.startsWith('http') && !anexo.arquivo_url?.includes('supabase'));
    
    return {
      id: anexo.id,
      arquivo_nome: anexo.arquivo_nome,
      arquivo_path: anexo.arquivo_url,
      tipo_documento: isExternalLink ? 'link_externo' : (anexo.arquivo_tipo || 'outro'),
      created_at: anexo.created_at,
      source: 'lead' as const,
      url_externa: isExternalLink ? anexo.arquivo_url : null,
    };
  });
  
  const documentos = [...medicoDocsNormalized, ...leadAnexosNormalized];

  const isLoading = loadingMedicoDocumentos || loadingLeadAnexos;

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();

      // Se for link externo, não faz upload de arquivo
      if (uploadForm.tipo_documento === 'link_externo') {
        if (!uploadForm.url_externa) {
          throw new Error('URL externa é obrigatória para links externos');
        }

        // 1) Sempre salvar no prontuário do LEAD quando houver leadId (fonte central)
        if (leadId) {
          const { error: leadLinkError } = await supabase
            .from('lead_anexos')
            .insert({
              lead_id: leadId,
              arquivo_nome: 'Link Externo',
              arquivo_url: uploadForm.url_externa,
              arquivo_tipo: 'link_externo',
              arquivo_tamanho: null,
              usuario_id: user.id,
              usuario_nome: profile?.nome_completo || 'Usuário',
            });

          if (leadLinkError) throw leadLinkError;
        }

        // 2) Também salvar em medico_documentos (mantém compatibilidade com rotinas de IA/validação)
        const linkId = crypto.randomUUID();
        const externalLabel = `Link Externo id:${linkId.slice(0, 8)}`;

        const { error: dbError } = await supabase
          .from('medico_documentos')
          .insert({
            id: linkId,
            medico_id: medicoId,
            tipo_documento: uploadForm.tipo_documento,
            url_externa: uploadForm.url_externa,
            arquivo_nome: externalLabel,
            arquivo_path: uploadForm.url_externa,
            emissor: uploadForm.emissor,
            data_emissao: uploadForm.data_emissao || null,
            data_validade: uploadForm.data_validade || null,
            observacoes: uploadForm.observacoes,
            uploaded_by: user.id,
          });

        if (dbError) throw dbError;

        // Log
        await supabase.from('medico_documentos_log').insert({
          medico_id: medicoId,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
          acao: 'upload',
          detalhes: `Upload de link externo: ${uploadForm.url_externa}`,
        });

        return;
      }

      const uploadedDocs = [];

      // Function to sanitize filename for Supabase Storage
      const sanitizeFileName = (name: string): string => {
        return name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
          .replace(/_+/g, '_'); // Remove duplicate underscores
      };

      for (const file of uploadForm.files) {
        const fileExt = file.name.split('.').pop();
        const sanitizedName = sanitizeFileName(file.name);
        const fileName = `${medicoId}/${Date.now()}_${sanitizedName}`;

        // Upload para storage
        const { error: uploadError } = await supabase.storage
          .from('medicos-documentos')
          .upload(fileName, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        // Criar registro no banco
        const { data: doc, error: docError } = await supabase
          .from('medico_documentos')
          .insert({
            medico_id: medicoId,
            arquivo_path: fileName,
            arquivo_nome: file.name,
            tipo_documento: uploadForm.tipo_documento,
            emissor: uploadForm.emissor || null,
            data_emissao: uploadForm.data_emissao || null,
            data_validade: uploadForm.data_validade || null,
            observacoes: uploadForm.observacoes || null,
            uploaded_by: user.id
          })
          .select()
          .single();

        if (docError) throw docError;

        // Log de auditoria
        await supabase.from('medico_documentos_log').insert({
          documento_id: doc.id,
          medico_id: medicoId,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
          acao: 'upload',
          detalhes: `Upload do arquivo: ${file.name}`
        });

        uploadedDocs.push(doc);
      }

      return uploadedDocs;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['medico-documentos', medicoId] });
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: ['lead-anexos-documentacao', leadId] });
      }
      toast({ title: "Documentos enviados com sucesso!" });

      // Notificar gestoras de contratos se documento tem validade próxima ou vencida
      if (uploadForm.data_validade) {
        const validade = new Date(uploadForm.data_validade + 'T12:00:00');
        const hoje = new Date();
        const diffDays = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 30) {
          try {
            // Buscar nome do médico
            const { data: medicoInfo } = await supabase
              .from('medicos')
              .select('nome_completo')
              .eq('id', medicoId)
              .single();

            // Buscar gestoras de contratos
            const { data: gestores } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'gestor_contratos');

            if (gestores && gestores.length > 0) {
              const isVencido = diffDays < 0;
              const tipoLabel = TIPO_DOCUMENTO_LABELS[uploadForm.tipo_documento] || uploadForm.tipo_documento;
              const medicoNome = medicoInfo?.nome_completo || 'Médico';
              
              const notificacoes = gestores.map(g => ({
                user_id: g.user_id,
                tipo: isVencido ? 'documento_vencido' : 'documento_vencendo',
                titulo: isVencido 
                  ? `⚠️ Documento vencido enviado: ${tipoLabel}`
                  : `⏳ Documento próximo do vencimento: ${tipoLabel}`,
                mensagem: `${tipoLabel} do(a) ${medicoNome} ${
                  isVencido 
                    ? `está vencido desde ${validade.toLocaleDateString('pt-BR')}`
                    : `vence em ${validade.toLocaleDateString('pt-BR')} (${diffDays} dias)`
                }`,
                link: '/medicos',
              }));

              await supabase.from('system_notifications').insert(notificacoes);
            }
          } catch (e) {
            console.warn('Erro ao enviar notificação de validade:', e);
          }
        }
      }

      setUploadForm({
        files: [],
        tipo_documento: 'outro',
        url_externa: '',
        emissor: '',
        data_emissao: '',
        data_validade: '',
        observacoes: ''
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao enviar documentos", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();

      // Se é um documento do lead
      if (doc.source === 'lead') {
        // Tentar deletar do storage se for uma URL do Supabase
        if (doc.arquivo_path?.includes('supabase')) {
          try {
            // Extrair o path do arquivo da URL
            const urlParts = doc.arquivo_path.split('/');
            const bucketIndex = urlParts.findIndex((p: string) => p === 'medicos-documentos' || p === 'lead-anexos');
            if (bucketIndex > -1) {
              const bucket = urlParts[bucketIndex];
              const path = urlParts.slice(bucketIndex + 1).join('/');
              await supabase.storage.from(bucket).remove([decodeURIComponent(path)]);
            }
          } catch (e) {
            console.warn('Erro ao deletar arquivo do storage:', e);
          }
        }

        // Deletar do banco
        const { error: dbError } = await supabase
          .from('lead_anexos')
          .delete()
          .eq('id', doc.id);

        if (dbError) throw dbError;
      } else {
        // Documento do médico - comportamento original
        // Deletar do storage
        const { error: storageError } = await supabase.storage
          .from('medicos-documentos')
          .remove([doc.arquivo_path]);

        if (storageError) throw storageError;

        // Log antes de deletar
        await supabase.from('medico_documentos_log').insert({
          documento_id: doc.id,
          medico_id: medicoId,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
          acao: 'delete',
          detalhes: `Exclusão do arquivo: ${doc.arquivo_nome}`
        });

        // Deletar do banco
        const { error: dbError } = await supabase
          .from('medico_documentos')
          .delete()
          .eq('id', doc.id);

        if (dbError) throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-documentos', medicoId] });
      queryClient.invalidateQueries({ queryKey: ['lead-anexos-documentacao', leadId] });
      toast({ title: "Documento excluído com sucesso!" });
      setDeleteDialogOpen(false);
      setSelectedDoc(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao excluir documento", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Helper: extrair bucket e path de uma URL ou path do storage
  const extractBucketAndPath = (pathOrUrl: string): { bucket: string; path: string } | null => {
    // URL pública do Supabase: https://xxx.supabase.co/storage/v1/object/public/BUCKET/PATH
    const publicUrlMatch = pathOrUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (publicUrlMatch) {
      return { bucket: publicUrlMatch[1], path: decodeURIComponent(publicUrlMatch[2]) };
    }

    // Path com prefixo de bucket conhecido
    const knownBuckets = ['medico-kanban-anexos', 'lead-anexos', 'medicos-documentos'];
    for (const bucket of knownBuckets) {
      if (pathOrUrl.startsWith(`${bucket}/`)) {
        return { bucket, path: pathOrUrl.substring(bucket.length + 1) };
      }
    }

    // Path sem prefixo de bucket - assumir lead-anexos
    if (!pathOrUrl.startsWith('http')) {
      return { bucket: 'lead-anexos', path: pathOrUrl };
    }

    return null;
  };

  // Helper: obter URL ou blob para visualização/download
  const getUrlForDoc = async (doc: any): Promise<string> => {
    if (!doc?.arquivo_path) throw new Error('Caminho do arquivo inválido');

    // Lead anexos podem vir como URL pública, path de storage, ou link externo
    if (doc.source === 'lead') {
      const pathOrUrl: string = doc.arquivo_path;

      // Link externo (Google Drive, OneDrive, etc.) - retornar URL direta
      if (pathOrUrl.startsWith('http') && !pathOrUrl.includes('supabase.co/storage')) {
        return pathOrUrl;
      }

      // URL pública do Supabase ou path do storage
      const extracted = extractBucketAndPath(pathOrUrl);
      if (extracted) {
        // Usar signed URL para permitir acesso mesmo com buckets privados
        const { data, error } = await supabase.storage
          .from(extracted.bucket)
          .createSignedUrl(extracted.path, 3600);

        if (error) {
          // Fallback para download
          const { data: downloadData, error: downloadError } = await supabase.storage
            .from(extracted.bucket)
            .download(extracted.path);
          if (downloadError) throw downloadError;
          return URL.createObjectURL(downloadData);
        }
        return data.signedUrl;
      }

      // Fallback: retornar URL direto se for http
      if (pathOrUrl.startsWith('http')) {
        return pathOrUrl;
      }

      throw new Error('Formato de URL não reconhecido');
    }

    // Documento do médico (bucket medicos-documentos)
    const { data, error } = await supabase.storage
      .from('medicos-documentos')
      .createSignedUrl(doc.arquivo_path, 3600);

    if (error) {
      // Fallback para download
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('medicos-documentos')
        .download(doc.arquivo_path);
      if (downloadError) throw downloadError;
      return URL.createObjectURL(downloadData);
    }
    return data.signedUrl;
  };

  // Helper para download que precisa de blob
  const getBlobForDoc = async (doc: any): Promise<Blob> => {
    const url = await getUrlForDoc(doc);
    
    // Se é um blob URL, não precisa fetch
    if (url.startsWith('blob:')) {
      // Já é um blob URL criado pelo fallback
      const response = await fetch(url);
      return response.blob();
    }
    
    // Link externo - não é possível fazer fetch direto devido a CORS
    if (url.startsWith('http') && !url.includes('supabase.co')) {
      throw new Error('Não é possível baixar links externos. Use o botão "Abrir Link".');
    }
    
    // Fetch da signed URL ou URL pública
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo (${response.status})`);
    }
    return response.blob();
  };

  // Download
  const handleDownload = async (doc: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user?.id || '')
        .single();

      const blob = await getBlobForDoc(doc);

      // Log apenas para documentos do médico
      if (doc.source !== 'lead') {
        await supabase.from('medico_documentos_log').insert({
          documento_id: doc.id,
          medico_id: medicoId,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
          acao: 'download',
          detalhes: `Download do arquivo: ${doc.arquivo_nome}`
        });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Download iniciado!" });
    } catch (error: any) {
      toast({
        title: "Erro ao baixar documento",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Preview (download + blob URL para evitar problemas de content-type)
  const handlePreview = async (doc: any) => {
    try {
      const ext = (doc.arquivo_nome || '').split('.').pop()?.toLowerCase();

      // PDFs abrem em nova aba para melhor UX
      if (ext === 'pdf') {
        const signedUrl = await getUrlForDoc(doc);
        window.open(signedUrl, '_blank');
        return;
      }

      // Revogar URL anterior se existir
      if (previewUrl) URL.revokeObjectURL(previewUrl);

      const data = await getBlobForDoc(doc);

      // Tentar inferir o tipo pelo nome do arquivo quando o blob vier como octet-stream
      const isImage = ext === 'jpg' || ext === 'jpeg' || ext === 'png';

      const blob = isImage
        ? new Blob([data], { type: data.type && data.type !== 'application/octet-stream' ? data.type : `image/${ext === 'jpg' ? 'jpeg' : ext}` })
        : data;

      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewType(isImage ? 'image' : 'other');
    } catch (error: any) {
      toast({
        title: 'Erro ao visualizar documento',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleUpload = () => {
    if (uploadForm.tipo_documento === 'link_externo') {
      if (!uploadForm.url_externa) {
        toast({ title: "Informe a URL do link externo", variant: "destructive" });
        return;
      }
    } else {
      if (uploadForm.files.length === 0) {
        toast({ title: "Selecione pelo menos um arquivo", variant: "destructive" });
        return;
      }
    }
    uploadMutation.mutate();
  };

  // Processar documentos de link externo
  const processExternalLinkMutation = useMutation({
    mutationFn: async (documentId: string) => {
      setLoadingExternalDocs(true);
      const { data, error } = await supabase.functions.invoke('process-doctor-document', {
        body: { 
          action: 'process-external-link',
          documentId
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['medico-documentos', medicoId] });
      setLoadingExternalDocs(false);
      if (data?.success) {
        toast({ 
          title: "Documentos processados com sucesso!", 
          description: data.message || "Os documentos foram carregados e estão prontos para análise."
        });
      }
    },
    onError: (error: Error) => {
      setLoadingExternalDocs(false);
      toast({ 
        title: "Erro ao processar documentos", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Gerar resumo IA
  const gerarResumoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-doctor-document', {
        body: { 
          action: 'generate-summary',
          medicoId 
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico', medicoId] });
      toast({ 
        title: "Resumo gerado com sucesso!",
        description: "O resumo foi criado com base nos documentos anexados."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao gerar resumo", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  if (!medicoId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Salve o médico primeiro para gerenciar documentos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload de Documentos</CardTitle>
          <CardDescription>Envie diplomas, certificados e outros documentos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Documento</Label>
            <Select
              value={uploadForm.tipo_documento}
              onValueChange={(value) => setUploadForm(prev => ({ 
                ...prev, 
                tipo_documento: value as TipoDocumento,
                files: [],
                url_externa: ''
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_DOCUMENTO_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {uploadForm.tipo_documento === 'link_externo' ? (
            <div className="space-y-2">
              <Label>URL do Link Externo</Label>
              <Input
                type="url"
                value={uploadForm.url_externa}
                onChange={(e) => setUploadForm(prev => ({ ...prev, url_externa: e.target.value }))}
                placeholder="https://drive.google.com/... ou https://onedrive.live.com/..."
              />
              <p className="text-xs text-muted-foreground">
                ⚠️ O link precisa estar configurado como público (qualquer pessoa com o link pode visualizar)
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Arquivos</Label>
              <Input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setUploadForm(prev => ({ ...prev, files }));
                }}
              />
              {uploadForm.files.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {uploadForm.files.length} arquivo(s) selecionado(s)
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Emissor</Label>
              <Input
                value={uploadForm.emissor}
                onChange={(e) => setUploadForm(prev => ({ ...prev, emissor: e.target.value }))}
                placeholder="Ex: Universidade Federal..."
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Emissão</Label>
              <Input
                type="date"
                value={uploadForm.data_emissao}
                onChange={(e) => setUploadForm(prev => ({ ...prev, data_emissao: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Validade</Label>
              <Input
                type="date"
                value={uploadForm.data_validade}
                onChange={(e) => setUploadForm(prev => ({ ...prev, data_validade: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={uploadForm.observacoes}
              onChange={(e) => setUploadForm(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Observações adicionais..."
            />
          </div>

          <Button 
            type="button"
            onClick={handleUpload} 
            disabled={uploadMutation.isPending || (uploadForm.tipo_documento === 'link_externo' ? !uploadForm.url_externa : uploadForm.files.length === 0)}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {uploadForm.tipo_documento === 'link_externo' ? 'Salvar Link Externo' : 'Enviar Documentos'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Resumo IA */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo Profissional com IA</CardTitle>
          <CardDescription>
            Gere automaticamente um resumo profissional baseado nos documentos anexados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {medicoData?.resumo_ia ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{medicoData.resumo_ia}</p>
              </div>
              {medicoData.resumo_ia_gerado_em && (
                <p className="text-xs text-muted-foreground">
                  Gerado em {format(new Date(medicoData.resumo_ia_gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              <Button
                type="button"
                onClick={() => gerarResumoMutation.mutate()}
                disabled={gerarResumoMutation.isPending || !documentos || documentos.length === 0}
                variant="outline"
              >
                {gerarResumoMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Regenerando...
                  </>
                ) : (
                  'Regenerar Resumo'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Nenhum resumo gerado ainda. Anexe documentos e clique no botão abaixo para gerar automaticamente.
              </p>
              <Button
                type="button"
                onClick={() => gerarResumoMutation.mutate()}
                disabled={gerarResumoMutation.isPending || !documentos || documentos.length === 0}
              >
                {gerarResumoMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando Resumo...
                  </>
                ) : (
                  'Gerar Resumo com IA'
                )}
              </Button>
              {(!documentos || documentos.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  É necessário anexar pelo menos um documento antes de gerar o resumo.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Documentos */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos Anexados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !documentos || documentos.length === 0 ? (
            <p className="text-muted-foreground text-center p-8">Nenhum documento anexado ainda.</p>
          ) : (
            <div className="space-y-2">
              {documentos.map((doc) => (
                <div key={`${doc.source}:${doc.id}`} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{doc.arquivo_nome}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-muted-foreground">
                          {TIPO_DOCUMENTO_LABELS[doc.tipo_documento as TipoDocumento] || doc.tipo_documento}
                          {'data_emissao' in doc && doc.data_emissao && ` • Emissão: ${format(new Date(doc.data_emissao + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`}
                        </p>
                        {'data_validade' in doc && doc.data_validade && (() => {
                          const validade = new Date(doc.data_validade + 'T12:00:00');
                          const hoje = new Date();
                          const diffDays = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                          const isVencido = diffDays < 0;
                          const isProximo = diffDays >= 0 && diffDays <= 30;
                          return (
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                              isVencido 
                                ? 'bg-destructive/10 text-destructive' 
                                : isProximo 
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' 
                                  : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {isVencido ? '⚠ Vencido' : isProximo ? '⏳ Vence em breve' : '✓ Válido'}: {format(validade, 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          );
                        })()}
                      </div>
                      {doc.tipo_documento === 'link_externo' && doc.url_externa && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Link: {doc.url_externa.substring(0, 50)}...
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {doc.tipo_documento === 'link_externo' ? (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={doc.url_externa || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (!doc.url_externa) e.preventDefault();
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Abrir Link
                          </a>
                        </Button>

                        {/* "Carregar para Análise" só faz sentido para registros do médico (medico_documentos) */}
                        {doc.source === 'medico' && (
                          <Button 
                            type="button"
                            variant="default" 
                            size="sm" 
                            onClick={() => processExternalLinkMutation.mutate(doc.id)}
                            disabled={loadingExternalDocs}
                          >
                            {loadingExternalDocs ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Carregar para Análise
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handlePreview(doc)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedDoc(doc);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o documento "{selectedDoc?.arquivo_nome}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => selectedDoc && deleteMutation.mutate(selectedDoc)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => {
        if (!open && previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
          setPreviewType(null);
        }
      }}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Visualização do Documento</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            previewType === 'image' ? (
              <img src={previewUrl} className="w-full h-full object-contain" alt="Preview do documento" />
            ) : previewType === 'pdf' ? (
              <iframe src={previewUrl} className="w-full h-full border-0" title="Preview PDF" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                Não é possível pré-visualizar este tipo de arquivo. 
                <a className="underline ml-1" href={previewUrl} download>
                  Baixe o arquivo
                </a>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
