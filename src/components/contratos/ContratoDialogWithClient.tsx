import { useEffect, useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addMonths, subDays } from "date-fns";
import { validateCNPJ, validatePhone } from "@/lib/validators";
import { normalizeToE164, formatPhoneForDisplay } from "@/lib/phoneUtils";
import { AbaCadastroContrato } from "./AbaCadastroContrato";
import { AbaItensContrato } from "./AbaItensContrato";
import { AbaRenovacaoContrato } from "./AbaRenovacaoContrato";
import { AbaAtividadesContrato } from "./AbaAtividadesContrato";
import { usePermissions } from "@/hooks/usePermissions";
import { registrarAuditoria, detectarCamposAlterados } from "@/lib/auditLogger";
import { getUserFriendlyError } from "@/lib/errorHandler";
import { parseLocalDate, formatDateToISO } from "@/lib/dateUtils";
import { Upload, FileText, FileImage, FileSpreadsheet, FileCode, FileArchive, File, Loader2, Download, ExternalLink, Eye, X } from "lucide-react";
import pdfIcon from "@/assets/file-icons/pdf.png";
import docIcon from "@/assets/file-icons/doc.png";
import docxIcon from "@/assets/file-icons/docx.png";
import xlsIcon from "@/assets/file-icons/xls.png";
import xlsxIcon from "@/assets/file-icons/xlsx.png";
import jpgIcon from "@/assets/file-icons/jpg.png";
import pngIcon from "@/assets/file-icons/png.png";
import gifIcon from "@/assets/file-icons/gif.png";
import bmpIcon from "@/assets/file-icons/bmp.png";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { EnviarResumoEmailModal } from "./EnviarResumoEmailModal";
import { Mail } from "lucide-react";

const formatCNPJ = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  return numbers
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
};

const formatTelefone = (value: string) => {
  if (!value) return '';
  let numbers = value.replace(/\D/g, '');
  
  // Remove código do país 55 se existir
  if (numbers.startsWith('55') && numbers.length > 11) {
    numbers = numbers.substring(2);
  }
  
  if (numbers.length <= 10) {
    // Fixo: (99) 9999-9999
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14);
  } else {
    // Celular: (99) 99999-9999
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15);
  }
};

const formSchema = z.object({
  // Dados do Cliente
  cnpj: z.string().min(14, "CNPJ é obrigatório").refine(validateCNPJ, "CNPJ inválido"),
  nome_fantasia: z.string().min(1, "Nome fantasia é obrigatório"),
  razao_social: z.string().min(1, "Razão social é obrigatória"),
  estado: z.string().optional(),
  endereco: z.string().min(1, "Endereço é obrigatório"),
  email_contato: z.string().email("E-mail inválido"),
  telefone_contato: z.string()
    .min(1, "Telefone é obrigatório")
    .refine((val) => {
      const clean = val.replace(/\D/g, '');
      return clean.length === 10 || clean.length === 11;
    }, "Telefone inválido. Digite 10 ou 11 dígitos (ex: 11 98765-4321)"),
  email_financeiro: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone_financeiro: z.string().optional(),
  nome_unidade: z.string().min(1, "Nome da unidade é obrigatório"),
  tipo_contratacao: z.enum(['credenciamento', 'licitacao', 'dispensa', 'direta_privada']).optional(),
  condicao_pagamento: z.string().optional(),
  valor_estimado: z.number().optional(),
  
  // Dados do Contrato
  codigo_contrato: z.string().min(1, "Código do contrato é obrigatório"),
  codigo_interno: z.number().optional(),
  tipo_servico: z.array(z.string()).min(1, "Selecione pelo menos um tipo de serviço"),
  objeto_contrato: z.string().optional(),
  data_inicio: z.date(),
  prazo_meses: z.number().min(1, "Prazo deve ser maior que 0").optional().nullable(),
  data_termino: z.date().optional().nullable(),
  status_contrato: z.enum(['Ativo', 'Inativo', 'Suspenso', 'Em Processo de Renovação']),
  assinado: z.enum(['Sim', 'Pendente', 'Em Análise', 'Aguardando Retorno']),
  motivo_pendente: z.string().optional().nullable(),
  dias_aviso_vencimento: z.number().min(30, "Mínimo 30 dias").max(60, "Máximo 60 dias").default(60),
});

interface TableConfig {
  contratos: string;
  contrato_itens: string;
  contrato_renovacoes: string;
  contrato_aditivos_tempo: string;
  contrato_anexos: string;
  queryKey: string;
  storageBucket: string;
}

const DEFAULT_TABLE_CONFIG: TableConfig = {
  contratos: 'contratos',
  contrato_itens: 'contrato_itens',
  contrato_renovacoes: 'contrato_renovacoes',
  contrato_aditivos_tempo: 'contrato_aditivos_tempo',
  contrato_anexos: 'contrato_anexos',
  queryKey: 'contratos',
  storageBucket: 'contratos-documentos',
};

interface ContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato?: any;
  mode?: 'view' | 'edit';
  tableConfig?: Partial<TableConfig>;
  dialogTitle?: string;
  allowCustomTipoContratacao?: boolean;
  tipoContratacaoCampoNome?: string;
  /** ID do rascunho de licitação a consolidar ao salvar este contrato */
  rascunhoId?: string;
  /** Dados pré-preenchidos vindos de uma licitação (para novo contrato via consolidação) */
  preenchimento?: {
    cnpj?: string;
    objeto_contrato?: string;
    valor_estimado?: number;
    tipo_contratacao?: string;
    licitacao_origem_id?: string;
    [key: string]: any;
  };
  onConsolidado?: (contratoId: string) => void;
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

export function ContratoDialogWithClient({ open, onOpenChange, contrato, mode = 'edit', tableConfig: tableConfigProp, dialogTitle, allowCustomTipoContratacao = false, tipoContratacaoCampoNome = "tipo_contratacao", rascunhoId, preenchimento, onConsolidado }: ContratoDialogProps) {
  const tables = { ...DEFAULT_TABLE_CONFIG, ...tableConfigProp };
  const isViewMode = mode === 'view';
  const queryClient = useQueryClient();
  const { isAdmin, isLeader } = usePermissions();
  const canViewAtividades = isAdmin || isLeader;
  const [clienteExistente, setClienteExistente] = useState<any>(null);
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [aditivos, setAditivos] = useState<AditivoTempo[]>([]);
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [documentosExistentes, setDocumentosExistentes] = useState<any[]>([]);
  const [usuariosEmail, setUsuariosEmail] = useState<string[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [anexoParaExcluir, setAnexoParaExcluir] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("cadastro");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<{ url: string; nome: string } | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cnpj: '',
      nome_fantasia: '',
      razao_social: '',
      estado: '',
      endereco: '',
      email_contato: '',
      telefone_contato: '',
      email_financeiro: '',
      telefone_financeiro: '',
      nome_unidade: '',
      tipo_contratacao: undefined,
      codigo_contrato: '',
      tipo_servico: [],
      objeto_contrato: '',
      data_inicio: new Date(),
      prazo_meses: 12,
      data_termino: null,
      condicao_pagamento: '',
      valor_estimado: undefined,
      status_contrato: 'Ativo',
      assinado: 'Pendente',
    },
  });

  const assinadoWatch = form.watch('assinado');
  const dataInicioWatch = form.watch('data_inicio');
  const prazoMesesWatch = form.watch('prazo_meses');
  const cnpjWatch = form.watch('cnpj');

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

  // Query para buscar usuários com perfis direção e gestão de contratos
  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-email-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          email, 
          nome_completo,
          user_roles!inner(role)
        `)
        .eq('status', 'ativo')
        .in('user_roles.role', ['diretoria', 'gestor_contratos']);
      
      if (error) throw error;
      return data;
    },
  });

  // ========================================
  // HIERARQUIA DE DATAS - REGRAS CRÍTICAS
  // ========================================
  // 
  // 🔒 REGRA 1: data_inicio do contrato PRINCIPAL é FIXA
  //    - Só pode ser alterada MANUALMENTE pelo usuário na UI
  //    - NUNCA pode ser alterada por lógica programática/aditivos
  //    - A função calcularDataTermino NÃO modifica data_inicio
  //
  // 📅 REGRA 2: data_termino é SEMPRE CALCULADA
  //    - Fórmula: data_inicio + prazo_meses - 1 dia
  //    - Campo desabilitado na UI (somente leitura)
  //
  // ➕ REGRA 3: Aditivos usam data_termino ANTERIOR como base
  //    - Primeiro aditivo: inicia após data_termino do contrato
  //    - Aditivos seguintes: inicia após data_termino do aditivo anterior
  //    - Aditivos NÃO modificam data_inicio do contrato principal
  //
  // ⛔ REGRA 4: Validações de hierarquia
  //    - Aditivo não pode ter data_inicio <= data anterior na sequência
  //    - Datas nunca podem "voltar" na linha do tempo
  
  // Armazena a data_inicio original ao carregar para comparação
  const [dataInicioOriginal, setDataInicioOriginal] = useState<Date | null>(null);
  
  useEffect(() => {
    const dataInicio = dataInicioWatch;
    const prazoMeses = prazoMesesWatch;

    // Só calcula data_termino - NUNCA modifica data_inicio
    if (dataInicio && prazoMeses && prazoMeses > 0) {
      // Calcular: data_inicio + prazo_meses - 1 dia
      const dataTerminoCalculada = subDays(addMonths(dataInicio, prazoMeses), 1);
      
      console.log('🔄 CALCULANDO data_termino (data_inicio PRESERVADA):', {
        data_inicio_preservada: dataInicio.toISOString().split('T')[0],
        prazo_meses: prazoMeses,
        data_termino_calculada: dataTerminoCalculada.toISOString().split('T')[0]
      });
      
      // Apenas atualiza data_termino - CAMPO CALCULADO, não editável
      form.setValue('data_termino', dataTerminoCalculada, { shouldValidate: false });
    }
  }, [dataInicioWatch, prazoMesesWatch, form]);

  // Auto-preenchimento ao digitar CNPJ
  useEffect(() => {
    const checkCNPJ = async () => {
      if (cnpjWatch && cnpjWatch.length >= 14 && validateCNPJ(cnpjWatch)) {
        const clean = cnpjWatch.replace(/\D/g, '');
        const { data } = await supabase
          .from('clientes')
          .select('*')
          .in('cnpj', [clean, cnpjWatch])
          .maybeSingle();
        
        if (data) {
          setClienteExistente(data);
          form.setValue('nome_fantasia', data.nome_fantasia || '');
          form.setValue('razao_social', data.razao_social || '');
          form.setValue('estado', data.estado || '');
          form.setValue('endereco', data.endereco || '');
          form.setValue('email_contato', data.email_contato || '');
          form.setValue('telefone_contato', formatTelefone(data.telefone_contato || ''));
          form.setValue('email_financeiro', data.email_financeiro || '');
          form.setValue('telefone_financeiro', formatTelefone(data.telefone_financeiro || ''));
        } else {
          setClienteExistente(null);
        }
      }
    };
    
    checkCNPJ();
  }, [cnpjWatch, form]);

  // Carregar dados ao editar
  useEffect(() => {
    if (contrato && open) {
      // 🔒 PROTEÇÃO: Armazena data_inicio original para referência
      // Usa parseLocalDate para evitar problema de timezone (um dia a menos)
      const dataInicioDoContrato = parseLocalDate(contrato.data_inicio) || new Date();
      const dataTerminoDoContrato = parseLocalDate(contrato.data_termino);
      setDataInicioOriginal(dataInicioDoContrato);
      
      console.log('🔒 CARREGANDO CONTRATO - data_inicio original preservada:', {
        contrato_id: contrato.id,
        data_inicio_original: contrato.data_inicio,
        data_inicio_parseada: dataInicioDoContrato.toISOString()
      });
      
      form.reset({
        cnpj: formatCNPJ(contrato.cliente?.cnpj || ''),
        nome_fantasia: contrato.cliente?.nome_fantasia || '',
        razao_social: contrato.cliente?.razao_social || '',
        estado: contrato.cliente?.estado || '',
        endereco: contrato.cliente?.endereco || '',
        email_contato: contrato.cliente?.email_contato || '',
        telefone_contato: formatPhoneForDisplay(contrato.cliente?.telefone_contato || ''),
        email_financeiro: contrato.cliente?.email_financeiro || '',
        telefone_financeiro: formatPhoneForDisplay(contrato.cliente?.telefone_financeiro || ''),
        nome_unidade: Array.isArray(contrato.unidades) ? contrato.unidades[0]?.nome || '' : contrato.unidades?.nome || contrato.cliente?.nome_unidade || '',
        tipo_contratacao: contrato.tipo_contratacao || undefined,
        codigo_contrato: contrato.codigo_contrato || '',
        codigo_interno: contrato.codigo_interno,
        tipo_servico: contrato.tipo_servico || [],
        objeto_contrato: contrato.objeto_contrato || '',
        condicao_pagamento: contrato.condicao_pagamento || '',
        valor_estimado: contrato.valor_estimado || undefined,
        data_inicio: dataInicioDoContrato,
        prazo_meses: contrato.prazo_meses || 12,
        data_termino: dataTerminoDoContrato,
        status_contrato: contrato.status_contrato || 'Ativo',
        assinado: contrato.assinado || 'Pendente',
        motivo_pendente: contrato.motivo_pendente || '',
        dias_aviso_vencimento: contrato.dias_aviso_vencimento || 60,
      });

      // Carregar todos os dados relacionados de forma síncrona
      const loadRelatedData = async () => {
        setIsLoadingData(true);
        try {
          const [itensResult, renovacoesResult, aditivosResult, anexosResult] = await Promise.all([
            // Carregar itens
            supabase
              .from(tables.contrato_itens as any)
              .select('*')
              .eq('contrato_id', contrato.id),
            // Carregar renovações
            supabase
              .from(tables.contrato_renovacoes as any)
              .select('*')
              .eq('contrato_id', contrato.id),
            // Carregar aditivos de tempo
            supabase
              .from(tables.contrato_aditivos_tempo as any)
              .select('*')
              .eq('contrato_id', contrato.id)
              .order('data_inicio', { ascending: true }),
            // Carregar anexos existentes
            supabase
              .from(tables.contrato_anexos as any)
              .select('*')
              .eq('contrato_id', contrato.id)
              .order('created_at', { ascending: false }),
          ]);

          // Processar itens
          if (itensResult.data) {
            setItensContrato((itensResult.data as any[]).map((item: any) => ({
              id: item.id,
              item: item.item,
              valor_item: parseFloat(item.valor_item as any),
              quantidade: item.quantidade || 1,
            })));
          }

          // Processar renovações
          if (renovacoesResult.data) {
            setRenovacoes((renovacoesResult.data as any[]).map((ren: any) => ({
              id: ren.id,
              data_vigencia: parseLocalDate(ren.data_vigencia) || new Date(),
              percentual_reajuste: parseFloat(ren.percentual_reajuste as any) || 0,
              valor: parseFloat(ren.valor as any),
            })));
          }

          // Processar aditivos
          if (aditivosResult.data) {
            setAditivos((aditivosResult.data as any[]).map((adt: any) => ({
              id: adt.id,
              data_inicio: parseLocalDate(adt.data_inicio) || new Date(),
              prazo_meses: adt.prazo_meses,
              data_termino: parseLocalDate(adt.data_termino) || new Date(),
              observacoes: adt.observacoes || undefined,
            })));
          }

          // Processar anexos
          if (anexosResult.data) {
            setDocumentosExistentes(anexosResult.data);
          }
        } finally {
          setIsLoadingData(false);
        }
      };

      loadRelatedData();
      setClienteExistente(contrato.cliente);
    } else if (open && !contrato) {
      // Reset para novo contrato
      setDataInicioOriginal(null);
      form.reset({
        cnpj: preenchimento?.cnpj ? preenchimento.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '',
        nome_fantasia: '',
        razao_social: '',
        estado: '',
        endereco: '',
        email_contato: '',
        telefone_contato: '',
        email_financeiro: '',
        telefone_financeiro: '',
        nome_unidade: '',
        tipo_contratacao: (preenchimento?.tipo_contratacao as any) || undefined,
        codigo_contrato: '',
        tipo_servico: [],
        objeto_contrato: preenchimento?.objeto_contrato || '',
        condicao_pagamento: '',
        valor_estimado: preenchimento?.valor_estimado || undefined,
        data_inicio: new Date(),
        prazo_meses: 12,
        data_termino: null,
        status_contrato: 'Ativo',
        assinado: 'Pendente',
        motivo_pendente: '',
      });
      // Pré-popular itens com serviços da licitação, se houver
      setItensContrato(preenchimento?.itens_contrato || []);
      setRenovacoes([]);
      setAditivos([]);
      setDocumentos([]);
      setDocumentosExistentes([]);
      setUsuariosEmail([]);
      setClienteExistente(null);
      setActiveTab("cadastro");
    } else if (!open) {
      // Reset ao fechar
      setDataInicioOriginal(null);
      isSavingRef.current = false; // 🔒 Limpa trava de salvamento
      form.reset();
      setItensContrato([]);
      setRenovacoes([]);
      setAditivos([]);
      setDocumentos([]);
      setDocumentosExistentes([]);
      setUsuariosEmail([]);
      setClienteExistente(null);
      setActiveTab("cadastro");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrato, open, form, preenchimento]);

  const saveMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      console.log('=== INICIANDO SALVAMENTO DE CONTRATO ===');
      console.log('Telefone digitado:', values.telefone_contato);
      console.log('Telefone financeiro digitado:', values.telefone_financeiro);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('❌ Erro de autenticação:', authError);
        throw new Error('Usuário não autenticado');
      }
      if (!user) {
        console.error('❌ Usuário não encontrado');
        throw new Error('Usuário não autenticado');
      }
      
      console.log('✅ Usuário autenticado:', { id: user.id, email: user.email });

      // 1. Salvar ou atualizar cliente
      // Limpar e normalizar telefone principal
      const telefoneE164 = normalizeToE164(values.telefone_contato);
      console.log('📱 Telefone original:', values.telefone_contato);
      console.log('📱 Telefone E164:', telefoneE164);
      
      if (!telefoneE164) {
        const digitsOnly = values.telefone_contato.replace(/\D/g, '');
        throw new Error(
          `Telefone inválido: "${values.telefone_contato}". ` +
          `O número deve ter 10 ou 11 dígitos (você digitou ${digitsOnly.length}). ` +
          `Exemplo: (11) 98765-4321 ou (11) 3456-7890`
        );
      }
      
      // Limpar e normalizar telefone financeiro (opcional)
      let telefoneFinanceiroE164: string | null = null;
      if (values.telefone_financeiro && values.telefone_financeiro.trim()) {
        telefoneFinanceiroE164 = normalizeToE164(values.telefone_financeiro);
        console.log('💰 Telefone financeiro original:', values.telefone_financeiro);
        console.log('💰 Telefone financeiro E164:', telefoneFinanceiroE164);
        
        if (!telefoneFinanceiroE164) {
          const digitsOnly = values.telefone_financeiro.replace(/\D/g, '');
          throw new Error(
            `Telefone financeiro inválido: "${values.telefone_financeiro}". ` +
            `O número deve ter 10 ou 11 dígitos (você digitou ${digitsOnly.length}). ` +
            `Exemplo: (11) 98765-4321 ou (11) 3456-7890`
          );
        }
      }

      const cleanCNPJ = values.cnpj.replace(/\D/g, '');
      console.log('📋 CNPJ limpo:', cleanCNPJ);

      const clienteData = {
        cnpj: cleanCNPJ,
        nome_fantasia: values.nome_fantasia,
        razao_social: values.razao_social,
        nome_empresa: values.nome_fantasia,
        estado: values.estado || null,
        endereco: values.endereco,
        email_contato: values.email_contato,
        telefone_contato: telefoneE164,
        email_financeiro: values.email_financeiro || null,
        telefone_financeiro: telefoneFinanceiroE164,
        contato_principal: values.nome_fantasia,
      };
      
      console.log('📄 Dados do cliente:', clienteData);

      // Buscar cliente existente por CNPJ (normalizado ou como digitado)
      console.log('🔍 Buscando cliente existente...');
      const { data: clienteExist, error: clienteFindError } = await supabase
        .from('clientes')
        .select('id')
        .in('cnpj', [cleanCNPJ, values.cnpj])
        .maybeSingle();

      if (clienteFindError && clienteFindError.code !== 'PGRST116') {
        // PGRST116 is no rows returned for maybeSingle
        console.error('❌ Erro ao buscar cliente:', clienteFindError);
        throw new Error(`Erro ao buscar cliente: ${clienteFindError.message}`);
      }

      let clienteId: string;
      if (clienteExist?.id) {
        console.log('✏️ Atualizando cliente existente:', clienteExist.id);
        const { error: updateClienteError } = await supabase
          .from('clientes')
          .update(clienteData)
          .eq('id', clienteExist.id);
        
        if (updateClienteError) {
          console.error('❌ Erro ao atualizar cliente:', updateClienteError);
          throw new Error(`Erro ao atualizar cliente: ${updateClienteError.message}`);
        }
        clienteId = clienteExist.id;
        console.log('✅ Cliente atualizado com sucesso');
      } else {
        console.log('➕ Criando novo cliente...');
        const { data: novoCliente, error: insertClienteError } = await supabase
          .from('clientes')
          .insert([clienteData])
          .select()
          .single();
        
        if (insertClienteError) {
          console.error('❌ Erro ao criar cliente:', insertClienteError);
          throw new Error(`Erro ao criar cliente: ${insertClienteError.message}`);
        }
        clienteId = novoCliente.id;
        console.log('✅ Cliente criado com sucesso:', clienteId);
      }

      // 2. Upload de documentos
      console.log('📤 Verificando documentos para upload...');
      let documentoUrls: string[] = [];
      if (documentos.length > 0) {
        console.log(`📎 ${documentos.length} documento(s) para fazer upload`);
        const { data: profileData } = await supabase
          .from('profiles')
          .select('nome_completo')
          .eq('id', user.id)
          .single();

        for (const doc of documentos) {
          // Sanitizar nome do arquivo removendo caracteres especiais
          const sanitizedName = doc.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-zA-Z0-9.-]/g, '_'); // Substitui caracteres especiais por underscore
          
          const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || '';
          const fileName = `${Date.now()}-${sanitizedName}`;
          
          console.log(`⬆️ Fazendo upload do arquivo: ${fileName}`);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(tables.storageBucket)
            .upload(fileName, doc, {
              cacheControl: '3600',
              contentType: doc.type || 'application/octet-stream',
              upsert: false
            });

          if (uploadError) {
            console.error('❌ Erro no upload:', uploadError);
            throw new Error(`Erro ao fazer upload de ${doc.name}: ${uploadError.message}`);
          }

          const { data: { publicUrl } } = supabase.storage
            .from(tables.storageBucket)
            .getPublicUrl(fileName);

          documentoUrls.push(publicUrl);
          console.log(`✅ Arquivo enviado: ${publicUrl}`);

          // Registrar anexo no histórico (será feito após salvar o contrato)
        }
      } else {
        console.log('ℹ️ Nenhum documento para fazer upload');
      }

      // 3. Criar ou buscar unidade baseada no nome_unidade
      console.log('🏢 Processando unidade...');
      let unidadeId = null;
      if (values.nome_unidade && values.nome_unidade.trim()) {
        console.log(`🔍 Buscando unidade: ${values.nome_unidade.trim()}`);
        const { data: unidadeExist, error: unidadeFindError } = await supabase
          .from('unidades')
          .select('id')
          .eq('cliente_id', clienteId)
          .eq('nome', values.nome_unidade.trim())
          .maybeSingle();

        if (unidadeFindError) {
          console.error('❌ Erro ao buscar unidade:', unidadeFindError);
          throw new Error(`Erro ao buscar unidade: ${unidadeFindError.message}`);
        }

        if (unidadeExist) {
          unidadeId = unidadeExist.id;
          console.log(`✅ Unidade encontrada: ${unidadeId}`);
        } else {
          console.log('➕ Criando nova unidade...');
          const { data: novaUnidade, error: insertUnidadeError } = await supabase
            .from('unidades')
            .insert([{
              cliente_id: clienteId,
              nome: values.nome_unidade.trim(),
            }])
            .select()
            .single();
          
          if (insertUnidadeError) {
            console.error('❌ Erro ao criar unidade:', insertUnidadeError);
            throw new Error(`Erro ao criar unidade: ${insertUnidadeError.message}`);
          }
          unidadeId = novaUnidade.id;
          console.log(`✅ Unidade criada: ${unidadeId}`);
        }
      } else {
        console.log('ℹ️ Nenhuma unidade especificada');
      }

      // 4. Salvar ou atualizar contrato
      console.log('📝 Preparando dados do contrato...');
      
      // ========================================
      // 🔒 VALIDAÇÃO CRÍTICA: data_inicio
      // ========================================
      // Em edição: verifica se data_inicio foi alterada apenas pelo usuário na UI
      // Em criação: usa a data definida pelo usuário
      
      // HIERARQUIA: data_termino é SEMPRE calculada (data_inicio + prazo_meses - 1 dia)
      // NUNCA modificamos data_inicio programaticamente aqui
      const prazoMeses = values.prazo_meses || 12;
      const dataTermino = subDays(addMonths(values.data_inicio, prazoMeses), 1);
      
      console.log('🔒 SALVAMENTO - Verificação de hierarquia de datas:', {
        data_inicio_usuario: values.data_inicio,
        prazo_meses: prazoMeses,
        data_termino_calculada: dataTermino,
        modo: contrato?.id ? 'EDIÇÃO' : 'CRIAÇÃO',
        data_inicio_original: contrato?.data_inicio || 'N/A (novo contrato)'
      });
      
      // Log explícito para auditoria
      if (contrato?.id) {
        console.log('🔒 AUDITORIA: Comparando data_inicio:', {
          original_no_banco: contrato.data_inicio,
          nova_do_formulario: values.data_inicio,
          foi_alterada: contrato.data_inicio !== values.data_inicio.toISOString().split('T')[0]
        });
      }

      // Formatar datas sem problemas de timezone (YYYY-MM-DD)
      const formatarData = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Dados base do contrato (sem codigo_interno - deixa o banco gerar via sequência)
      const contratoDataBase = {
        cliente_id: clienteId,
        unidade_id: unidadeId,
        codigo_contrato: values.codigo_contrato,
        tipo_servico: values.tipo_servico,
        objeto_contrato: values.objeto_contrato || null,
        tipo_contratacao: values.tipo_contratacao || null,
        condicao_pagamento: values.condicao_pagamento || null,
        valor_estimado: values.valor_estimado || null,
        data_inicio: formatarData(values.data_inicio),
        prazo_meses: prazoMeses,
        data_termino: formatarData(dataTermino),
        data_fim: formatarData(dataTermino), // Mantém compatibilidade com o banco
        status_contrato: values.status_contrato,
        assinado: values.assinado,
        motivo_pendente: values.assinado === 'Pendente' ? (values.motivo_pendente || null) : null,
        documento_url: documentoUrls[0] || contrato?.documento_url || null,
        dias_aviso_vencimento: values.dias_aviso_vencimento || 60,
        // Preservar campos relacionais existentes para auditoria correta
        medico_id: contrato?.medico_id || null,
        especialidade_contrato: contrato?.especialidade_contrato || null,
        licitacao_origem_id: contrato?.licitacao_origem_id || preenchimento?.licitacao_origem_id || null,
      };
      
      // Para updates, incluir codigo_interno se já existir (para não perder o valor)
      // Para inserts, NÃO incluir para deixar o banco gerar automaticamente via sequência
      const contratoData = contrato?.id && values.codigo_interno 
        ? { ...contratoDataBase, codigo_interno: values.codigo_interno }
        : contratoDataBase;

      console.log('📋 Dados do contrato a salvar:', contratoData);

      let contratoId: string;
      if (contrato?.id) {
        console.log('✏️ Atualizando contrato existente:', contrato.id);
        
        // Buscar dados antigos para auditoria
        const { data: contratoAntigo } = await supabase
          .from(tables.contratos as any)
          .select('*')
          .eq('id', contrato.id)
          .single();
        
        const { error: contratoError } = await supabase
          .from(tables.contratos as any)
          .update(contratoData)
          .eq('id', contrato.id);

        if (contratoError) {
          console.error('❌ Erro ao atualizar contrato:', contratoError);
          throw contratoError;
        }
        contratoId = contrato.id;
        console.log('✅ Contrato atualizado com sucesso');
        
        // Registrar auditoria de edição
        if (contratoAntigo) {
          const { camposAlterados, valoresAntigos, valoresNovos } = detectarCamposAlterados(
            contratoAntigo,
            contratoData
          );
          
          if (camposAlterados.length > 0) {
            await registrarAuditoria({
              modulo: 'contratos',
              tabela: 'contratos',
              acao: 'editar',
              registroId: contratoId,
              registroDescricao: `Contrato ${values.codigo_contrato}`,
              dadosAntigos: valoresAntigos,
              dadosNovos: valoresNovos,
              camposAlterados,
              detalhes: `Editou contrato ${values.codigo_contrato}`,
            });
          }
        }
      } else {
        console.log('➕ Criando novo contrato...');
        const { data: novoContrato, error: contratoError } = await supabase
          .from(tables.contratos as any)
          .insert(contratoData)
          .select()
          .single() as { data: any; error: any };

        if (contratoError) {
          console.error('❌ Erro ao criar contrato:', contratoError);
          throw contratoError;
        }
        contratoId = novoContrato.id;
        console.log('✅ Contrato criado com sucesso:', contratoId);
        
        // Registrar auditoria de criação
        await registrarAuditoria({
          modulo: 'contratos',
          tabela: 'contratos',
          acao: 'criar',
          registroId: contratoId,
          registroDescricao: `Contrato ${values.codigo_contrato}`,
          dadosNovos: contratoData,
          detalhes: `Criou novo contrato ${values.codigo_contrato}`,
        });
      }

      console.log('💾 Processando itens, renovações e aditivos...');

      // 4. Salvar itens do contrato
      // Buscar itens antigos antes de deletar (para auditoria)
      let itensAntigos: any[] = [];
      if (contrato?.id) {
        const { data: itensAntigosData } = await supabase
          .from(tables.contrato_itens as any)
          .select('*')
          .eq('contrato_id', contratoId);
        itensAntigos = itensAntigosData || [];
        
        const { error: deleteItensError } = await supabase
          .from(tables.contrato_itens as any)
          .delete()
          .eq('contrato_id', contratoId);

        if (deleteItensError) throw deleteItensError;
      }

      // Inserir itens apenas se houver algum - com proteção contra duplicatas
      const itensUnicos = itensContrato.reduce((acc, item) => {
        const chave = `${item.item}_${item.valor_item}_${item.quantidade || 1}`;
        if (!acc.chaves.has(chave)) {
          acc.chaves.add(chave);
          acc.itens.push(item);
        } else {
          console.warn('⚠️ Item duplicado detectado e removido:', item.item);
        }
        return acc;
      }, { chaves: new Set<string>(), itens: [] as typeof itensContrato }).itens;

      if (itensUnicos.length !== itensContrato.length) {
        console.warn(`⚠️ Removidos ${itensContrato.length - itensUnicos.length} itens duplicados`);
      }

      if (itensUnicos.length > 0) {
        const itensData = itensUnicos.map((item) => ({
          contrato_id: contratoId,
          item: item.item,
          valor_item: item.valor_item,
          quantidade: item.quantidade || 1,
        }));

        console.log('💾 Salvando', itensData.length, 'itens (após deduplicação)');

        const { error: itensError } = await supabase
          .from(tables.contrato_itens as any)
          .insert(itensData);

        if (itensError) throw itensError;
      }
      
      // Auditoria de itens - comparar antigos vs novos
      const valorTotalAntigo = itensAntigos.reduce((sum, i) => sum + (i.valor_item * (i.quantidade || 1)), 0);
      const valorTotalNovo = itensUnicos.reduce((sum, i) => sum + (i.valor_item * (i.quantidade || 1)), 0);
      const itensAntigosNomes = itensAntigos.map(i => i.item).sort().join(', ');
      const itensNovosNomes = itensUnicos.map(i => i.item).sort().join(', ');
      
      if (contrato?.id && (itensAntigos.length !== itensUnicos.length || valorTotalAntigo !== valorTotalNovo || itensAntigosNomes !== itensNovosNomes)) {
        await registrarAuditoria({
          modulo: 'contratos',
          tabela: 'contrato_itens',
          acao: 'editar',
          registroId: contratoId,
          registroDescricao: `Contrato ${values.codigo_contrato}`,
          dadosAntigos: { 
            quantidade_itens: itensAntigos.length, 
            valor_total: valorTotalAntigo,
            itens: itensAntigosNomes || '(nenhum)'
          },
          dadosNovos: { 
            quantidade_itens: itensUnicos.length, 
            valor_total: valorTotalNovo,
            itens: itensNovosNomes || '(nenhum)'
          },
          camposAlterados: ['quantidade_itens', 'valor_total', 'itens'],
          detalhes: `Alterou itens do contrato ${values.codigo_contrato}`,
        });
      }

      // 5. Salvar renovações
      // Buscar renovações antigas antes de deletar (para auditoria)
      let renovacoesAntigas: any[] = [];
      if (contrato?.id) {
        const { data: renovacoesAntigasData } = await supabase
          .from(tables.contrato_renovacoes as any)
          .select('*')
          .eq('contrato_id', contratoId);
        renovacoesAntigas = renovacoesAntigasData || [];
        
        await supabase
          .from(tables.contrato_renovacoes as any)
          .delete()
          .eq('contrato_id', contratoId);
      }

      if (renovacoes.length > 0) {
        const renovacoesData = renovacoes.map(ren => ({
          contrato_id: contratoId,
          data_vigencia: formatarData(ren.data_vigencia),
          percentual_reajuste: ren.percentual_reajuste,
          valor: ren.valor,
        }));

        const { error: renovacoesError } = await supabase
          .from(tables.contrato_renovacoes as any)
          .insert(renovacoesData);

        if (renovacoesError) throw renovacoesError;
      }
      
      // Auditoria de renovações
      if (contrato?.id && (renovacoesAntigas.length !== renovacoes.length || renovacoes.length > 0)) {
        const valorRenovacoesAntigo = renovacoesAntigas.reduce((sum, r) => sum + (r.valor || 0), 0);
        const valorRenovacoesNovo = renovacoes.reduce((sum, r) => sum + (r.valor || 0), 0);
        
        if (renovacoesAntigas.length !== renovacoes.length || valorRenovacoesAntigo !== valorRenovacoesNovo) {
          await registrarAuditoria({
            modulo: 'contratos',
            tabela: 'contrato_renovacoes',
            acao: 'editar',
            registroId: contratoId,
            registroDescricao: `Contrato ${values.codigo_contrato}`,
            dadosAntigos: { 
              quantidade_renovacoes: renovacoesAntigas.length, 
              valor_total: valorRenovacoesAntigo
            },
            dadosNovos: { 
              quantidade_renovacoes: renovacoes.length, 
              valor_total: valorRenovacoesNovo
            },
            camposAlterados: ['quantidade_renovacoes', 'valor_total'],
            detalhes: `Alterou renovações do contrato ${values.codigo_contrato}`,
          });
        }
      }

      // 6. Salvar aditivos de tempo
      // Buscar aditivos antigos antes de deletar (para auditoria)
      let aditivosAntigos: any[] = [];
      if (contrato?.id) {
        const { data: aditivosAntigosData } = await supabase
          .from(tables.contrato_aditivos_tempo as any)
          .select('*')
          .eq('contrato_id', contratoId);
        aditivosAntigos = aditivosAntigosData || [];
        
        await supabase
          .from(tables.contrato_aditivos_tempo as any)
          .delete()
          .eq('contrato_id', contratoId);
      }

      // Inserir novos aditivos apenas se houver algum
      if (aditivos.length > 0) {
        const formatarDataAditivo = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const aditivosData = aditivos.map(adt => ({
          contrato_id: contratoId,
          data_inicio: formatarDataAditivo(adt.data_inicio),
          prazo_meses: adt.prazo_meses,
          data_termino: formatarDataAditivo(adt.data_termino),
          observacoes: adt.observacoes || null,
        }));

        const { error: aditivosError } = await supabase
          .from(tables.contrato_aditivos_tempo as any)
          .insert(aditivosData);

        if (aditivosError) throw aditivosError;
      }
      
      // Auditoria de aditivos
      if (contrato?.id && (aditivosAntigos.length !== aditivos.length || aditivos.length > 0)) {
        const prazoTotalAntigo = aditivosAntigos.reduce((sum, a) => sum + (a.prazo_meses || 0), 0);
        const prazoTotalNovo = aditivos.reduce((sum, a) => sum + (a.prazo_meses || 0), 0);
        
        if (aditivosAntigos.length !== aditivos.length || prazoTotalAntigo !== prazoTotalNovo) {
          await registrarAuditoria({
            modulo: 'contratos',
            tabela: 'contrato_aditivos_tempo',
            acao: 'editar',
            registroId: contratoId,
            registroDescricao: `Contrato ${values.codigo_contrato}`,
            dadosAntigos: { 
              quantidade_aditivos: aditivosAntigos.length, 
              prazo_total_meses: prazoTotalAntigo
            },
            dadosNovos: { 
              quantidade_aditivos: aditivos.length, 
              prazo_total_meses: prazoTotalNovo
            },
            camposAlterados: ['quantidade_aditivos', 'prazo_total_meses'],
            detalhes: `Alterou aditivos de tempo do contrato ${values.codigo_contrato}`,
          });
        }
      }

      // 7. Registrar anexos no histórico
      if (documentos.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('nome_completo')
          .eq('id', user.id)
          .single();

        const anexosData = documentos.map((doc, index) => ({
          contrato_id: contratoId,
          arquivo_nome: doc.name,
          arquivo_url: documentoUrls[index],
          usuario_id: user.id,
          usuario_nome: profileData?.nome_completo || 'Usuário',
        }));

        await supabase
          .from(tables.contrato_anexos as any)
          .insert(anexosData);
        
        // Registrar auditoria para cada arquivo anexado
        for (const doc of documentos) {
          await registrarAuditoria({
            modulo: 'contratos',
            tabela: 'contrato_anexos',
            acao: 'anexar',
            registroId: contratoId,
            registroDescricao: `Contrato ${values.codigo_contrato}`,
            dadosNovos: { arquivo_nome: doc.name },
            camposAlterados: ['arquivo_nome'],
            detalhes: `Anexou arquivo "${doc.name}" ao contrato ${values.codigo_contrato}`,
          });
        }
      }

      // Email é enviado separadamente via modal

      return { contratoId };
    },
    onSuccess: async (result) => {
      console.log('🎉 SUCESSO - Contrato salvo no banco!');
      
      toast.success(contrato ? 'Contrato atualizado com sucesso!' : 'Contrato criado com sucesso!');

      // Se vier de consolidação de rascunho, marcar como consolidado
      // Nota: rascunhoId é o indicador principal — não depende de !contrato,
      // pois o pré-contrato automático pode ter sido passado como 'contrato' para edição.
      if (rascunhoId && result?.contratoId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          // Buscar o rascunho para verificar se há pré-contrato automático vinculado
          const { data: rascunho } = await supabase
            .from('contrato_rascunho')
            .select('contrato_id, status')
            .eq('id', rascunhoId)
            .maybeSingle();

          // Marcar rascunho como consolidado
          await supabase
            .from('contrato_rascunho')
            .update({
              status: 'consolidado',
              contrato_id: result.contratoId,
              consolidado_em: new Date().toISOString(),
              consolidado_por: user?.id || null,
            })
            .eq('id', rascunhoId);

          // Copiar anexos do rascunho para o contrato real
          const { data: anexosRascunho } = await supabase
            .from('contrato_rascunho_anexos')
            .select('*')
            .eq('contrato_rascunho_id', rascunhoId);

          if (anexosRascunho && anexosRascunho.length > 0) {
            const anexosParaContrato = anexosRascunho.map((anexo: any) => ({
              contrato_id: result.contratoId,
              arquivo_url: anexo.arquivo_url,
              arquivo_nome: anexo.arquivo_nome,
              usuario_id: user?.id || null,
              usuario_nome: 'Sistema (consolidação)',
            }));

            await supabase
              .from('contrato_anexos')
              .insert(anexosParaContrato);
          }

          // Se havia um pré-contrato automático diferente do contrato novo,
          // transferir o codigo_interno e remover o pré-contrato
          const preContratoId = rascunho?.contrato_id;
          if (preContratoId && preContratoId !== result.contratoId) {
            const { data: preContrato } = await supabase
              .from('contratos')
              .select('codigo_interno')
              .eq('id', preContratoId)
              .maybeSingle();

            if (preContrato?.codigo_interno) {
              await supabase
                .from('contratos')
                .update({ codigo_interno: preContrato.codigo_interno })
                .eq('id', result.contratoId);
            }

            // Remover o pré-contrato automático (substituído pelo real)
            await supabase
              .from('contratos')
              .delete()
              .eq('id', preContratoId);
          }

          queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
          queryClient.invalidateQueries({ queryKey: ['contratos-temporarios'] });
          onConsolidado?.(result.contratoId);
        } catch (e) {
          console.error('Erro ao consolidar rascunho:', e);
        }
      }
      
      try {
        console.log('🔄 Invalidando cache e refazendo queries...');
        await queryClient.invalidateQueries({ 
          queryKey: [tables.queryKey],
          refetchType: 'all'
        });
        await queryClient.invalidateQueries({ 
          queryKey: ['clientes'],
          refetchType: 'all'
        });
        console.log('✅ Cache invalidado com sucesso!');
      } catch (error) {
        console.error('Erro ao invalidar cache:', error);
      }
    },
    onError: (error: any) => {
      // Log completo para debug
      console.error('=== ERRO DETALHADO AO SALVAR CONTRATO ===');
      console.error('Erro completo:', error);
      console.error('Mensagem:', error?.message);
      console.error('Código:', error?.code);
      console.error('Details:', error?.details);
      console.error('Hint:', error?.hint);
      console.error('=========================================');
      
      let friendlyError = getUserFriendlyError(error);
      
      // Erros de telefone inválido
      if (error?.message?.includes('phone') || error?.message?.includes('parsePhoneNumber') || error?.message?.includes('telefone')) {
        friendlyError = 'Formato de telefone inválido. Use o formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX';
      }
      
      // Erros de upload de arquivo
      if (error?.message?.includes('upload')) {
        friendlyError = `Erro ao fazer upload do arquivo. Verifique se o arquivo não está corrompido e tente novamente. ${error.message}`;
      }
      
      // Erros de storage
      if (error?.message?.includes('storage') || error?.message?.includes('bucket')) {
        friendlyError = `Erro ao salvar arquivo no storage. ${error.message}`;
      }
      
      // Erros de tipo de arquivo (somente quando houver documentos anexados)
      const hasAnexos = documentos && documentos.length > 0;
      const msg = String(error?.message || '').toLowerCase();
      if (hasAnexos && (msg.includes('mime') || msg.includes('content-type') || msg.includes('file type') || msg.includes('unsupported'))) {
        friendlyError = 'Formato de arquivo não aceito. Use apenas os formatos listados.';
      }
      
      // Erros de RLS/Permissão
      if (error?.code === '42501' || msg.includes('policy') || msg.includes('permission')) {
        friendlyError = 'Você não tem permissão para realizar esta ação. Entre em contato com o administrador do sistema.';
      }
      
      // Melhorar mensagem para campos obrigatórios do banco
      if (error?.code === '23502' && error?.message) {
        const match = error.message.match(/column "(\w+)"/);
        if (match) {
          const fieldLabels: Record<string, string> = {
            telefone_contato: 'Telefone Contrato',
            email_contato: 'Email Contrato',
            cnpj: 'CNPJ',
            nome_fantasia: 'Nome Fantasia',
            razao_social: 'Razão Social',
            endereco: 'Endereço',
          };
          const fieldName = fieldLabels[match[1]] || match[1];
          friendlyError = `Campo obrigatório não preenchido: ${fieldName}`;
        }
      }
      
      // Melhorar mensagem para constraints CHECK
      if (error?.code === '23514' && error?.message) {
        if (error.message.includes('contratos_status_contrato_check')) {
          friendlyError = 'Status do Contrato inválido. Valores aceitos: Ativo, Inativo, Suspenso ou Em Processo de Renovação';
        } else if (error.message.includes('contratos_especialidade_contrato_check')) {
          friendlyError = 'Especialidade inválida. Valores aceitos: Hospital, Clínica, Pessoa Física ou Pessoa Jurídica';
        } else if (error.message.includes('check_cliente_ou_medico')) {
          friendlyError = 'Selecione um Cliente ou um Médico (não ambos)';
        }
      }
      
      toast.error(friendlyError, { duration: 8000 });
    },
  });

  // 🔒 Ref para proteção contra duplo clique / race condition
  const isSavingRef = useRef(false);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Proteção contra duplo clique - bloqueia imediatamente sem depender do ciclo de renderização
    if (isSavingRef.current) {
      console.warn('⚠️ Save já em andamento, ignorando chamada duplicada');
      return;
    }
    
    isSavingRef.current = true;
    saveMutation.mutate(values, {
      onSettled: () => {
        isSavingRef.current = false;
      }
    });
  };

  const handleOpenFile = async (doc: any) => {
    try {
      console.log('📄 Abrindo arquivo:', doc.arquivo_nome);
      
      // Extrair a chave do arquivo da URL
      const getKeyFromUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http')) {
          const marker = `/${tables.storageBucket}/`;
          const idx = url.indexOf(marker);
          return idx !== -1 ? url.substring(idx + marker.length) : '';
        }
        return url;
      };

      const key = getKeyFromUrl(doc.arquivo_url);
      if (!key) throw new Error('Caminho do arquivo inválido');

      // Criar URL assinada (válida por 10 minutos)
      const { data, error } = await supabase.storage
        .from(tables.storageBucket)
        .createSignedUrl(key, 60 * 10);

      if (error) throw error;

      if (data?.signedUrl) {
        const signedUrl = data.signedUrl.startsWith('http') 
          ? data.signedUrl 
          : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${data.signedUrl}`;
        
        setArquivoSelecionado({ 
          url: signedUrl, 
          nome: doc.arquivo_nome 
        });
      } else {
        throw new Error('Não foi possível gerar URL assinada');
      }
    } catch (error) {
      console.error('❌ Erro ao abrir arquivo:', error);
      toast.error('Erro ao abrir arquivo');
    }
  };

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

  const handleDownloadFile = async (doc: any) => {
    try {
      const urlParts = doc.arquivo_url.split(`/${tables.storageBucket}/`);
      if (urlParts.length < 2) {
        toast.error('URL do arquivo inválida');
        return;
      }
      
      const filePath = decodeURIComponent(urlParts[1]);
      const { data, error } = await supabase.storage
        .from(tables.storageBucket)
        .download(filePath);

      if (error) {
        toast.error('Erro ao baixar arquivo');
        return;
      }

      const blob = new Blob([data]);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.arquivo_nome;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleRemoverArquivoNovo = (index: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== index));
    toast.success('Arquivo removido');
  };

  const handleDeletarArquivoExistente = async (doc: any) => {
    try {
      const codigoContrato = contrato?.codigo_contrato || form.getValues('codigo_contrato') || 'Contrato';
      const contratoId = contrato?.id || '';

      // Guardar dados ANTES de deletar para o log
      const dadosAuditoria = {
        arquivo_nome: doc.arquivo_nome,
        arquivo_url: doc.arquivo_url,
        tipo_documento: doc.tipo_documento || null,
        id: doc.id,
      };

      const urlParts = doc.arquivo_url.split(`/${tables.storageBucket}/`);
      if (urlParts.length < 2) {
        toast.error('URL do arquivo inválida');
        return;
      }

      const filePath = decodeURIComponent(urlParts[1]);

      // Deletar do storage
      const { error: storageError } = await supabase
        .storage
        .from(tables.storageBucket)
        .remove([filePath]);

      if (storageError) {
        console.error('Erro ao deletar do storage:', storageError);
        // Não bloquear: tentar deletar do banco mesmo se storage falhar
      }

      // Deletar da tabela contrato_anexos
      const { error: dbError } = await supabase
        .from(tables.contrato_anexos as any)
        .delete()
        .eq('id', doc.id);

      if (dbError) {
        console.error('Erro ao deletar do banco:', dbError);
        toast.error('Erro ao remover registro do banco');
        return;
      }

      // Registrar auditoria via RPC (resolve usuário automaticamente)
      console.log('[Auditoria] Registrando remoção de anexo:', dadosAuditoria.arquivo_nome);
      const { error: auditError } = await supabase.rpc('log_auditoria', {
        p_modulo: 'contratos',
        p_tabela: tables.contrato_anexos || 'contrato_anexos',
        p_acao: 'remover_anexo',
        p_registro_id: contratoId,
        p_registro_descricao: `Contrato ${codigoContrato}`,
        p_dados_antigos: dadosAuditoria as any,
        p_dados_novos: null,
        p_campos_alterados: null,
        p_detalhes: `Removeu arquivo "${dadosAuditoria.arquivo_nome}" do contrato ${codigoContrato}`,
      });

      if (auditError) {
        console.error('[Auditoria] Erro ao registrar remoção de anexo:', auditError);
      } else {
        console.log('[Auditoria] Remoção de anexo registrada com sucesso');
      }

      // Atualizar lista local
      setDocumentosExistentes(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Arquivo deletado com sucesso');
    } catch (error) {
      console.error('Erro ao deletar arquivo:', error);
      toast.error('Erro ao deletar arquivo');
    }
  };

  const onError = (errors: any) => {
    console.error('=== ERROS DE VALIDAÇÃO DO FORMULÁRIO ===');
    console.error('Erros completos:', JSON.stringify(errors, null, 2));
    console.error('Campos com erro:', Object.keys(errors));
    
    // Mostrar detalhes de cada erro
    Object.entries(errors).forEach(([campo, erro]: any) => {
      console.error(`Campo: ${campo}, Mensagem: ${erro?.message || erro}`);
    });
    console.error('==========================================');
    
    const camposFaltantes = Object.keys(errors).map(key => {
      const labels: Record<string, string> = {
        cnpj: 'CNPJ',
        nome_fantasia: 'Nome Fantasia',
        razao_social: 'Razão Social',
        endereco: 'Endereço',
        email_contato: 'Email Contrato',
        telefone_contato: 'Telefone Contrato',
        especialidade_contrato: 'Especialidade',
        codigo_contrato: 'Código do Contrato',
        tipo_servico: 'Tipo de Serviço',
        data_inicio: 'Data de Início',
        data_fim: 'Data de Término',
        status_contrato: 'Status do Contrato',
        assinado: 'Status Assinatura',
        prazo_meses: 'Prazo (meses)',
        data_termino: 'Data de Término',
      };
      return labels[key] || key;
    });
    
    toast.error(
      `Campos obrigatórios faltando: ${camposFaltantes.join(', ')}`,
      { duration: 5000 }
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] flex flex-col ${canViewAtividades && contrato ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <DialogHeader>
          <DialogTitle>
            {contrato ? 'Editar Contrato' : 'Novo Contrato'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-0 overflow-hidden">
          {/* Painel Principal - Formulário */}
          <div className={`flex-1 overflow-y-auto pr-2 ${canViewAtividades && contrato ? 'border-r border-border' : ''}`}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
                <TabsTrigger value="itens">Itens do Contrato</TabsTrigger>
                <TabsTrigger value="renovacao">Renovação</TabsTrigger>
              </TabsList>

              <TabsContent value="cadastro" className="mt-6">
                <AbaCadastroContrato 
                  form={form} 
                  clienteExistente={clienteExistente} 
                  isViewMode={isViewMode}
                  isEditing={!!contrato}
                  allowCustomTipoContratacao={allowCustomTipoContratacao}
                  tipoContratacaoCampoNome={tipoContratacaoCampoNome}
                  aditivos={aditivos}
                  onAditivosChange={setAditivos}
                />
              </TabsContent>

              <TabsContent value="itens" className="mt-6">
                <AbaItensContrato itens={itensContrato} onItensChange={setItensContrato} isViewMode={isViewMode} />
              </TabsContent>

              <TabsContent value="renovacao" className="mt-6">
                <AbaRenovacaoContrato renovacoes={renovacoes} onRenovacoesChange={setRenovacoes} isViewMode={isViewMode} />
              </TabsContent>
            </Tabs>

            {/* Anexos */}
            <div className="space-y-3 pt-4 border-t">
              <FormLabel>Anexar Documentos</FormLabel>
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
                  
                  const validFiles = files.filter(file => {
                    if (file.size > 50 * 1024 * 1024) {
                      toast.error(`${file.name} excede o tamanho máximo de 50MB`);
                      return false;
                    }
                    if (!acceptedTypes.includes(file.type) && file.type !== '') {
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      const acceptedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
                                            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
                                            'txt', 'csv', 'zip', 'rar'];
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
                }}
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Múltiplos arquivos permitidos</p>
              </div>
              <Input
                id="file-upload-input"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.txt,.csv,.zip,.rar"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
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
                    
                    const validFiles = files.filter(file => {
                      if (file.size > 50 * 1024 * 1024) {
                        toast.error(`${file.name} excede o tamanho máximo de 50MB`);
                        return false;
                      }
                      if (!acceptedTypes.includes(file.type) && file.type !== '') {
                        const ext = file.name.split('.').pop()?.toLowerCase();
                        const acceptedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
                                              'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
                                              'txt', 'csv', 'zip', 'rar'];
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
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, imagens (JPG, PNG, GIF, BMP, WEBP, SVG), TXT, CSV, ZIP, RAR (máx. 50MB por arquivo)
              </p>
              {documentos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{documentos.length} arquivo(s) selecionado(s):</p>
                  <div className="grid grid-cols-2 gap-3">
                    {documentos.map((d, idx) => {
                      const iconImage = getFileIconImage(d.name);
                      return (
                        <div 
                          key={idx} 
                          className="relative flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-black hover:border-primary transition-colors"
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
                          className="relative flex-shrink-0 w-48 flex flex-col bg-white rounded-lg border-2 border-black hover:border-primary transition-colors shadow-sm overflow-hidden snap-start"
                        >
                          {/* Botão de deletar */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 z-10 bg-white/90 hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                            onClick={() => setAnexoParaExcluir(doc)}
                          >
                            <X className="h-4 w-4" />
                          </Button>

                          {/* Ícone do arquivo - Clicável para visualizar */}
                          <button
                            onClick={() => handleOpenFile(doc)}
                            className="flex items-center justify-center p-6 hover:bg-muted/50 transition-colors border-b-2 border-black"
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

            {/* Botão enviar resumo por email - apenas para contratos existentes */}

            <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-background">
              {contrato && (
                <Button type="button" variant="secondary" onClick={() => setEmailModalOpen(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar resumo por e-mail
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isViewMode ? 'Fechar' : 'Cancelar'}
              </Button>
              {!isViewMode && (
                <Button type="submit" disabled={saveMutation.isPending || isLoadingData}>
                  {isLoadingData ? 'Carregando dados...' : saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
          </form>
        </Form>
          </div>

          {/* Painel Lateral - Atividades */}
          {canViewAtividades && contrato && (
            <div className="w-80 flex-shrink-0 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Atividades</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AbaAtividadesContrato contratoId={contrato?.id} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Dialog de Visualização de Arquivo - Isolado do Dialog principal */}
      {arquivoSelecionado && (
        <Dialog 
          open={true} 
          onOpenChange={(open) => {
            if (!open) {
              setArquivoSelecionado(null);
            }
          }}
          modal={true}
        >
          <DialogContent 
            className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
            onPointerDownOutside={(e) => {
              // Prevenir que o click fora feche o dialog pai
              e.preventDefault();
              e.stopPropagation();
              setArquivoSelecionado(null);
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setArquivoSelecionado(null);
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="break-words text-sm sm:text-base pr-2">{arquivoSelecionado?.nome || 'Carregando...'}</span>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
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
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(arquivoSelecionado.url, '_blank');
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    <ExternalLink className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Nova Aba</span>
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-muted/20">
              <iframe 
                src={`${arquivoSelecionado.url}#toolbar=1&navpanes=1&scrollbar=1`}
                className="w-full h-[70vh] border-0 rounded"
                title={arquivoSelecionado.nome}
                style={{ minHeight: '70vh' }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>

      <AlertDialog open={!!anexoParaExcluir} onOpenChange={(open) => !open && setAnexoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão de anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o anexo <strong>"{anexoParaExcluir?.arquivo_nome}"</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (anexoParaExcluir) {
                  handleDeletarArquivoExistente(anexoParaExcluir);
                  setAnexoParaExcluir(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contrato && (
        <EnviarResumoEmailModal
          open={emailModalOpen}
          onOpenChange={setEmailModalOpen}
          contratoId={contrato.id}
          clienteNome={form.getValues('nome_fantasia')}
          tiposServico={form.getValues('tipo_servico') || []}
          statusAssinatura={form.getValues('assinado')}
          valorTotal={itensContrato.reduce((sum, item) => sum + (item.valor_item * (item.quantidade || 1)), 0)}
          dataInicio={form.getValues('data_inicio')?.toISOString?.() || ''}
          codigoContrato={form.getValues('codigo_contrato')}
          objetoContrato={form.getValues('objeto_contrato')}
          prazoMeses={form.getValues('prazo_meses')}
          condicaoPagamento={form.getValues('condicao_pagamento')}
          documentosExistentes={documentosExistentes}
          cnpj={form.getValues('cnpj')}
          nomeUnidade={form.getValues('nome_unidade')}
          endereco={form.getValues('endereco')}
          dataTermino={form.getValues('data_termino')?.toISOString?.() || ''}
          qtdAditivos={aditivos.length}
          valorEstimado={form.getValues('valor_estimado')}
        />
      )}
    </>
  );
}
