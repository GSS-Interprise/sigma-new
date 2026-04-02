import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  User,
  FileText,
  History,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  Save,
  Send,
  Import,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Building2,
  Briefcase,
  IdCard,
  Landmark,
  CreditCard,
  Home,
  FolderArchive,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import AgesProfissionalDocumentos from "./AgesProfissionalDocumentos";
import { AgesLeadAtividadesPanel } from "./AgesLeadAtividadesPanel";
import { AgesLeadAnexosSection } from "./AgesLeadAnexosSection";
import { AgesLeadTimelineSection } from "./AgesLeadTimelineSection";
import { AgesLeadPropostasSection } from "./AgesLeadPropostasSection";
import { AgesUnidadeMultiSelect } from "./AgesUnidadeMultiSelect";
import { ImportarLeadTextoDialog } from "@/components/medicos/ImportarLeadTextoDialog";
import { PhoneEmailArrayFields } from "@/components/leads/PhoneEmailArrayFields";
import {
  registrarCriacaoAgesLead,
  registrarEdicaoAgesLead,
  registrarConversaoProfissional,
  registrarEnvioAcompanhamento,
} from "@/lib/agesLeadHistoryLogger";

const PROFISSOES = [
  "Médico",
  "Enfermeiro",
  "Técnico de Enfermagem",
  "Fisioterapeuta",
  "Nutricionista",
  "Psicólogo",
  "Farmacêutico",
  "Assistente Social",
  "Fonoaudiólogo",
  "Terapeuta Ocupacional",
  "Biomédico",
  "Radiologista",
  "Técnico em Radiologia",
  "Odontólogo",
  "Auxiliar Administrativo",
  "Recepcionista",
  "Motorista",
  "Porteiro",
  "Outros"
];

export interface AgesLeadProntuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  isNewLead?: boolean;
}

const invisibleInputClass =
  "border-transparent bg-transparent hover:border-input hover:bg-muted/30 focus:border-input focus:bg-muted/30 transition-all h-8 px-2";

export function AgesLeadProntuarioDialog({ open, onOpenChange, leadId, isNewLead = false }: AgesLeadProntuarioDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [showValidation, setShowValidation] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Approval checkboxes for Profissional conversion
  const [aprovacaoContrato, setAprovacaoContrato] = useState(false);
  const [aprovacaoDocumentacao, setAprovacaoDocumentacao] = useState(false);
  const [aprovacaoCadastro, setAprovacaoCadastro] = useState(false);
  const [hasApprovalChanges, setHasApprovalChanges] = useState(false);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // Fetch lead data
  const { data: lead, isLoading: loadingLead } = useQuery({
    queryKey: ['ages-lead-prontuario', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('ages_leads')
        .select('*')
        .eq('id', leadId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && open,
  });

  // Check if lead has been converted to profissional
  const { data: profissionalVinculado } = useQuery({
    queryKey: ['ages-lead-profissional-vinculo', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('ages_profissionais')
        .select('*')
        .eq('lead_origem_id', leadId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && open,
  });

  // Initialize editedData when lead loads
  useEffect(() => {
    if (isNewLead && open) {
      setEditedData({
        nome: '',
        profissao: '',
        telefone: '',
        telefones_adicionais: [],
        email: '',
        cidade: '',
        uf: '',
        origem: '',
        status: 'novo',
        observacoes: '',
        cpf: '',
        rg: '',
        data_nascimento: '',
        endereco: '',
        cep: '',
        registro_profissional: '',
        banco: '',
        agencia: '',
        conta_corrente: '',
        chave_pix: '',
        cnpj: '',
        modalidade_contrato: '',
        local_prestacao_servico: '',
        data_inicio_contrato: '',
        valor_contrato: '',
        especificacoes_contrato: '',
        unidades_vinculadas: [],
      });
      setHasChanges(false);
      setValidationErrors({});
      setShowValidation(false);
    } else if (lead) {
      setEditedData({
        nome: lead.nome || '',
        profissao: lead.profissao || '',
        telefone: lead.telefone || '',
        telefones_adicionais: (lead as any).telefones_adicionais || [],
        email: lead.email || '',
        cidade: lead.cidade || '',
        uf: lead.uf || '',
        origem: lead.origem || '',
        status: lead.status || 'novo',
        observacoes: lead.observacoes || '',
        cpf: (lead as any).cpf || '',
        rg: (lead as any).rg || '',
        data_nascimento: (lead as any).data_nascimento || '',
        endereco: (lead as any).endereco || '',
        cep: (lead as any).cep || '',
        registro_profissional: (lead as any).registro_profissional || '',
        banco: (lead as any).banco || '',
        agencia: (lead as any).agencia || '',
        conta_corrente: (lead as any).conta_corrente || '',
        chave_pix: (lead as any).chave_pix || '',
        cnpj: (lead as any).cnpj || '',
        modalidade_contrato: (lead as any).modalidade_contrato || '',
        local_prestacao_servico: (lead as any).local_prestacao_servico || '',
        data_inicio_contrato: (lead as any).data_inicio_contrato || '',
        valor_contrato: (lead as any).valor_contrato || '',
        especificacoes_contrato: (lead as any).especificacoes_contrato || '',
        unidades_vinculadas: (lead as any).unidades_vinculadas || [],
      });
      setHasChanges(false);
      setValidationErrors({});
      setShowValidation(false);
      setTimeout(adjustTextareaHeight, 0);
    }
  }, [lead, isNewLead, open, adjustTextareaHeight]);

  // Initialize approval checkboxes when profissional data loads
  useEffect(() => {
    if (profissionalVinculado) {
      setAprovacaoContrato(profissionalVinculado.status === 'ativo');
      setAprovacaoDocumentacao(profissionalVinculado.status === 'ativo');
      setAprovacaoCadastro(profissionalVinculado.status === 'ativo');
      setHasApprovalChanges(false);
    }
  }, [profissionalVinculado]);

  // Handle save with validation
  const handleSave = () => {
    if (!validateRequiredFields()) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    saveMutation.mutate();
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const sanitizedData = { ...editedData };
      
      // Handle numeric field
      if (sanitizedData.valor_contrato === '' || sanitizedData.valor_contrato === null) {
        sanitizedData.valor_contrato = null;
      } else if (typeof sanitizedData.valor_contrato === 'string') {
        const parsed = parseFloat(sanitizedData.valor_contrato.replace(/\./g, '').replace(',', '.'));
        sanitizedData.valor_contrato = isNaN(parsed) ? null : parsed;
      }

      // Handle date fields
      const dateFields = ['data_nascimento', 'data_inicio_contrato'];
      dateFields.forEach(field => {
        if (sanitizedData[field] === '') {
          sanitizedData[field] = null;
        }
      });

      if (isNewLead) {
        // Validação já foi feita no handleSave

        const { data: newLead, error } = await supabase
          .from('ages_leads')
          .insert({
            nome: sanitizedData.nome,
            profissao: sanitizedData.profissao || null,
            telefone: sanitizedData.telefone || null,
            email: sanitizedData.email || null,
            cidade: sanitizedData.cidade || null,
            uf: sanitizedData.uf || null,
            origem: sanitizedData.origem || null,
            status: sanitizedData.status || 'novo',
            observacoes: sanitizedData.observacoes || null,
            cpf: sanitizedData.cpf || null,
            rg: sanitizedData.rg || null,
            data_nascimento: sanitizedData.data_nascimento || null,
            endereco: sanitizedData.endereco || null,
            cep: sanitizedData.cep || null,
            registro_profissional: sanitizedData.registro_profissional || null,
            banco: sanitizedData.banco || null,
            agencia: sanitizedData.agencia || null,
            conta_corrente: sanitizedData.conta_corrente || null,
            chave_pix: sanitizedData.chave_pix || null,
            modalidade_contrato: sanitizedData.modalidade_contrato || null,
            local_prestacao_servico: sanitizedData.local_prestacao_servico || null,
            data_inicio_contrato: sanitizedData.data_inicio_contrato || null,
            valor_contrato: sanitizedData.valor_contrato || null,
            especificacoes_contrato: sanitizedData.especificacoes_contrato || null,
            unidades_vinculadas: sanitizedData.unidades_vinculadas || [],
          })
          .select('id')
          .single();

        if (error) throw error;

        await registrarCriacaoAgesLead(newLead.id, sanitizedData.nome);
        return { isNew: true, newLeadId: newLead.id };
      }

      if (!lead || !leadId) throw new Error('Lead não encontrado');

      // Track changes
      const camposAlterados: string[] = [];
      const dadosAntigos: Record<string, any> = {};
      const dadosNovos: Record<string, any> = {};

      Object.keys(editedData).forEach(key => {
        const oldVal = (lead as any)[key];
        const newVal = editedData[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          camposAlterados.push(key);
          dadosAntigos[key] = oldVal;
          dadosNovos[key] = newVal;
        }
      });

      const { error } = await supabase
        .from('ages_leads')
        .update({
          ...sanitizedData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;

      // Sincronizar profissão com ages_profissionais se já foi convertido
      const { data: profVinculado } = await supabase
        .from('ages_profissionais')
        .select('id')
        .eq('lead_origem_id', leadId)
        .maybeSingle();

      if (profVinculado) {
        await supabase
          .from('ages_profissionais')
          .update({
            profissao: sanitizedData.profissao || 'Outros',
            nome: sanitizedData.nome,
            telefone: sanitizedData.telefone,
            email: sanitizedData.email,
            cidade: sanitizedData.cidade,
            uf: sanitizedData.uf,
            cpf: sanitizedData.cpf,
            rg: sanitizedData.rg,
            data_nascimento: sanitizedData.data_nascimento,
            endereco: sanitizedData.endereco,
            cep: sanitizedData.cep,
            registro_profissional: sanitizedData.registro_profissional,
            banco: sanitizedData.banco,
            agencia: sanitizedData.agencia,
            conta_corrente: sanitizedData.conta_corrente,
            chave_pix: sanitizedData.chave_pix,
            observacoes: sanitizedData.observacoes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profVinculado.id);
      }

      if (camposAlterados.length > 0) {
        await registrarEdicaoAgesLead(leadId, dadosAntigos, dadosNovos, camposAlterados);
      }

      return { isNew: false, camposAlterados };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ages-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ages-kanban-cards'] });
      if (!isNewLead && leadId) {
        queryClient.invalidateQueries({ queryKey: ['ages-lead-prontuario', leadId] });
        queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      }
      setHasChanges(false);
      toast.success(isNewLead ? 'Lead criado com sucesso!' : 'Lead atualizado com sucesso!');
      if (isNewLead) {
        onOpenChange(false);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar alterações');
    },
  });

  // Conversion mutation
  const convertToProfissionalMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');

      // Se já existe profissional vinculado a este lead, não criar novamente
      const { data: profissionalJaVinculado, error: profissionalJaVinculadoError } = await supabase
        .from('ages_profissionais')
        .select('id, nome')
        .eq('lead_origem_id', lead.id)
        .limit(1);

      if (profissionalJaVinculadoError) throw profissionalJaVinculadoError;

      if (profissionalJaVinculado && profissionalJaVinculado.length > 0) {
        const profissionalId = profissionalJaVinculado[0].id;

        const { error: leadError } = await supabase
          .from('ages_leads')
          .update({ status: 'convertido', updated_at: new Date().toISOString() })
          .eq('id', lead.id);

        if (leadError) throw leadError;

        toast.info('Este lead já estava convertido em profissional.');
        return profissionalId;
      }

      // Verificar se já existe profissional com mesmo CPF (CPF é unique)
      let existingProfissional: { id: string; nome: string } | null = null;

      if (lead.cpf) {
        const { data } = await supabase
          .from('ages_profissionais')
          .select('id, nome')
          .eq('cpf', lead.cpf)
          .maybeSingle();
        existingProfissional = data;
      }

      // Se não encontrou por CPF, verificar por email
      if (!existingProfissional && lead.email) {
        const { data } = await supabase
          .from('ages_profissionais')
          .select('id, nome')
          .eq('email', lead.email)
          .maybeSingle();
        existingProfissional = data;
      }

      // Se não encontrou por email, verificar por telefone
      if (!existingProfissional && lead.telefone) {
        const { data } = await supabase
          .from('ages_profissionais')
          .select('id, nome')
          .eq('telefone', lead.telefone)
          .maybeSingle();
        existingProfissional = data;
      }

      let profissionalId: string;

      if (existingProfissional) {
        const { error } = await supabase
          .from('ages_profissionais')
          .update({ lead_origem_id: lead.id })
          .eq('id', existingProfissional.id);

        if (error) throw error;
        profissionalId = existingProfissional.id;
        toast.info(`Profissional ${existingProfissional.nome} já existia e foi vinculado.`);
      } else {
        const { data: newProfissional, error } = await supabase
          .from('ages_profissionais')
          .insert({
            nome: lead.nome,
            profissao: lead.profissao || 'Outros',
            telefone: lead.telefone,
            email: lead.email,
            cidade: lead.cidade,
            uf: lead.uf,
            observacoes: lead.observacoes,
            cpf: lead.cpf,
            rg: lead.rg,
            data_nascimento: lead.data_nascimento,
            endereco: lead.endereco,
            cep: lead.cep,
            registro_profissional: lead.registro_profissional,
            banco: lead.banco,
            agencia: lead.agencia,
            conta_corrente: lead.conta_corrente,
            chave_pix: lead.chave_pix,
            status: 'pendente',
            lead_origem_id: lead.id,
          })
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505' && error.message?.includes('cpf')) {
            throw new Error('Já existe um profissional cadastrado com este CPF');
          }
          throw error;
        }
        profissionalId = newProfissional.id;
      }

      // Update lead status (remove do kanban de acompanhamento)
      const { error: leadError } = await supabase
        .from('ages_leads')
        .update({ status: 'convertido', updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      await registrarConversaoProfissional(lead.id, lead.nome);

      return profissionalId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['ages-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-profissional-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-profissionais'] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      toast.success('Lead convertido em profissional com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao converter lead');
    },
  });

  // Send to Acompanhamento mutation
  const sendToAcompanhamentoMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');

      // Get first column from ages_leads kanban
      const { data: primeiraColuna } = await supabase
        .from('kanban_status_config')
        .select('status_id, label')
        .eq('modulo', 'ages_leads')
        .order('ordem', { ascending: true })
        .limit(1)
        .single();

      const novoStatus = primeiraColuna?.status_id || 'novo_canal_lead';

      const { error } = await supabase
        .from('ages_leads')
        .update({ status: novoStatus })
        .eq('id', lead.id);

      if (error) throw error;

      await registrarEnvioAcompanhamento(lead.id, primeiraColuna?.label || novoStatus);

      return novoStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      toast.success('Lead enviado para acompanhamento!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar para acompanhamento');
    },
  });

  // Save approval mutation
  const saveApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');

      const allApproved = aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro;

      let profissionalId = profissionalVinculado?.id;

      if (!profissionalId) {
        // Create profissional if doesn't exist
        const { data: newProfissional, error } = await supabase
          .from('ages_profissionais')
          .insert({
            nome: lead.nome,
            profissao: lead.profissao || 'Outros',
            telefone: lead.telefone,
            email: lead.email,
            cidade: lead.cidade,
            uf: lead.uf,
            observacoes: lead.observacoes,
            status: allApproved ? 'ativo' : 'pendente',
            lead_origem_id: lead.id,
          })
          .select('id')
          .single();

        if (error) throw error;
        profissionalId = newProfissional.id;
      } else {
        const { error } = await supabase
          .from('ages_profissionais')
          .update({
            status: allApproved ? 'ativo' : 'pendente',
          })
          .eq('id', profissionalId);

        if (error) throw error;
      }

      // Ao existir profissional, o lead sai do kanban de acompanhamento
      const { error: leadError } = await supabase
        .from('ages_leads')
        .update({ status: 'convertido', updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      return allApproved;
    },
    onSuccess: (allApproved) => {
      queryClient.invalidateQueries({ queryKey: ['ages-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['ages-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-lead-profissional-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ages-profissionais'] });
      setHasApprovalChanges(false);

      if (allApproved) {
        toast.success('Profissional aprovado e ativado!');
      } else {
        toast.success('Aprovações salvas com sucesso!');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar aprovações');
    },
  });

  const handleApprovalChange = (field: 'contrato' | 'documentacao' | 'cadastro', value: boolean) => {
    setHasApprovalChanges(true);
    switch (field) {
      case 'contrato':
        setAprovacaoContrato(value);
        break;
      case 'documentacao':
        setAprovacaoDocumentacao(value);
        break;
      case 'cadastro':
        setAprovacaoCadastro(value);
        break;
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    // Limpa erro de validação quando o campo é preenchido
    if (validationErrors[field] && value?.toString().trim()) {
      setValidationErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  // Função para validar campos obrigatórios
  const validateRequiredFields = () => {
    const errors: Record<string, boolean> = {};
    
    // Nome é sempre obrigatório
    if (!editedData.nome?.trim()) {
      errors.nome = true;
    }
    
    // Telefone é obrigatório
    if (!editedData.telefone?.trim()) {
      errors.telefone = true;
    }
    
    setValidationErrors(errors);
    setShowValidation(true);
    
    return Object.keys(errors).length === 0;
  };

  // Função para obter classe de input com erro
  const getInputClass = (field: string) => {
    const hasError = showValidation && validationErrors[field];
    return `${invisibleInputClass} ${hasError ? 'border-destructive bg-destructive/10 focus:border-destructive' : ''}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'novo': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'em_contato': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'qualificado': return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
      case 'convertido': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'descartado': return 'bg-red-500/10 text-red-600 border-red-500/30';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'novo': 'Novo',
      'em_contato': 'Em Contato',
      'qualificado': 'Qualificado',
      'convertido': 'Convertido',
      'descartado': 'Descartado',
      'novo_canal_lead': 'Novo Canal/Lead',
      'captando_informacoes': 'Captando Informações',
      'revisar_dados': 'Revisar Dados',
      'pronto_para_cadastro': 'Pronto para Cadastro',
      'cadastrado': 'Cadastrado',
      'em_validacao_documental': 'Em Validação',
      'ativo': 'Ativo',
    };
    return labels[status] || status;
  };

  if (!leadId && !isNewLead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] h-[85vh] max-h-[85vh] p-0 gap-0 overflow-hidden">
        <div className="flex h-full overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <DialogHeader className="px-4 py-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-base">
                      {isNewLead ? 'Novo Lead AGES' : (loadingLead ? <Skeleton className="h-5 w-40" /> : lead?.nome)}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isNewLead ? (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                          Novo
                        </Badge>
                      ) : loadingLead ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        <>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(lead?.status || '')}`}>
                            {getStatusLabel(lead?.status || '')}
                          </Badge>
                          {profissionalVinculado && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Profissional
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(true)}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Import className="h-3.5 w-3.5" />
                    Importar
                  </Button>

                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saveMutation.isPending ? "Salvando..." : isNewLead ? "Criar" : "Salvar"}
                  </Button>

                  {!profissionalVinculado && !isNewLead && lead?.status !== "convertido" && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => sendToAcompanhamentoMutation.mutate()}
                        disabled={sendToAcompanhamentoMutation.isPending}
                        size="sm"
                        className="gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendToAcompanhamentoMutation.isPending ? "Enviando..." : "Acompanhamento"}
                      </Button>
                      <Button
                        onClick={() => convertToProfissionalMutation.mutate()}
                        disabled={convertToProfissionalMutation.isPending}
                        size="sm"
                        className="gap-1.5"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        {convertToProfissionalMutation.isPending ? "Convertendo..." : "Converter"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid grid-cols-5 mx-4 mt-2 flex-shrink-0 w-auto">
                <TabsTrigger value="dados" className="gap-1.5 text-xs">
                  <User className="h-3.5 w-3.5" />
                  Dados
                </TabsTrigger>
                <TabsTrigger value="propostas" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  Propostas
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-1.5 text-xs">
                  <History className="h-3.5 w-3.5" />
                  Histórico
                </TabsTrigger>
                <TabsTrigger value="old" className="gap-1.5 text-xs">
                  <FolderArchive className="h-3.5 w-3.5" />
                  OLD
                </TabsTrigger>
                <TabsTrigger value="conversao" className="gap-1.5 text-xs">
                  <UserCheck className="h-3.5 w-3.5" />
                  Conversão
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden min-w-0">
                {/* Dados do Lead */}
                <TabsContent value="dados" className="m-0 h-full overflow-hidden">
                  <ScrollArea className="h-full w-full">
                    <div className="p-4 space-y-4 w-full overflow-hidden">
                      {loadingLead && !isNewLead ? (
                        <div className="space-y-4">
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-24 w-full" />
                        </div>
                      ) : (lead || isNewLead) && (
                        <>
                          {/* ═══════════════════════════════════════════ */}
                          {/* SEÇÃO 1: DADOS PESSOAIS                    */}
                          {/* ═══════════════════════════════════════════ */}
                          <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-2">
                              <User className="h-4 w-4" />
                              Dados Pessoais
                            </h4>

                            {/* Nome */}
                            <div className="space-y-1 min-w-0">
                              <label className={`text-xs flex items-center gap-1.5 ${showValidation && validationErrors.nome ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <User className="h-3 w-3" />
                                Nome *
                              </label>
                              <Input
                                value={editedData.nome || ''}
                                onChange={(e) => handleFieldChange('nome', e.target.value)}
                                className={getInputClass('nome')}
                                placeholder="Nome completo"
                              />
                              {showValidation && validationErrors.nome && (
                                <span className="text-xs text-destructive">Campo obrigatório</span>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-3 min-w-0">
                              <div className="space-y-1 min-w-0">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <CreditCard className="h-3 w-3" />
                                  CPF
                                </label>
                                <Input
                                  value={editedData.cpf || ''}
                                  onChange={(e) => handleFieldChange('cpf', e.target.value)}
                                  placeholder="000.000.000-00"
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <IdCard className="h-3 w-3" />
                                  RG
                                </label>
                                <Input
                                  value={editedData.rg || ''}
                                  onChange={(e) => handleFieldChange('rg', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3" />
                                  Data Nasc.
                                </label>
                                <Input
                                  type="date"
                                  value={editedData.data_nascimento || ''}
                                  onChange={(e) => handleFieldChange('data_nascimento', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>

                            {/* Telefones + Emails lado a lado */}
                            <PhoneEmailArrayFields
                              phones={(() => {
                                const allPhones: string[] = [];
                                if (editedData.telefone) allPhones.push(editedData.telefone);
                                if (editedData.telefones_adicionais?.length) {
                                  allPhones.push(...editedData.telefones_adicionais);
                                }
                                return allPhones;
                              })()}
                              email={editedData.email || ''}
                              onPhonesChange={(phones) => {
                                if (phones.length > 0) {
                                  handleFieldChange('telefone', phones[0]);
                                  handleFieldChange('telefones_adicionais', phones.slice(1));
                                } else {
                                  handleFieldChange('telefone', '');
                                  handleFieldChange('telefones_adicionais', []);
                                }
                              }}
                              onEmailChange={(email) => handleFieldChange('email', email)}
                            />

                            {/* Origem */}
                            <div className="grid grid-cols-2 gap-3 min-w-0">
                              <div></div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />
                                  Origem
                                </label>
                                <Input
                                  value={editedData.origem || ''}
                                  onChange={(e) => handleFieldChange('origem', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>

                            {/* Endereço */}
                            <div className="grid grid-cols-4 gap-3 min-w-0">
                              <div className="col-span-2 space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Home className="h-3 w-3" />
                                  Endereço
                                </label>
                                <Input
                                  value={editedData.endereco || ''}
                                  onChange={(e) => handleFieldChange('endereco', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">CEP</label>
                                <Input
                                  value={editedData.cep || ''}
                                  onChange={(e) => handleFieldChange('cep', e.target.value)}
                                  placeholder="00000-000"
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">UF</label>
                                <Input
                                  value={editedData.uf || ''}
                                  onChange={(e) => handleFieldChange('uf', e.target.value.toUpperCase())}
                                  maxLength={2}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 min-w-0">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Building2 className="h-3 w-3" />
                                  Cidade
                                </label>
                                <Input
                                  value={editedData.cidade || ''}
                                  onChange={(e) => handleFieldChange('cidade', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>
                          </div>

                          {/* ═══════════════════════════════════════════ */}
                          {/* SEÇÃO 2: DADOS DA PROFISSÃO                */}
                          {/* ═══════════════════════════════════════════ */}
                          <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-2">
                              <Briefcase className="h-4 w-4" />
                              Dados da Profissão
                            </h4>

                            <div className="grid grid-cols-2 gap-3 min-w-0">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Briefcase className="h-3 w-3" />
                                  Profissão
                                </label>
                                <Select
                                  value={editedData.profissao || ''}
                                  onValueChange={(value) => handleFieldChange('profissao', value)}
                                >
                                  <SelectTrigger className={invisibleInputClass}>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PROFISSOES.map(prof => (
                                      <SelectItem key={prof} value={prof}>{prof}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <IdCard className="h-3 w-3" />
                                  Registro Profissional
                                </label>
                                <Input
                                  value={editedData.registro_profissional || ''}
                                  onChange={(e) => handleFieldChange('registro_profissional', e.target.value)}
                                  placeholder="COREN, CRF, CRM, etc."
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>

                            {/* Unidades Vinculadas */}
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Building2 className="h-3 w-3" />
                                Unidades Vinculadas
                              </label>
                              <AgesUnidadeMultiSelect
                                value={editedData.unidades_vinculadas || []}
                                onChange={(value) => handleFieldChange('unidades_vinculadas', value)}
                                placeholder="Selecionar unidades de atuação..."
                              />
                            </div>
                          </div>

                          {/* ═══════════════════════════════════════════ */}
                          {/* SEÇÃO 3: DADOS CONTRATUAIS / BANCÁRIOS     */}
                          {/* ═══════════════════════════════════════════ */}
                          <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                            <h4 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-2">
                              <Landmark className="h-4 w-4" />
                              Dados Contratuais e Bancários
                            </h4>

                            <div className="grid grid-cols-4 gap-3 min-w-0">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Banco</label>
                                <Input
                                  value={editedData.banco || ''}
                                  onChange={(e) => handleFieldChange('banco', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Agência</label>
                                <Input
                                  value={editedData.agencia || ''}
                                  onChange={(e) => handleFieldChange('agencia', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Conta Corrente</label>
                                <Input
                                  value={editedData.conta_corrente || ''}
                                  onChange={(e) => handleFieldChange('conta_corrente', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Chave PIX</label>
                                <Input
                                  value={editedData.chave_pix || ''}
                                  onChange={(e) => handleFieldChange('chave_pix', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 min-w-0">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <CreditCard className="h-3 w-3" />
                                  CNPJ
                                </label>
                                <Input
                                  value={editedData.cnpj || ''}
                                  onChange={(e) => handleFieldChange('cnpj', e.target.value)}
                                  placeholder="00.000.000/0000-00"
                                  className={invisibleInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Briefcase className="h-3 w-3" />
                                  Modalidade de Contrato
                                </label>
                                <Input
                                  value={editedData.modalidade_contrato || ''}
                                  onChange={(e) => handleFieldChange('modalidade_contrato', e.target.value)}
                                  placeholder="PJ, CLT, etc."
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Observações */}
                          <div className="space-y-1 border rounded-lg p-4 bg-muted/20">
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <FileText className="h-3 w-3" />
                              Observações
                            </label>
                            <textarea
                              ref={textareaRef}
                              value={editedData.observacoes || ''}
                              onChange={(e) => {
                                handleFieldChange('observacoes', e.target.value);
                                adjustTextareaHeight();
                              }}
                              className={`w-full resize-none min-h-[80px] rounded-md ${invisibleInputClass}`}
                            />
                          </div>

                          {/* Anexos */}
                          {leadId ? (
                            <AgesLeadAnexosSection leadId={leadId} />
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                              <p className="font-medium">Salve o lead primeiro</p>
                              <p className="text-sm">Após criar o lead, você poderá anexar arquivos.</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Propostas */}
                <TabsContent value="propostas" className="m-0 h-full">
                  <ScrollArea className="h-full p-4">
                    {leadId ? (
                      <AgesLeadPropostasSection 
                        leadId={leadId} 
                        leadNome={editedData.nome}
                        unidadesVinculadas={editedData.unidades_vinculadas}
                      />
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Salve o lead primeiro</p>
                        <p className="text-sm">Após criar o lead, você poderá acessar esta aba.</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                {/* Histórico */}
                <TabsContent value="historico" className="m-0 h-full">
                  <ScrollArea className="h-full p-4">
                    {leadId ? (
                      <AgesLeadTimelineSection leadId={leadId} />
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Salve o lead primeiro</p>
                        <p className="text-sm">Após criar o lead, o histórico aparecerá aqui.</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                {/* OLD - Documentos do Profissional */}
                <TabsContent value="old" className="m-0 h-full">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      {profissionalVinculado ? (
                        <AgesProfissionalDocumentos profissionalId={profissionalVinculado.id} />
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderArchive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">Documentos do Profissional</p>
                          <p className="text-sm">Converta o lead para profissional para gerenciar documentos.</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Conversão */}
                <TabsContent value="conversao" className="m-0 h-full overflow-hidden">
                  <ScrollArea className="h-full w-full">
                    <div className="p-4 space-y-6">
                      {/* Seção 1: Aprovações - SEMPRE visível primeiro */}
                      <div className="space-y-4">
                        <h4 className="font-medium">Aprovações para Conversão</h4>
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 p-3 border rounded-lg">
                            <Checkbox
                              checked={aprovacaoContrato}
                              onCheckedChange={(checked) => handleApprovalChange('contrato', !!checked)}
                            />
                            <div>
                              <p className="font-medium text-sm">Contrato Assinado</p>
                              <p className="text-xs text-muted-foreground">Documentação contratual aprovada</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 p-3 border rounded-lg">
                            <Checkbox
                              checked={aprovacaoDocumentacao}
                              onCheckedChange={(checked) => handleApprovalChange('documentacao', !!checked)}
                            />
                            <div>
                              <p className="font-medium text-sm">Documentação Completa</p>
                              <p className="text-xs text-muted-foreground">Todos os documentos verificados</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 p-3 border rounded-lg">
                            <Checkbox
                              checked={aprovacaoCadastro}
                              onCheckedChange={(checked) => handleApprovalChange('cadastro', !!checked)}
                            />
                            <div>
                              <p className="font-medium text-sm">Cadastro Validado</p>
                              <p className="text-xs text-muted-foreground">Informações do cadastro conferidas</p>
                            </div>
                          </div>
                        </div>

                        {hasApprovalChanges && (
                          <Button 
                            onClick={() => saveApprovalMutation.mutate()}
                            disabled={saveApprovalMutation.isPending}
                            className="w-full gap-1.5"
                          >
                            <Save className="h-4 w-4" />
                            {saveApprovalMutation.isPending ? 'Salvando...' : 'Salvar Aprovações'}
                          </Button>
                        )}
                      </div>

                      {/* Seção 2: Status de Conversão - DEPOIS das aprovações */}
                      <div className="border-t pt-6">
                        {profissionalVinculado ? (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                              <div>
                                <p className="font-medium text-green-700">Lead convertido em Profissional</p>
                                <p className="text-sm text-green-600">{profissionalVinculado.nome}</p>
                              </div>
                            </div>

                            {aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro && (
                              <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                                <p className="font-medium text-primary">Profissional totalmente aprovado e ativo!</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro ? (
                              <div className="text-center py-4">
                                <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg mb-4">
                                  <CheckCircle2 className="h-5 w-5 text-primary" />
                                  <p className="font-medium text-primary">Todas as aprovações concluídas!</p>
                                </div>
                                {!isNewLead && lead?.status !== 'convertido' && (
                                  <Button 
                                    onClick={() => convertToProfissionalMutation.mutate()}
                                    disabled={convertToProfissionalMutation.isPending}
                                    className="gap-1.5"
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                    {convertToProfissionalMutation.isPending ? 'Convertendo...' : 'Converter para Profissional'}
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Conversão para Profissional</p>
                                <p className="text-sm">
                                  Complete as 3 aprovações acima para habilitar a conversão.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Activities Sidebar */}
          <div className="w-[280px] flex-shrink-0 border-l bg-muted/20 flex flex-col">
            <div className="px-3 py-3 border-b flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Atividades</span>
            </div>
            <div className="flex-1 min-h-0">
              {leadId ? (
                <AgesLeadAtividadesPanel leadId={leadId} onClose={() => {}} embedded />
              ) : (
                <div className="p-4 text-sm text-muted-foreground">Salve/crie o lead para ver as atividades.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Import Dialog */}
      <ImportarLeadTextoDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={(data) => {
          const newData = { ...editedData };

          if (data.nome) newData.nome = data.nome;
          if (data.cpf) newData.cpf = data.cpf;
          if (data.data_nascimento) newData.data_nascimento = data.data_nascimento;
          if (data.telefone) newData.telefone = data.telefone;
          if (data.email) newData.email = data.email;
          if (data.endereco) newData.endereco = data.endereco;
          if (data.cep) newData.cep = data.cep;
          if (data.rg) newData.rg = data.rg;
          if (data.banco) newData.banco = data.banco;
          if (data.agencia) newData.agencia = data.agencia;
          if (data.conta_corrente) newData.conta_corrente = data.conta_corrente;
          if (data.chave_pix) newData.chave_pix = data.chave_pix;
          if (data.observacoes) {
            newData.observacoes = newData.observacoes
              ? `${newData.observacoes}\n\n${data.observacoes}`
              : data.observacoes;
          }

          setEditedData(newData);
          setHasChanges(true);
        }}
      />
    </Dialog>
  );
}
