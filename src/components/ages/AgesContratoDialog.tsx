import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, File, X, Download, ExternalLink } from "lucide-react";
import { format, addMonths, subDays } from "date-fns";
import { toast } from "sonner";
import { parseLocalDate } from "@/lib/dateUtils";
import AgesContratoDocumentos from "./AgesContratoDocumentos";
import { AbaCadastroContratoAges } from "./AbaCadastroContratoAges";
import { AbaItensContratoAges } from "./AbaItensContratoAges";
import { AbaRenovacaoContratoAges } from "./AbaRenovacaoContratoAges";

// Importação dos ícones de arquivos
import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";

interface AgesContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: any;
}

interface ItemContrato {
  id: string;
  item: string;
  valor_item: number;
  quantidade?: number;
}

interface Renovacao {
  id: string;
  data_vigencia: Date;
  percentual_reajuste: number;
  valor: number;
}

interface AditivoTempo {
  id: string;
  data_inicio: Date;
  prazo_meses: number;
  data_termino: Date;
  observacoes?: string;
}

interface FormData {
  codigo_contrato: string;
  codigo_interno: number | null;
  profissional_id: string;
  ages_cliente_id: string;
  ages_unidade_id: string; // Mantido para retrocompatibilidade
  ages_unidades_ids: string[]; // Novo campo para múltiplas unidades
  tipo_contrato: string;
  tipo_servico: string[];
  objeto_contrato: string;
  data_inicio: Date | null;
  prazo_meses: number | null;
  data_termino: Date | null;
  status: string;
  assinado: string;
  motivo_pendente: string;
  observacoes: string;
  condicao_pagamento: string;
  valor_estimado: string;
  dias_antecedencia_aviso: number;
  // Dados do cliente
  cnpj: string;
  nome_fantasia: string;
  razao_social: string;
  endereco: string;
  email_contato: string;
  telefone_contato: string;
  email_financeiro: string;
  telefone_financeiro: string;
  uf: string;
  cidade: string;
}

const defaultFormData: FormData = {
  codigo_contrato: "",
  codigo_interno: null,
  profissional_id: "",
  ages_cliente_id: "",
  ages_unidade_id: "",
  ages_unidades_ids: [],
  tipo_contrato: "",
  tipo_servico: [],
  objeto_contrato: "",
  data_inicio: null,
  prazo_meses: null,
  data_termino: null,
  status: "Ativo",
  assinado: "Pendente",
  motivo_pendente: "",
  observacoes: "",
  condicao_pagamento: "",
  valor_estimado: "",
  dias_antecedencia_aviso: 60,
  cnpj: "",
  nome_fantasia: "",
  razao_social: "",
  endereco: "",
  email_contato: "",
  telefone_contato: "",
  email_financeiro: "",
  telefone_financeiro: "",
  uf: "",
  cidade: "",
};

const AgesContratoDialog = ({ open, onOpenChange, contrato }: AgesContratoDialogProps) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("cadastro");
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [documentosExistentes, setDocumentosExistentes] = useState<any[]>([]);
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [aditivos, setAditivos] = useState<AditivoTempo[]>([]);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [usuariosEmail, setUsuariosEmail] = useState<string[]>([]);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<{ url: string; nome: string } | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Buscar usuários para envio de email
  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-email-ages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          email, 
          nome_completo,
          user_roles!inner(role)
        `)
        .eq('status', 'ativo')
        .in('user_roles.role', ['diretoria', 'gestor_contratos', 'admin']);
      
      if (error) throw error;
      return data;
    },
  });

  // Função para obter ícone do arquivo
  const getFileIconImage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'pdf': pdfIcon,
      'doc': docIcon,
      'docx': docxIcon,
      'xls': xlsIcon,
      'xlsx': xlsxIcon,
      'jpg': jpgIcon,
      'jpeg': jpgIcon,
      'png': pngIcon,
      'gif': gifIcon,
      'bmp': bmpIcon,
    };
    return iconMap[ext || ''] || '';
  };

  // Habilitar cola de documentos com Ctrl+V
  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        setDocumentos(prev => [...prev, ...files]);
        toast.success(`${files.length} arquivo(s) colado(s) com sucesso.`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open]);

  // Calcular data_termino automaticamente quando data_inicio ou prazo_meses mudar
  // Só recalcula se NÃO estiver carregando dados (para evitar sobrescrever dados existentes)
  useEffect(() => {
    if (isLoadingData) return; // Ignora durante o carregamento
    if (formData.data_inicio && formData.prazo_meses && formData.prazo_meses > 0) {
      const dataTerminoCalculada = subDays(addMonths(formData.data_inicio, formData.prazo_meses), 1);
      setFormData(prev => ({ ...prev, data_termino: dataTerminoCalculada }));
    }
  }, [formData.data_inicio, formData.prazo_meses, isLoadingData]);

  // Normalizar status para garantir formato correto
  const normalizeStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      'ativo': 'Ativo',
      'inativo': 'Inativo',
      'suspenso': 'Suspenso',
      'em_renovacao': 'Em Processo de Renovação',
      'em renovação': 'Em Processo de Renovação',
      'em processo de renovação': 'Em Processo de Renovação',
    };
    return statusMap[status.toLowerCase()] || status;
  };

  const { data: profissionais = [] } = useQuery({
    queryKey: ["ages-profissionais-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_profissionais")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["ages-clientes-select-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_clientes")
        .select("id, nome_empresa, cnpj, endereco, email_contato, telefone_contato, uf, cidade")
        .eq("status_cliente", "Ativo")
        .order("nome_empresa");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["ages-unidades-select", formData.ages_cliente_id],
    queryFn: async () => {
      if (!formData.ages_cliente_id) return [];
      const { data, error } = await supabase
        .from("ages_unidades")
        .select("id, nome")
        .eq("cliente_id", formData.ages_cliente_id)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open && !!formData.ages_cliente_id,
  });

  // Carregar dados ao editar
  useEffect(() => {
    if (contrato && open) {
      setIsLoadingData(true); // Previne recálculo automático durante carregamento
      const cliente = contrato.ages_cliente;
      setFormData({
        codigo_contrato: contrato.codigo_contrato || "",
        codigo_interno: contrato.codigo_interno || null,
        profissional_id: contrato.profissional_id || "",
        ages_cliente_id: contrato.ages_cliente_id || "",
        ages_unidade_id: contrato.ages_unidade_id || "",
        ages_unidades_ids: contrato.ages_unidades_ids || (contrato.ages_unidade_id ? [contrato.ages_unidade_id] : []),
        tipo_contrato: contrato.tipo_contrato || "",
        tipo_servico: contrato.tipo_servico || [],
        objeto_contrato: contrato.objeto_contrato || "",
        data_inicio: contrato.data_inicio ? parseLocalDate(contrato.data_inicio) : null,
        prazo_meses: contrato.prazo_meses || null,
        data_termino: contrato.data_fim ? parseLocalDate(contrato.data_fim) : null,
        status: normalizeStatus(contrato.status || "Ativo"),
        assinado: contrato.assinado || "Pendente",
        motivo_pendente: contrato.motivo_pendente || "",
        observacoes: contrato.observacoes || "",
        condicao_pagamento: contrato.condicao_pagamento || "",
        valor_estimado: contrato.valor_estimado || "",
        dias_antecedencia_aviso: contrato.dias_antecedencia_aviso || 60,
        cnpj: cliente?.cnpj || "",
        nome_fantasia: cliente?.nome_fantasia || "",
        razao_social: cliente?.razao_social || "",
        endereco: cliente?.endereco || "",
        email_contato: cliente?.email_contato || "",
        telefone_contato: cliente?.telefone_contato || "",
        email_financeiro: cliente?.email_financeiro || "",
        telefone_financeiro: cliente?.telefone_financeiro || "",
        uf: cliente?.uf || "",
        cidade: cliente?.cidade || "",
      });

      // Carregar itens do contrato
      const fetchItens = async () => {
        const { data, error } = await supabase
          .from("ages_contrato_itens")
          .select("*")
          .eq("contrato_id", contrato.id);
        if (!error && data) {
          setItensContrato(data.map(item => ({
            id: item.id,
            item: item.item,
            valor_item: item.valor_item,
            quantidade: item.quantidade || 1
          })));
        }
      };

      // Carregar renovações
      const fetchRenovacoes = async () => {
        const { data, error } = await supabase
          .from("ages_contrato_renovacoes")
          .select("*")
          .eq("contrato_id", contrato.id);
        if (!error && data) {
          setRenovacoes(data.map(r => ({
            id: r.id,
            data_vigencia: parseLocalDate(r.data_vigencia) || new Date(),
            percentual_reajuste: r.percentual_reajuste || 0,
            valor: r.valor || 0
          })));
        }
      };

      // Carregar aditivos
      const fetchAditivos = async () => {
        const { data, error } = await supabase
          .from("ages_contrato_aditivos")
          .select("*")
          .eq("contrato_id", contrato.id)
          .order("data_inicio");
        if (!error && data) {
          setAditivos(data.map(a => ({
            id: a.id,
            data_inicio: parseLocalDate(a.data_inicio) || new Date(),
            prazo_meses: a.prazo_meses,
            data_termino: parseLocalDate(a.data_termino) || new Date(),
            observacoes: a.observacoes || undefined
          })));
        }
      };

      // Carregar documentos existentes
      const fetchDocumentos = async () => {
        const { data, error } = await supabase
          .from("ages_contratos_documentos")
          .select("*")
          .eq("contrato_id", contrato.id)
          .order("created_at", { ascending: false });
        if (!error && data) {
          setDocumentosExistentes(data);
        }
      };

      // Executa os fetches e depois libera o flag
      Promise.all([fetchItens(), fetchRenovacoes(), fetchAditivos(), fetchDocumentos()]).then(() => {
        // Usa setTimeout para garantir que o React processou os setStates
        setTimeout(() => setIsLoadingData(false), 100);
      });
    } else if (open && !contrato) {
      setFormData(defaultFormData);
      setItensContrato([]);
      setRenovacoes([]);
      setAditivos([]);
      setDocumentosExistentes([]);
      setIsLoadingData(false);
    }
    setDocumentos([]);
    setUsuariosEmail([]);
    setActiveTab("cadastro");
  }, [contrato, open]);

  // Handler para remover arquivo novo
  const handleRemoverArquivoNovo = (idx: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== idx));
  };

  // Handler para deletar arquivo existente
  const handleDeletarArquivoExistente = async (doc: any) => {
    try {
      // Guardar dados antes de deletar para o log
      const dadosAuditoria = {
        arquivo_nome: doc.arquivo_nome,
        arquivo_url: doc.arquivo_url,
        tipo_documento: doc.tipo_documento || null,
        id: doc.id,
      };

      // Deletar do storage
      if (doc.arquivo_url) {
        const filePath = doc.arquivo_url.split('/ages-documentos/').pop();
        if (filePath) {
          await supabase.storage.from('ages-documentos').remove([decodeURIComponent(filePath)]);
        }
      }

      // Deletar do banco
      const { error: dbError } = await supabase.from('ages_contratos_documentos').delete().eq('id', doc.id);
      if (dbError) {
        toast.error('Erro ao remover documento');
        return;
      }

      // Registrar auditoria via RPC (resolve usuário automaticamente)
      console.log('[Auditoria] Registrando remoção de anexo (ages):', dadosAuditoria.arquivo_nome);
      const { error: auditError } = await supabase.rpc('log_auditoria', {
        p_modulo: 'contratos',
        p_tabela: 'ages_contratos_documentos',
        p_acao: 'remover_anexo',
        p_registro_id: contrato?.id || '',
        p_registro_descricao: contrato?.codigo_contrato ? `Contrato ${contrato.codigo_contrato}` : 'Contrato AGEs',
        p_dados_antigos: dadosAuditoria as any,
        p_dados_novos: null,
        p_campos_alterados: null,
        p_detalhes: `Removeu arquivo "${dadosAuditoria.arquivo_nome}"`,
      });

      if (auditError) {
        console.error('[Auditoria] Erro ao registrar remoção (ages):', auditError);
      }

      setDocumentosExistentes(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Documento removido');
    } catch (error) {
      toast.error('Erro ao remover documento');
    }
  };

  // Handler para abrir arquivo
  const handleOpenFile = async (doc: any) => {
    try {
      const filePath = doc.arquivo_url.split('/ages-documentos/').pop();
      if (!filePath) {
        toast.error('URL do arquivo inválida');
        return;
      }
      
      const { data } = await supabase.storage
        .from('ages-documentos')
        .createSignedUrl(decodeURIComponent(filePath), 3600);
      
      if (data?.signedUrl) {
        setArquivoSelecionado({ url: data.signedUrl, nome: doc.arquivo_nome });
      }
    } catch (error) {
      toast.error('Erro ao abrir arquivo');
    }
  };

  // Handler para download
  const handleDownloadFile = async (doc: any) => {
    try {
      const filePath = doc.arquivo_url.split('/ages-documentos/').pop();
      if (!filePath) {
        toast.error('URL do arquivo inválida');
        return;
      }
      
      const { data, error } = await supabase.storage
        .from('ages-documentos')
        .download(decodeURIComponent(filePath));
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (error) {
      toast.error('Erro ao baixar arquivo');
    }
  };


  const saveMutation = useMutation({
    mutationFn: async () => {
      // Normalizar e validar status
      const statusNormalizado = normalizeStatus(formData.status);
      const statusValidos = ['Ativo', 'Inativo', 'Suspenso', 'Em Processo de Renovação'];
      
      if (!statusValidos.includes(statusNormalizado)) {
        throw new Error('Status do Contrato inválido. Valores aceitos: Ativo, Inativo, Suspenso ou Em Processo de Renovação');
      }

      // Preparar payload do contrato
      const contratoPayload: any = {
        codigo_contrato: formData.codigo_contrato || null,
        profissional_id: formData.profissional_id || null,
        ages_cliente_id: formData.ages_cliente_id || null,
        ages_unidade_id: formData.ages_unidades_ids.length > 0 ? formData.ages_unidades_ids[0] : null, // Retrocompatibilidade
        ages_unidades_ids: formData.ages_unidades_ids.length > 0 ? formData.ages_unidades_ids : null, // Novo campo
        tipo_contrato: formData.tipo_contrato || null,
        tipo_servico: formData.tipo_servico && formData.tipo_servico.length > 0 ? formData.tipo_servico : null,
        objeto_contrato: formData.objeto_contrato || null,
        data_inicio: formData.data_inicio ? format(formData.data_inicio, 'yyyy-MM-dd') : null,
        data_fim: formData.data_termino ? format(formData.data_termino, 'yyyy-MM-dd') : null,
        prazo_meses: formData.prazo_meses || null,
        status: statusNormalizado,
        assinado: formData.assinado || "Pendente",
        motivo_pendente: formData.motivo_pendente || null,
        observacoes: formData.observacoes || null,
        condicao_pagamento: formData.condicao_pagamento || null,
        valor_estimado: formData.valor_estimado || null,
        dias_antecedencia_aviso: formData.dias_antecedencia_aviso || 60,
      };

      let contratoId = contrato?.id;

      if (contrato?.id) {
        // Para update, manter codigo_interno existente
        if (formData.codigo_interno) {
          contratoPayload.codigo_interno = formData.codigo_interno;
        }
        const { error } = await supabase
          .from("ages_contratos")
          .update(contratoPayload)
          .eq("id", contrato.id);
        if (error) throw error;
      } else {
        // Para insert, não incluir codigo_interno (deixar o banco gerar)
        const { data, error } = await supabase
          .from("ages_contratos")
          .insert(contratoPayload)
          .select("id")
          .single();
        if (error) throw error;
        contratoId = data.id;
      }

      // Upload dos novos documentos
      if (documentos.length > 0 && contratoId) {
        const uploadErrors: string[] = [];
        
        for (const doc of documentos) {
          try {
            // Sanitizar nome do arquivo removendo acentos e caracteres especiais
            const sanitizedName = doc.name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-zA-Z0-9.-]/g, '_');
            
            const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'pdf';
            const fileName = `ages/${contratoId}/${crypto.randomUUID()}.${fileExt}`;

            // Criar um novo Blob a partir do arquivo para garantir que está acessível
            const arrayBuffer = await doc.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: doc.type || 'application/octet-stream' });

            const { error: uploadError } = await supabase.storage
              .from('ages-documentos')
              .upload(fileName, blob, {
                cacheControl: '3600',
                upsert: false,
                contentType: doc.type || 'application/octet-stream'
              });

            if (uploadError) {
              console.error('Erro no upload:', uploadError);
              uploadErrors.push(`${doc.name}: ${uploadError.message}`);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from('ages-documentos')
              .getPublicUrl(fileName);

            // Inserir na tabela de documentos
            await supabase.from('ages_contratos_documentos').insert({
              contrato_id: contratoId,
              arquivo_nome: doc.name,
              arquivo_url: publicUrl,
              tipo_documento: 'Contrato',
            });
          } catch (fileError: any) {
            console.error('Erro ao processar arquivo:', fileError);
            uploadErrors.push(`${doc.name}: ${fileError.message || 'Erro desconhecido'}`);
          }
        }
        
        if (uploadErrors.length > 0) {
          toast.error(`Erro ao fazer upload de ${uploadErrors.length} arquivo(s): ${uploadErrors.join('; ')}`);
        }
      }

      // Salvar itens do contrato
      if (contratoId) {
        // Deletar itens existentes e inserir novos
        await supabase.from("ages_contrato_itens").delete().eq("contrato_id", contratoId);
        if (itensContrato.length > 0) {
          const itensPayload = itensContrato.map(item => ({
            contrato_id: contratoId,
            item: item.item,
            valor_item: item.valor_item,
            quantidade: item.quantidade || 1
          }));
          const { error } = await supabase.from("ages_contrato_itens").insert(itensPayload);
          if (error) console.error("Erro ao salvar itens:", error);
        }

        // Salvar renovações
        await supabase.from("ages_contrato_renovacoes").delete().eq("contrato_id", contratoId);
        if (renovacoes.length > 0) {
          const renovacoesPayload = renovacoes.map(r => ({
            contrato_id: contratoId,
            data_vigencia: format(r.data_vigencia, 'yyyy-MM-dd'),
            percentual_reajuste: r.percentual_reajuste,
            valor: r.valor
          }));
          const { error } = await supabase.from("ages_contrato_renovacoes").insert(renovacoesPayload);
          if (error) console.error("Erro ao salvar renovações:", error);
        }

        // Salvar aditivos
        await supabase.from("ages_contrato_aditivos").delete().eq("contrato_id", contratoId);
        if (aditivos.length > 0) {
          const aditivosPayload = aditivos.map(a => ({
            contrato_id: contratoId,
            data_inicio: format(a.data_inicio, 'yyyy-MM-dd'),
            prazo_meses: a.prazo_meses,
            data_termino: format(a.data_termino, 'yyyy-MM-dd'),
            observacoes: a.observacoes || null
          }));
          const { error } = await supabase.from("ages_contrato_aditivos").insert(aditivosPayload);
          if (error) console.error("Erro ao salvar aditivos:", error);
        }
      }

      // Enviar email se usuários selecionados
      if (usuariosEmail.length > 0 && contratoId) {
        try {
          const cliente = clientes.find(c => c.id === formData.ages_cliente_id);
          await supabase.functions.invoke('send-contract-email', {
            body: {
              emails: usuariosEmail,
              contratoData: {
                cliente_nome: cliente?.nome_empresa || 'Cliente AGES',
                tipos_servico: formData.tipo_servico || [],
                status_assinatura: formData.assinado,
                valor_total: itensContrato.reduce((acc, item) => acc + (item.valor_item * (item.quantidade || 1)), 0),
                data_vigencia: formData.data_inicio ? format(formData.data_inicio, 'yyyy-MM-dd') : '',
                contrato_id: contratoId
              }
            }
          });
          toast.success(`Resumo enviado para ${usuariosEmail.length} destinatário(s)`);
        } catch (emailError) {
          console.error('Erro ao enviar email:', emailError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-contratos-com-aditivos"] });
      queryClient.invalidateQueries({ queryKey: ["ages-contratos"] });
      toast.success(contrato ? "Contrato atualizado" : "Contrato criado");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar");
    },
  });

  const acceptedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/svg+xml',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-zip-compressed'
  ];

  const acceptedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
                        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
                        'txt', 'csv', 'zip', 'rar'];

  const validateAndAddFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} excede o tamanho máximo de 50MB`);
        return false;
      }
      if (!acceptedTypes.includes(file.type) && file.type !== '') {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !acceptedExts.includes(ext)) {
          toast.error(`${file.name} não é um formato aceito`);
          return false;
        }
      }
      return true;
    });
    
    if (validFiles.length > 0) {
      setDocumentos(prev => [...prev, ...validFiles]);
      toast.success(`${validFiles.length} arquivo(s) adicionado(s)`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contrato ? "Editar Contrato" : "Novo Contrato"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
            <TabsTrigger value="itens">Itens do Contrato</TabsTrigger>
            <TabsTrigger value="renovacao">Renovação</TabsTrigger>
            {contrato?.id && (
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="cadastro" className="space-y-4 mt-4">
            <AbaCadastroContratoAges
              formData={formData}
              setFormData={setFormData}
              profissionais={profissionais}
              clientes={clientes}
              unidades={unidades}
              aditivos={aditivos}
              onAditivosChange={setAditivos}
            />

            {/* Área de Anexos - Igual ao GSS */}
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-base font-medium">Anexar Documentos</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('border-primary', 'bg-primary/5');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                  const files = Array.from(e.dataTransfer.files);
                  validateAndAddFiles(files);
                }}
                onClick={() => document.getElementById('ages-file-upload-input')?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Múltiplos arquivos permitidos</p>
              </div>
              <Input
                id="ages-file-upload-input"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.txt,.csv,.zip,.rar"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
                    validateAndAddFiles(files);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, imagens (JPG, PNG, GIF, BMP, WEBP, SVG), TXT, CSV, ZIP, RAR (máx. 50MB por arquivo)
              </p>

              {/* Novos arquivos selecionados */}
              {documentos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{documentos.length} arquivo(s) selecionado(s):</p>
                  <div className="grid grid-cols-2 gap-3">
                    {documentos.map((d, idx) => {
                      const iconImage = getFileIconImage(d.name);
                      return (
                        <div 
                          key={idx} 
                          className="relative flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-border hover:border-primary transition-colors"
                        >
                          {iconImage ? (
                            <img src={iconImage} alt="File icon" className="h-12 w-12 object-contain flex-shrink-0" />
                          ) : (
                            <File className="h-12 w-12 text-muted-foreground flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(d.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleRemoverArquivoNovo(idx)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Anexos existentes */}
              {documentosExistentes.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Anexos Existentes:</p>
                  <div className="relative">
                    <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory max-w-full" style={{ scrollbarWidth: 'thin' }}>
                      {documentosExistentes.map((doc) => {
                        const iconImage = getFileIconImage(doc.arquivo_nome);
                        
                        return (
                          <div 
                            key={doc.id} 
                            className="relative flex-shrink-0 w-48 flex flex-col bg-white rounded-lg border-2 border-border hover:border-primary transition-colors shadow-sm overflow-hidden snap-start"
                          >
                            {/* Botão de deletar */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8 z-10 bg-white/90 hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                              onClick={() => handleDeletarArquivoExistente(doc)}
                            >
                              <X className="h-4 w-4" />
                            </Button>

                            {/* Ícone do arquivo - Clicável para visualizar */}
                            <button
                              onClick={() => handleOpenFile(doc)}
                              className="flex items-center justify-center p-6 hover:bg-muted/50 transition-colors border-b border-border"
                              title="Clique no ícone para visualizar"
                            >
                              {iconImage ? (
                                <img src={iconImage} alt="File icon" className="h-20 w-20 object-contain" />
                              ) : (
                                <File className="h-20 w-20 text-muted-foreground" />
                              )}
                            </button>

                            {/* Nome do arquivo - Clicável para baixar */}
                            <button
                              onClick={() => handleDownloadFile(doc)}
                              className="flex flex-col items-center gap-1 p-3 hover:bg-muted/50 transition-colors"
                              title="Clique no texto para baixar"
                            >
                              <p className="text-xs font-medium text-primary hover:underline truncate w-full text-center px-2">
                                {doc.arquivo_nome}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(doc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')}
                              </p>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Seleção de usuários para email */}
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-base font-medium">Enviar Resumo por E-mail para:</Label>
              <div className="grid grid-cols-2 gap-2">
                {usuarios?.map((usuario) => (
                  <div key={usuario.email} className="flex items-center space-x-2">
                    <Checkbox
                      id={`ages-${usuario.email}`}
                      checked={usuariosEmail.includes(usuario.email)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setUsuariosEmail([...usuariosEmail, usuario.email]);
                        } else {
                          setUsuariosEmail(usuariosEmail.filter(e => e !== usuario.email));
                        }
                      }}
                    />
                    <label htmlFor={`ages-${usuario.email}`} className="text-sm">
                      {usuario.nome_completo} ({usuario.email})
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.data_inicio}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="itens" className="mt-4">
            <AbaItensContratoAges
              itens={itensContrato}
              onItensChange={setItensContrato}
            />
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.data_inicio}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="renovacao" className="mt-4">
            <AbaRenovacaoContratoAges
              renovacoes={renovacoes}
              onRenovacoesChange={setRenovacoes}
            />
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.data_inicio}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </TabsContent>

          {contrato?.id && (
            <TabsContent value="documentos" className="mt-4">
              <AgesContratoDocumentos contratoId={contrato.id} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>

      {/* Dialog de Visualização de Arquivo */}
      <Dialog 
        open={!!arquivoSelecionado} 
        onOpenChange={() => setArquivoSelecionado(null)}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="break-words text-sm sm:text-base pr-2">{arquivoSelecionado?.nome || 'Carregando...'}</span>
              {arquivoSelecionado && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = arquivoSelecionado.url;
                      a.download = arquivoSelecionado.nome;
                      a.click();
                      toast.success('Download iniciado');
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Baixar</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(arquivoSelecionado.url, '_blank');
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    <ExternalLink className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Nova Aba</span>
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/20">
            {arquivoSelecionado && (
              <iframe 
                src={`${arquivoSelecionado.url}#toolbar=1&navpanes=1&scrollbar=1`}
                className="w-full h-[70vh] border-0 rounded"
                title={arquivoSelecionado.nome}
                style={{ minHeight: '70vh' }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default AgesContratoDialog;
