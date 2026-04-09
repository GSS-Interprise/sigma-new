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
  User, FileText, History, UserCheck, ExternalLink, 
  ArrowRight, CheckCircle2, Send, CreditCard, Landmark,
  FileSignature, Calendar, Stethoscope, Phone, Mail, MapPin,
  Building2, Globe, Heart, IdCard, Save, Briefcase, Home, Import,
  ClipboardCheck, Award, FolderArchive, Activity, Undo2, AlertTriangle,
  XCircle
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentacaoTab } from "./DocumentacaoTab";
import { ProntuarioTab } from "./ProntuarioTab";
import { ImportarLeadTextoDialog } from "./ImportarLeadTextoDialog";
import { RegiaoInteresseDialog } from "@/components/disparos/RegiaoInteresseDialog";
import { formatPhoneForDisplay, normalizeToE164 } from "@/lib/phoneUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { LeadPropostasSection } from "./LeadPropostasSection";
import { LeadHistoricoAnotacoesSection } from "./LeadHistoricoAnotacoesSection";
import { LeadAnexosSection } from "./LeadAnexosSection";
import { LeadLinksExternosSection } from "./LeadLinksExternosSection";
import { LeadAtividadesPanel } from "./LeadAtividadesPanel";
import { LeadChannelsSidebar } from "./LeadChannelsSidebar";
import { atualizarStatusLead, registrarConversaoMedico, registrarEdicaoLead, registrarCriacaoLead, registrarDesconversaoParaLead, registrarReprocessamentoKanban } from "@/lib/leadHistoryLogger";
import { EspecialidadeMultiSelect } from "./EspecialidadeMultiSelect";
import { UnidadeMultiSelect } from "./UnidadeMultiSelect";
import { BlacklistSection } from "./BlacklistSection";
import { BloqueioTemporarioSection } from "./BloqueioTemporarioSection";
import { LeadEtiquetasDropdown } from "./LeadEtiquetasDropdown";
import { PhoneEmailArrayFields } from "@/components/leads/PhoneEmailArrayFields";

export interface LeadProntuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  isNewLead?: boolean;
  createAsCorpoClinico?: boolean;
  /** CPF pré-preenchido ao criar novo lead via CpfGateDialog */
  initialCpf?: string;
  /** CNPJ pré-preenchido ao criar novo lead PJ via CpfGateDialog */
  initialCnpj?: string;
}

// Estilo para inputs invisíveis que mostram borda apenas no hover/focus
const invisibleInputClass = "border-transparent bg-transparent hover:border-input hover:bg-muted/30 focus:border-input focus:bg-muted/30 transition-all h-8 px-2";

export function LeadProntuarioDialog({ open, onOpenChange, leadId, isNewLead = false, createAsCorpoClinico = false, initialCpf, initialCnpj }: LeadProntuarioDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isLeader, userRoles } = usePermissions();
  const isGestorContratos = userRoles?.some(r => r.role === 'gestor_contratos');
  const canViewOld = isAdmin || isLeader || isGestorContratos;
  const [activeTab, setActiveTab] = useState("dados");
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sidebarConversaId, setSidebarConversaId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Check if we're on the medicos page (corpo clínico context)
  const isOnMedicosPage = location.pathname.startsWith('/medicos');
  
  // Approval checkboxes for Corpo Médico conversion
  const [aprovacaoContrato, setAprovacaoContrato] = useState(false);
  const [aprovacaoDocumentacao, setAprovacaoDocumentacao] = useState(false);
  const [aprovacaoCadastro, setAprovacaoCadastro] = useState(false);
  const [statusMedico, setStatusMedico] = useState<string>('Ativo');
  const [hasApprovalChanges, setHasApprovalChanges] = useState(false);
  
  // Desconversão state
  const [motivoDesconversao, setMotivoDesconversao] = useState('');
  const [showDesconversaoForm, setShowDesconversaoForm] = useState(false);
  
  // Descarte de Lead state (para Acompanhamento)
  const [motivoDescarte, setMotivoDescarte] = useState('');
  const [showDescarteForm, setShowDescarteForm] = useState(false);
  
  // Conversão Lead -> Médico state
  const [motivoConversao, setMotivoConversao] = useState('');
  const [showConversaoForm, setShowConversaoForm] = useState(false);
  
  // Checkboxes obrigatórios para conversão Lead -> Médico (igual ao padrão Corpo Clínico)
  const [checkLeadDadosCompletos, setCheckLeadDadosCompletos] = useState(false);
  const [checkLeadDocumentosVerificados, setCheckLeadDocumentosVerificados] = useState(false);
  const [checkLeadPropostaAceita, setCheckLeadPropostaAceita] = useState(false);
  
  // Aprovação Corpo Clínico state
  const [motivoAprovacao, setMotivoAprovacao] = useState('');
  
  // Reprocessar Médico state (novo processo no Kanban mantendo corpo clínico)
  const [motivoReprocessamento, setMotivoReprocessamento] = useState('');
  const [showReprocessamentoForm, setShowReprocessamentoForm] = useState(false);
  
  // Desconverter do Corpo Clínico state
  const [motivoDesconversaoCorpo, setMotivoDesconversaoCorpo] = useState('');
  const [showDesconversaoCorpoForm, setShowDesconversaoCorpoForm] = useState(false);
  
  // Região de Interesse dialog
  const [showRegiaoInteresse, setShowRegiaoInteresse] = useState(false);

  // Etiquetas state
  const [leadTags, setLeadTags] = useState<string[]>([]);
  
  // Canal de Conversão state (para BI de tipo de conversão)
  const [canalConversao, setCanalConversao] = useState<string>('');
  
  // Check if we're on acompanhamento context
  const isOnAcompanhamentoPage = location.pathname.includes('/disparos/acompanhamento');

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // Fetch lead data with related info
  const { data: lead, isLoading: loadingLead } = useQuery({
    queryKey: ['lead-prontuario', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          licitacao_origem:licitacoes!leads_licitacao_origem_id_fkey(id, numero_edital, orgao, objeto),
          contrato_origem:contratos!leads_contrato_origem_id_fkey(id, codigo_contrato, objeto_contrato),
          servico_origem:servico!leads_servico_origem_id_fkey(id, nome, especialidade)
        `)
        .eq('id', leadId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && open,
  });

  // Query para verificar se existe proposta vinculada
  const { data: propostas } = useQuery({
    queryKey: ['lead-propostas-count', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('proposta')
        .select('id')
        .eq('lead_id', leadId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId && open,
  });

  // Query para buscar propostas de disparos que o lead participou (para sugerir na conversão)
  const { data: disparosRecentes } = useQuery({
    queryKey: ['lead-disparos-recentes', leadId, lead?.phone_e164],
    queryFn: async () => {
      if (!leadId && !lead?.phone_e164) return [];
      
      // Buscar contatos de disparos pelo lead_id ou telefone
      let query = supabase
        .from('disparos_contatos')
        .select(`
          id,
          campanha_id,
          data_envio,
          status,
          campanha:disparos_campanhas!disparos_contatos_campanha_id_fkey(
            id,
            nome,
            proposta_id,
            created_at
          )
        `)
        .order('data_envio', { ascending: false })
        .limit(10);
      
      // Filtrar por lead_id ou telefone
      if (leadId) {
        const telefone = lead?.phone_e164?.replace('+', '');
        if (telefone) {
          query = query.or(`lead_id.eq.${leadId},telefone_e164.eq.${telefone}`);
        } else {
          query = query.eq('lead_id', leadId);
        }
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Buscar detalhes das propostas únicas
      const propostaIds = [...new Set(data?.map(d => d.campanha?.proposta_id).filter(Boolean))];
      if (propostaIds.length === 0) return [];
      
      const { data: propostasData, error: propostasError } = await supabase
        .from('proposta')
        .select(`
          id,
          descricao,
          nome,
          status,
          tipo,
          valor,
          lead_id,
          contrato:contratos!proposta_contrato_id_fkey(
            id,
            codigo_contrato,
            cliente:clientes!contratos_cliente_id_fkey(nome_empresa)
          ),
          unidade:unidades!proposta_unidade_id_fkey(id, nome)
        `)
        .in('id', propostaIds);
      
      if (propostasError) throw propostasError;
      
      // Combinar dados de disparos com propostas
      const disparosComPropostas = data?.map(disparo => ({
        ...disparo,
        propostaDetalhes: propostasData?.find(p => p.id === disparo.campanha?.proposta_id)
      })).filter(d => d.propostaDetalhes);
      
      return disparosComPropostas || [];
    },
    enabled: (!!leadId || !!lead?.phone_e164) && open,
  });

  // Initialize editedData when lead loads or when creating new lead
  useEffect(() => {
    if (isNewLead && open) {
      // Initialize empty form for new lead (pré-preenche CPF se fornecido pelo CpfGateDialog)
      setEditedData({
        nome: '',
        especialidade: '',
        especialidades: [],
        unidades_vinculadas: [],
        crm: '',
        rqe: '',
        email: '',
        phone_e164: '',
        telefones_adicionais: [],
        whatsapp_phones: [],
        data_nascimento: '',
        data_formatura: '',
        nacionalidade: '',
        naturalidade: '',
        estado_civil: '',
        rg: '',
        cpf: initialCpf || '',
        endereco: '',
        cep: '',
        cidade: '',
        uf: '',
        cnpj: initialCnpj || '',
        banco: '',
        agencia: '',
        conta_corrente: '',
        chave_pix: '',
        modalidade_contrato: '',
        local_prestacao_servico: '',
        data_inicio_contrato: '',
        valor_contrato: '',
        especificacoes_contrato: '',
        observacoes: '',
        status_medico: 'Ativo',
        status_contrato: 'Ativo',
      });
      setLeadTags([]);
      setHasChanges(!!initialCpf || !!initialCnpj);
    } else if (lead) {
      setEditedData({
        nome: lead.nome || '',
        especialidade: lead.especialidade || '',
        especialidades: (lead as any).especialidades || [],
        unidades_vinculadas: (lead as any).unidades_vinculadas || [],
        crm: lead.crm || '',
        rqe: lead.rqe || '',
        email: lead.email || '',
        phone_e164: lead.phone_e164 || '',
        telefones_adicionais: lead.telefones_adicionais || [],
        whatsapp_phones: (lead as any).whatsapp_phones || [],
        data_nascimento: lead.data_nascimento || '',
        data_formatura: (lead as any).data_formatura || '',
        nacionalidade: lead.nacionalidade || '',
        naturalidade: lead.naturalidade || '',
        estado_civil: lead.estado_civil || '',
        rg: lead.rg || '',
        cpf: lead.cpf || '',
        endereco: lead.endereco || '',
        cep: lead.cep || '',
        cidade: (lead as any).cidade || '',
        uf: lead.uf || '',
        cnpj: lead.cnpj || '',
        banco: lead.banco || '',
        agencia: lead.agencia || '',
        conta_corrente: lead.conta_corrente || '',
        chave_pix: lead.chave_pix || '',
        modalidade_contrato: lead.modalidade_contrato || '',
        local_prestacao_servico: lead.local_prestacao_servico || '',
        data_inicio_contrato: lead.data_inicio_contrato || '',
        valor_contrato: lead.valor_contrato || '',
        especificacoes_contrato: lead.especificacoes_contrato || '',
        observacoes: lead.observacoes || '',
        status_medico: (lead as any).status_medico || 'Ativo',
        status_contrato: (lead as any).status_contrato || 'Ativo',
      });
      setLeadTags((lead as any).tags || []);
      setHasChanges(false);
      setTimeout(adjustTextareaHeight, 0);
    }
  }, [lead, isNewLead, open, adjustTextareaHeight]);

  // Check if lead has been converted to medico
  const { data: medicoVinculado } = useQuery({
    queryKey: ['lead-medico-vinculo', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo, crm, especialidade, status_medico, aprovacao_contrato_assinado, aprovacao_documentacao_unidade, aprovacao_cadastro_unidade, data_aprovacao_corpo_medico')
        .eq('lead_id', leadId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && open,
  });

  // Initialize approval checkboxes when medico data loads
  useEffect(() => {
    if (medicoVinculado) {
      setAprovacaoContrato(medicoVinculado.aprovacao_contrato_assinado || false);
      setAprovacaoDocumentacao(medicoVinculado.aprovacao_documentacao_unidade || false);
      setAprovacaoCadastro(medicoVinculado.aprovacao_cadastro_unidade || false);
      setHasApprovalChanges(false);
    }
  }, [medicoVinculado]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Convert empty strings to null for numeric and date fields
      const sanitizedData = { ...editedData };
      
      // Handle numeric field
      if (sanitizedData.valor_contrato === '' || sanitizedData.valor_contrato === null) {
        sanitizedData.valor_contrato = null;
      } else if (typeof sanitizedData.valor_contrato === 'string') {
        const parsed = parseFloat(sanitizedData.valor_contrato.replace(/\./g, '').replace(',', '.'));
        sanitizedData.valor_contrato = isNaN(parsed) ? null : parsed;
      }

      // Handle date fields - convert empty strings to null
      const dateFields = ['data_nascimento', 'data_formatura', 'data_inicio_contrato'];
      dateFields.forEach(field => {
        if (sanitizedData[field] === '') {
          sanitizedData[field] = null;
        }
      });

      // If this is a NEW lead, CREATE it instead of updating
      if (isNewLead) {
        // Validate required fields
        if (!sanitizedData.nome || sanitizedData.nome.trim() === '') {
          throw new Error('Nome é obrigatório');
        }
        
        // Generate unique phone if not provided
        if (!sanitizedData.phone_e164 || sanitizedData.phone_e164.trim() === '') {
          sanitizedData.phone_e164 = `+55000${Date.now()}`;
        }

        const { data: { user } } = await supabase.auth.getUser();

        const insertPayload = {
          nome: sanitizedData.nome,
          phone_e164: sanitizedData.phone_e164,
          especialidade: sanitizedData.especialidade || null,
          especialidades: sanitizedData.especialidades || [],
          unidades_vinculadas: sanitizedData.unidades_vinculadas || [],
          crm: sanitizedData.crm || null,
          rqe: sanitizedData.rqe || null,
          email: sanitizedData.email || null,
           telefones_adicionais: sanitizedData.telefones_adicionais || [],
           whatsapp_phones: sanitizedData.whatsapp_phones || [],
          data_nascimento: sanitizedData.data_nascimento || null,
          data_formatura: sanitizedData.data_formatura || null,
          nacionalidade: sanitizedData.nacionalidade || null,
          naturalidade: sanitizedData.naturalidade || null,
          estado_civil: sanitizedData.estado_civil || null,
          rg: sanitizedData.rg || null,
          cpf: sanitizedData.cpf || null,
          endereco: sanitizedData.endereco || null,
          cep: sanitizedData.cep || null,
          uf: sanitizedData.uf || null,
          cnpj: sanitizedData.cnpj || null,
          banco: sanitizedData.banco || null,
          agencia: sanitizedData.agencia || null,
          conta_corrente: sanitizedData.conta_corrente || null,
          chave_pix: sanitizedData.chave_pix || null,
          modalidade_contrato: sanitizedData.modalidade_contrato || null,
          local_prestacao_servico: sanitizedData.local_prestacao_servico || null,
          data_inicio_contrato: sanitizedData.data_inicio_contrato || null,
          valor_contrato: sanitizedData.valor_contrato || null,
          especificacoes_contrato: sanitizedData.especificacoes_contrato || null,
          observacoes: sanitizedData.observacoes || null,
          status_medico: sanitizedData.status_medico || 'Ativo',
          status_contrato: sanitizedData.status_contrato || 'Ativo',
          status: createAsCorpoClinico ? 'Convertido' : 'Novo',
          data_conversao: createAsCorpoClinico ? new Date().toISOString() : null,
          convertido_por: createAsCorpoClinico ? user?.id : null,
        };

        const { data: newLead, error } = await supabase
          .from('leads')
          .insert(insertPayload)
          .select('id')
        .single();

        if (error) throw error;

        // Registrar criação do lead no histórico
        await registrarCriacaoLead(newLead.id, insertPayload);

        // Check if we're on medicos page (Kanban context) - should auto-create medico and kanban card
        const shouldAutoCreateMedicoAndKanban = isOnMedicosPage && !createAsCorpoClinico;

        // If creating as Corpo Clínico OR from medicos page (Kanban), also create médico
        if (createAsCorpoClinico || shouldAutoCreateMedicoAndKanban) {
          const medicoPayload = {
            nome_completo: sanitizedData.nome,
            especialidade: sanitizedData.especialidades?.length > 0 
              ? sanitizedData.especialidades 
              : (sanitizedData.especialidade ? [sanitizedData.especialidade] : []),
            phone_e164: sanitizedData.phone_e164,
            estado: sanitizedData.uf,
            lead_id: newLead.id,
            email: sanitizedData.email || `temp_${sanitizedData.phone_e164}@example.com`,
            telefone: sanitizedData.phone_e164,
            crm: sanitizedData.crm || 'PENDENTE',
            cpf: sanitizedData.cpf,
            data_nascimento: sanitizedData.data_nascimento,
            // Approval fields for corpo clínico (only if creating as corpo clínico)
            aprovacao_contrato_assinado: createAsCorpoClinico ? true : false,
            aprovacao_documentacao_unidade: createAsCorpoClinico ? true : false,
            aprovacao_cadastro_unidade: createAsCorpoClinico ? true : false,
            data_aprovacao_corpo_medico: createAsCorpoClinico ? new Date().toISOString() : null,
            aprovado_corpo_medico_por: createAsCorpoClinico ? user?.id : null,
            status_medico: 'Ativo',
          };

          const { data: newMedico, error: medicoError } = await supabase
            .from('medicos')
            .insert(medicoPayload as any)
            .select('id')
            .single();

          if (medicoError) {
            console.error('Erro ao criar médico:', medicoError);
            // Não bloquear, lead já foi criado
          } else if (newMedico && shouldAutoCreateMedicoAndKanban) {
            // Create Kanban card for the new medico
            const { data: primeiraColuna } = await supabase
              .from('kanban_status_config')
              .select('status_id')
              .eq('modulo', 'medicos')
              .order('ordem', { ascending: true })
              .limit(1)
              .single();

            if (primeiraColuna) {
              await supabase
                .from('medico_kanban_cards')
                .insert({
                  nome: sanitizedData.nome,
                  cpf: sanitizedData.cpf,
                  data_nascimento: sanitizedData.data_nascimento,
                  crm: sanitizedData.crm,
                  telefone: sanitizedData.phone_e164,
                  email: sanitizedData.email,
                  observacoes: sanitizedData.observacoes,
                  status: primeiraColuna.status_id,
                  medico_id: newMedico.id,
                });
            }

            // Update lead to Convertido status
            await supabase
              .from('leads')
              .update({ 
                status: 'Convertido',
                data_conversao: new Date().toISOString(),
                convertido_por: user?.id
              })
              .eq('id', newLead.id);
          }
        }

        return { isNew: true, newLeadId: newLead.id, createdAsCorpoClinico: createAsCorpoClinico, createdFromKanban: shouldAutoCreateMedicoAndKanban };
      }

      // EXISTING lead - update it
      if (!lead || !leadId) throw new Error('Lead não encontrado');

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

      if (camposAlterados.length === 0) {
        throw new Error('Nenhuma alteração detectada');
      }

      const updatePayload = {
        ...sanitizedData,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', leadId);

      if (error) throw error;

      await registrarEdicaoLead(leadId, dadosAntigos, dadosNovos, camposAlterados);

      return { isNew: false, camposAlterados };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['medico-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      if (result?.createdAsCorpoClinico || result?.createdFromKanban) {
        queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
        queryClient.invalidateQueries({ queryKey: ['medicos'] });
      }
      if (!isNewLead && leadId) {
        queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
        queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      }
      setHasChanges(false);
      let message: string;
      if (result?.createdAsCorpoClinico) {
        message = 'Médico criado e adicionado ao Corpo Clínico!';
      } else if (result?.createdFromKanban) {
        message = 'Médico criado e adicionado ao Kanban!';
      } else if (isNewLead) {
        message = 'Lead criado com sucesso!';
      } else {
        message = 'Lead atualizado com sucesso!';
      }
      toast.success(message);
      if (isNewLead) {
        onOpenChange(false);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar alterações');
    },
  });

  // Conversion mutation
  const convertToMedicoMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');
      if (!motivoConversao.trim()) throw new Error('O motivo da conversão é obrigatório');

      const { data: { user } } = await supabase.auth.getUser();

      // Verificar se já existe médico com mesmo telefone OU mesmo CRM
      const { data: existingByPhone } = await supabase
        .from('medicos')
        .select('id, nome_completo')
        .eq('phone_e164', lead.phone_e164)
        .maybeSingle();

      const { data: existingByCRM } = lead.crm ? await supabase
        .from('medicos')
        .select('id, nome_completo, crm')
        .eq('crm', lead.crm)
        .maybeSingle() : { data: null };

      const existingMedico = existingByPhone || existingByCRM;

      let medicoId: string;
      let isNewMedico = false;

      if (existingMedico) {
        // Médico já existe - vincular ao lead
        const { error: updateError } = await supabase
          .from('medicos')
          .update({ lead_id: lead.id })
          .eq('id', existingMedico.id);
        
        if (updateError) throw updateError;
        medicoId = existingMedico.id;
        
        toast.info(`Médico ${existingMedico.nome_completo} já existia e foi vinculado ao lead.`);
      } else {
        isNewMedico = true;
        const medicoPayload = {
          nome_completo: lead.nome,
          especialidade: (lead as any).especialidades?.length > 0 
            ? (lead as any).especialidades 
            : (lead.especialidade ? [lead.especialidade] : []),
          phone_e164: lead.phone_e164,
          estado: lead.uf,
          lead_id: lead.id,
          email: lead.email || `temp_${lead.phone_e164}@example.com`,
          telefone: lead.phone_e164,
          crm: lead.crm || 'PENDENTE',
        };
        
        const { data: newMedico, error: insertError } = await supabase
          .from('medicos')
          .insert(medicoPayload as any)
          .select('id')
          .single();
        
        if (insertError) {
          if (insertError.message?.includes('medicos_crm_key')) {
            throw new Error(`Já existe um médico cadastrado com o CRM "${lead.crm}". Verifique os dados.`);
          }
          throw insertError;
        }
        medicoId = newMedico.id;
      }

      // Verificar se já existe card kanban para este médico
      const { data: existingKanbanCard } = await supabase
        .from('medico_kanban_cards')
        .select('id')
        .eq('medico_id', medicoId)
        .maybeSingle();

      // Criar card no Kanban se não existir
      if (!existingKanbanCard) {
        const { data: primeiraColuna } = await supabase
          .from('kanban_status_config')
          .select('status_id')
          .eq('modulo', 'medicos')
          .order('ordem', { ascending: true })
          .limit(1)
          .single();

        if (primeiraColuna) {
          await supabase
            .from('medico_kanban_cards')
            .insert({
              nome: lead.nome,
              cpf: lead.cpf,
              data_nascimento: lead.data_nascimento,
              crm: lead.crm,
              telefone: lead.phone_e164,
              email: lead.email,
              observacoes: lead.observacoes,
              status: primeiraColuna.status_id,
              medico_id: medicoId,
            });
        }
      }

      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'Convertido',
          data_conversao: new Date().toISOString(),
          convertido_por: user?.id,
          canal_conversao: canalConversao
        } as any)
        .eq('id', lead.id);
      
      if (leadError) throw leadError;

      await registrarConversaoMedico(lead.id, medicoId, {
        motivo_conversao: motivoConversao.trim(),
        dados_lead: {
          nome: lead.nome,
          especialidade: lead.especialidade,
          telefone: lead.phone_e164,
          email: lead.email
        }
      });

      return medicoId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-medico-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      setMotivoConversao('');
      setShowConversaoForm(false);
      toast.success('Lead convertido em médico com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao converter lead');
    },
  });

  // Mutation para vincular proposta de disparo ao lead
  const vincularPropostaDisparoMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      if (!leadId) throw new Error('Lead não encontrado');
      
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('proposta')
        .update({ 
          lead_id: leadId,
          descricao: `Proposta vinculada a ${lead?.nome || 'Lead'}`,
          criado_por: user?.id || null,
          criado_por_nome: user?.user_metadata?.nome_completo || user?.email || null,
        })
        .eq('id', propostaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-propostas-count', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-disparos-recentes', leadId] });
      toast.success('Proposta do disparo vinculada com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao vincular proposta');
    },
  });

  // Send to acompanhamento mutation
  const sendToAcompanhamentoMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');

      const success = await atualizarStatusLead(
        lead.id, 
        'Acompanhamento',
        lead.status,
        'enviado_acompanhamento'
      );

      if (!success) {
        throw new Error('Erro ao atualizar status do lead');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['acompanhamento-leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      toast.success('Lead enviado para acompanhamento!');
      navigate(`/disparos/acompanhamento?lead_id=${leadId}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar para acompanhamento');
    },
  });

  // Save approval for Corpo Médico mutation
  const saveApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');
      
      const allApproved = aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro;
      
      // Motivo obrigatório apenas quando todas aprovações estão marcadas
      if (allApproved && !motivoAprovacao.trim()) {
        throw new Error('O motivo da aprovação para Corpo Clínico é obrigatório');
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      let medicoId = medicoVinculado?.id;
      
      // If no medico record exists, create one first
      if (!medicoId) {
        // Check if there's already a medico with same phone
        const { data: existingMedico } = await supabase
          .from('medicos')
          .select('id')
          .eq('phone_e164', lead.phone_e164)
          .maybeSingle();
        
        if (existingMedico) {
          // Update existing to link with this lead
          await supabase
            .from('medicos')
            .update({ lead_id: lead.id })
            .eq('id', existingMedico.id);
          medicoId = existingMedico.id;
        } else {
          // Create new medico record with valid enum value
          const medicoPayload = {
            nome_completo: lead.nome,
            especialidade: lead.especialidade ? [lead.especialidade] : [],
            phone_e164: lead.phone_e164,
            estado: lead.uf,
            lead_id: lead.id,
            email: lead.email || `temp_${lead.phone_e164}@example.com`,
            telefone: lead.phone_e164,
            crm: lead.crm || 'PENDENTE',
            status_medico: statusMedico, // Use selected status (Ativo, Inativo, Suspenso)
          };
          
          const { data: newMedico, error: insertError } = await supabase
            .from('medicos')
            .insert(medicoPayload as any)
            .select('id')
            .single();
          
          if (insertError) throw insertError;
          medicoId = newMedico.id;
        }
      }
      
      const updateData: any = {
        aprovacao_contrato_assinado: aprovacaoContrato,
        aprovacao_documentacao_unidade: aprovacaoDocumentacao,
        aprovacao_cadastro_unidade: aprovacaoCadastro,
      };

      // If all approved, set approval date and use selected status
      if (allApproved) {
        updateData.data_aprovacao_corpo_medico = new Date().toISOString();
        updateData.aprovado_corpo_medico_por = user?.id;
        updateData.status_medico = statusMedico; // Use valid enum value (Ativo, Inativo, Suspenso)
      }

      const { error } = await supabase
        .from('medicos')
        .update(updateData)
        .eq('id', medicoId);

      if (error) throw error;

      // Registrar no histórico se aprovado para corpo clínico
      if (allApproved && leadId) {
        const userName = user?.user_metadata?.nome_completo || user?.email || 'Usuário';
        await supabase
          .from('lead_anotacoes')
          .insert({
            lead_id: leadId,
            tipo: 'aprovacao_corpo_clinico',
            titulo: 'Aprovado para Corpo Clínico',
            conteudo: motivoAprovacao.trim(),
            usuario_id: user?.id,
            usuario_nome: userName,
          });
      }
      
      return allApproved;
    },
    onSuccess: (allApproved) => {
      queryClient.invalidateQueries({ queryKey: ['lead-medico-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      setHasApprovalChanges(false);
      setMotivoAprovacao('');
      
      if (allApproved) {
        toast.success('Médico aprovado e movido para Corpo Clínico!');
      } else {
        toast.success('Aprovações salvas com sucesso!');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar aprovações');
    },
  });

  // Desconversão mutation - voltar médico para lead
  const desconversaoMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !medicoVinculado) throw new Error('Lead ou médico não encontrado');
      if (!motivoDesconversao.trim()) throw new Error('O motivo da desconversão é obrigatório');

      const medicoId = medicoVinculado.id;

      // 1. Remover card do Kanban do médico ANTES de desvincular
      // Primeiro tenta pelo medico_id
      const { data: deletedByMedico } = await supabase
        .from('medico_kanban_cards')
        .delete()
        .eq('medico_id', medicoId)
        .select('id');

      // Se não deletou nenhum card pelo medico_id, tenta por outros identificadores
      if (!deletedByMedico || deletedByMedico.length === 0) {
        // Tentar deletar pelo email
        if (lead.email) {
          const { data: deletedByEmail } = await supabase
            .from('medico_kanban_cards')
            .delete()
            .eq('email', lead.email)
            .select('id');
          
          if (deletedByEmail && deletedByEmail.length > 0) {
            console.log('Card deletado por email:', deletedByEmail);
          }
        }
        
        // Tentar deletar pelo nome exato (fallback importante)
        if (lead.nome) {
          const { data: deletedByNome } = await supabase
            .from('medico_kanban_cards')
            .delete()
            .eq('nome', lead.nome)
            .select('id');
          
          if (deletedByNome && deletedByNome.length > 0) {
            console.log('Card deletado por nome:', deletedByNome);
          }
        }
        
        // Tentar deletar pelo CPF se disponível
        if (lead.cpf) {
          const { data: deletedByCpf } = await supabase
            .from('medico_kanban_cards')
            .delete()
            .eq('cpf', lead.cpf)
            .select('id');
          
          if (deletedByCpf && deletedByCpf.length > 0) {
            console.log('Card deletado por CPF:', deletedByCpf);
          }
        }
      }

      // 2. Remover vínculo do médico com o lead e limpar aprovações
      const { error: medicoError } = await supabase
        .from('medicos')
        .update({ 
          lead_id: null,
          aprovacao_contrato_assinado: false,
          aprovacao_documentacao_unidade: false,
          aprovacao_cadastro_unidade: false,
          data_aprovacao_corpo_medico: null,
          aprovado_corpo_medico_por: null,
        })
        .eq('id', medicoId);

      if (medicoError) throw medicoError;

      // 3. Atualizar status do lead de volta para "Acompanhamento"
      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'Acompanhamento',
          data_conversao: null,
          convertido_por: null,
        })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      // 4. Registrar no histórico
      await registrarDesconversaoParaLead(lead.id, medicoId, motivoDesconversao.trim());

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-medico-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      setMotivoDesconversao('');
      setShowDesconversaoForm(false);
      toast.success('Médico desconvertido para Lead com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao desconverter médico');
    },
  });

  // Descarte de Lead mutation - mover para Descartados (funciona para leads e médicos convertidos)
  const descartarLeadMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('Lead não encontrado');
      if (motivoDescarte.trim().length < 60) {
        throw new Error('O motivo deve ter no mínimo 60 caracteres');
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.nome_completo || user?.email || 'Usuário';

      // Se tem médico vinculado, precisamos remover o vínculo e o card do kanban
      if (medicoVinculado?.id) {
        // 1. Deletar card do Kanban (tentativas robustas)
        const { data: deletedByMedico } = await supabase
          .from('medico_kanban_cards')
          .delete()
          .eq('medico_id', medicoVinculado.id)
          .select('id');

        if (!deletedByMedico || deletedByMedico.length === 0) {
          // Tentar por email, nome ou CPF como fallback
          if (lead.email) {
            await supabase
              .from('medico_kanban_cards')
              .delete()
              .eq('email', lead.email);
          }
          if (lead.nome) {
            await supabase
              .from('medico_kanban_cards')
              .delete()
              .eq('nome', lead.nome);
          }
          if (lead.cpf) {
            await supabase
              .from('medico_kanban_cards')
              .delete()
              .eq('cpf', lead.cpf);
          }
        }

        // 2. Remover vínculo do médico com o lead
        await supabase
          .from('medicos')
          .update({ 
            lead_id: null,
            aprovacao_contrato_assinado: false,
            aprovacao_documentacao_unidade: false,
            aprovacao_cadastro_unidade: false,
            data_aprovacao_corpo_medico: null,
            aprovado_corpo_medico_por: null,
          })
          .eq('id', medicoVinculado.id);
      }

      // 3. Atualizar status do lead para "Descartado"
      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'Descartado',
          data_conversao: null,
          convertido_por: null,
          observacoes: lead.observacoes 
            ? `${lead.observacoes}\n\n[DESCARTADO]: ${motivoDescarte.trim()}`
            : `[DESCARTADO]: ${motivoDescarte.trim()}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      // 4. Registrar no histórico usando o logger
      await atualizarStatusLead(lead.id, 'Descartado', lead.status, 'descartado' as any);

      // 5. Adicionar anotação no histórico de anotações
      await supabase
        .from('lead_anotacoes')
        .insert({
          lead_id: lead.id,
          tipo: 'descarte',
          titulo: 'Lead Descartado',
          conteudo: motivoDescarte.trim(),
          usuario_id: user?.id,
          usuario_nome: userName,
        });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['acompanhamento-leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-medico-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      setMotivoDescarte('');
      setShowDescarteForm(false);
      toast.success('Lead descartado com sucesso!');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao descartar lead');
    },
  });

  // Reprocessar Médico mutation - criar novo card no Kanban mantendo corpo clínico
  const reprocessarMedicoMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !medicoVinculado) throw new Error('Lead ou médico não encontrado');
      if (!motivoReprocessamento.trim()) throw new Error('O motivo do reprocessamento é obrigatório');

      const medicoId = medicoVinculado.id;

      // 1. Buscar primeira coluna do Kanban de médicos
      const { data: primeiraColuna } = await supabase
        .from('kanban_status_config')
        .select('status_id')
        .eq('modulo', 'medicos')
        .order('ordem', { ascending: true })
        .limit(1)
        .single();

      if (!primeiraColuna) {
        throw new Error('Não foi possível encontrar a coluna inicial do Kanban');
      }

      // 2. Verificar se já existe card para esse médico
      const { data: existingCard } = await supabase
        .from('medico_kanban_cards')
        .select('id')
        .eq('medico_id', medicoId)
        .maybeSingle();

      if (existingCard) {
        throw new Error('Este médico já possui um card ativo no Kanban');
      }

      // 3. Resetar aprovações do médico para que apareça no Kanban
      const { error: resetError } = await supabase
        .from('medicos')
        .update({
          aprovacao_contrato_assinado: false,
          aprovacao_documentacao_unidade: false,
          aprovacao_cadastro_unidade: false,
          data_aprovacao_corpo_medico: null,
          aprovado_corpo_medico_por: null,
        })
        .eq('id', medicoId);

      if (resetError) throw resetError;

      // 4. Criar novo card no Kanban (médico continua no corpo clínico)
      const { error: cardError } = await supabase
        .from('medico_kanban_cards')
        .insert({
          nome: lead.nome,
          cpf: lead.cpf,
          data_nascimento: lead.data_nascimento,
          crm: lead.crm,
          telefone: lead.phone_e164,
          email: lead.email,
          observacoes: `[REPROCESSAMENTO]: ${motivoReprocessamento.trim()}`,
          status: primeiraColuna.status_id,
          medico_id: medicoId,
        });

      if (cardError) throw cardError;

      // 5. Registrar no histórico
      await registrarReprocessamentoKanban(lead.id, medicoId, motivoReprocessamento.trim());

      // 6. Adicionar anotação
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.nome_completo || user?.email || 'Usuário';
      
      await supabase
        .from('lead_anotacoes')
        .insert({
          lead_id: lead.id,
          tipo: 'reprocessamento',
          titulo: 'Médico Reprocessado no Kanban',
          conteudo: motivoReprocessamento.trim(),
          usuario_id: user?.id,
          usuario_nome: userName,
        });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medico-kanban-cards'] });
      setMotivoReprocessamento('');
      setShowReprocessamentoForm(false);
      toast.success('Médico adicionado ao Kanban para novo processo!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao reprocessar médico');
    },
  });

  // Desconversão do Corpo Clínico mutation - voltar médico do corpo clínico para lead
  const desconversaoCorpoClinicoMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !medicoVinculado) throw new Error('Lead ou médico não encontrado');
      if (!motivoDesconversaoCorpo.trim()) throw new Error('O motivo da desconversão é obrigatório');

      const medicoId = medicoVinculado.id;

      // 1. Remover card do Kanban se existir
      await supabase
        .from('medico_kanban_cards')
        .delete()
        .eq('medico_id', medicoId);

      // 2. Limpar aprovações e data do corpo clínico
      const { error: medicoError } = await supabase
        .from('medicos')
        .update({ 
          lead_id: null,
          aprovacao_contrato_assinado: false,
          aprovacao_documentacao_unidade: false,
          aprovacao_cadastro_unidade: false,
          data_aprovacao_corpo_medico: null,
          aprovado_corpo_medico_por: null,
        })
        .eq('id', medicoId);

      if (medicoError) throw medicoError;

      // 3. Atualizar status do lead de volta para "Acompanhamento"
      const { error: leadError } = await supabase
        .from('leads')
        .update({ 
          status: 'Acompanhamento',
          data_conversao: null,
          convertido_por: null,
        })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      // 4. Registrar no histórico
      await registrarDesconversaoParaLead(lead.id, medicoId, motivoDesconversaoCorpo.trim());

      // 5. Adicionar anotação
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.nome_completo || user?.email || 'Usuário';
      
      await supabase
        .from('lead_anotacoes')
        .insert({
          lead_id: lead.id,
          tipo: 'desconversao_corpo_clinico',
          titulo: 'Removido do Corpo Clínico',
          conteudo: motivoDesconversaoCorpo.trim(),
          usuario_id: user?.id,
          usuario_nome: userName,
        });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['leads-filter-counts'] });
      queryClient.invalidateQueries({ queryKey: ['lead-prontuario', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-medico-vinculo', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-anotacoes', leadId] });
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      setMotivoDesconversaoCorpo('');
      setShowDesconversaoCorpoForm(false);
      toast.success('Médico removido do Corpo Clínico e voltou a ser Lead!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao desconverter médico do corpo clínico');
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
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Novo': return 'bg-blue-600 text-white border-blue-700';
      case 'Qualificado': return 'bg-purple-600 text-white border-purple-700';
      case 'Acompanhamento': return 'bg-amber-500 text-white border-amber-600';
      case 'Em Resposta': return 'bg-cyan-600 text-white border-cyan-700';
      case 'Proposta Enviada': return 'bg-indigo-600 text-white border-indigo-700';
      case 'Proposta Aceita': return 'bg-emerald-600 text-white border-emerald-700';
      case 'Convertido': return 'bg-green-700 text-white border-green-800';
      case 'Descartado': return 'bg-red-600 text-white border-red-700';
      default: return '';
    }
  };

  const handleGoToMedico = () => {
    if (medicoVinculado) {
      onOpenChange(false);
      navigate('/medicos');
    }
  };

  if (!leadId && !isNewLead) return null;

  return (
    <>
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
                      {isNewLead ? 'Novo Médico' : (loadingLead ? <Skeleton className="h-5 w-40" /> : lead?.nome)}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {isNewLead ? (
                        <Badge variant="outline" className="text-xs bg-blue-600 text-white border-blue-700">
                          Novo
                        </Badge>
                      ) : loadingLead ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        <>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(lead?.status || '')}`}>
                            {lead?.status}
                          </Badge>
                          {(() => {
                            const enrichStatus = (lead as any)?.api_enrich_status;
                            if (!enrichStatus) return null;
                            if (enrichStatus === 'pendente') return (
                              <Badge variant="outline" className="text-xs bg-slate-500 text-white border-slate-600">Pendente</Badge>
                            );
                            if (enrichStatus === 'concluido' || enrichStatus === 'alimentado') return (
                              <Badge variant="outline" className="text-xs bg-amber-500 text-white border-amber-600 shadow-[0_0_6px_rgba(245,158,11,0.3)]">Enriquecido</Badge>
                            );
            if (enrichStatus === 'erro') return (
                              <Badge variant="outline" className="text-xs bg-red-500 text-white border-red-600">Não encontrado</Badge>
                            );
                            return null;
                          })()}
                          {medicoVinculado && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Convertido
                            </Badge>
                          )}
                        </>
                      )}
                      {/* Etiquetas */}
                      {!isNewLead && leadId && (
                        <LeadEtiquetasDropdown
                          leadId={leadId}
                          selectedTags={leadTags}
                          onTagsChange={setLeadTags}
                          disabled={loadingLead}
                        />
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
                  {(hasChanges || isNewLead) && (
                    <Button 
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || (isNewLead && !editedData.nome?.trim())}
                      size="sm"
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saveMutation.isPending ? 'Salvando...' : (isNewLead ? 'Criar' : 'Salvar')}
                    </Button>
                  )}
                  {/* Botão Acompanhamento - apenas para leads não convertidos e fora da página médicos */}
                  {!medicoVinculado && !isOnMedicosPage && (
                    <Button 
                      variant="outline"
                      onClick={() => sendToAcompanhamentoMutation.mutate()}
                      disabled={sendToAcompanhamentoMutation.isPending || lead?.status === 'Acompanhamento'}
                      size="sm"
                      className="gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendToAcompanhamentoMutation.isPending ? 'Enviando...' : 
                       lead?.status === 'Acompanhamento' ? 'Em Acompanhamento' : 'Acompanhamento'}
                    </Button>
                  )}
                  {/* Botão Região de Interesse */}
                  {lead && !isNewLead && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setShowRegiaoInteresse(true)}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Região de Interesse
                    </Button>
                  )}
                  {/* REMOVIDO: Botão Converter do header - conversões devem ser feitas exclusivamente na aba Conversão */}
                  {medicoVinculado && !isOnMedicosPage && (
                    <Button onClick={handleGoToMedico} size="sm" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver Médico
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid grid-cols-6 mx-4 mt-2 flex-shrink-0 w-auto">
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
                {canViewOld && (
                  <TabsTrigger value="old" className="gap-1.5 text-xs">
                    <FolderArchive className="h-3.5 w-3.5" />
                    OLD
                  </TabsTrigger>
                )}
                <TabsTrigger value="conversao" className="gap-1.5 text-xs">
                  <UserCheck className="h-3.5 w-3.5" />
                  Conversão
                </TabsTrigger>
                <TabsTrigger value="atividades" className="gap-1.5 text-xs">
                  <Activity className="h-3.5 w-3.5" />
                  Atividades
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden min-w-0">
                {/* Dados do Lead - Layout compacto */}
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
                              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                Nome *
                              </label>
                              <Input
                                value={editedData.nome || ''}
                                onChange={(e) => handleFieldChange('nome', e.target.value)}
                                className={invisibleInputClass}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3 min-w-0">
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

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3" />
                                  Data Formatura
                                </label>
                                <Input
                                  type="date"
                                  value={(editedData as any).data_formatura || ''}
                                  onChange={(e) => handleFieldChange('data_formatura', e.target.value)}
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

                              {/* Telefones + Emails lado a lado */}
                              <div className="col-span-full">
                                <PhoneEmailArrayFields
                                  phones={(() => {
                                    const allPhones: string[] = [];
                                    if (editedData.phone_e164) allPhones.push(formatPhoneForDisplay(editedData.phone_e164));
                                    if (editedData.telefones_adicionais?.length) {
                                      allPhones.push(...editedData.telefones_adicionais);
                                    }
                                    return allPhones;
                                  })()}
                                  email={editedData.email || ''}
                                  onPhonesChange={(phones) => {
                                    if (phones.length > 0) {
                                      handleFieldChange('phone_e164', normalizeToE164(phones[0]));
                                      handleFieldChange('telefones_adicionais', phones.slice(1));
                                    } else {
                                      handleFieldChange('phone_e164', '');
                                      handleFieldChange('telefones_adicionais', []);
                                    }
                                  }}
                                  onEmailChange={(email) => handleFieldChange('email', email)}
                                  whatsappPhones={editedData.whatsapp_phones || []}
                                  onWhatsappPhonesChange={(wps) => handleFieldChange('whatsapp_phones', wps)}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Globe className="h-3 w-3" />
                                  Nacionalidade
                                </label>
                                <Input
                                  value={editedData.nacionalidade || ''}
                                  onChange={(e) => handleFieldChange('nacionalidade', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />
                                  Naturalidade
                                </label>
                                <Input
                                  value={editedData.naturalidade || ''}
                                  onChange={(e) => handleFieldChange('naturalidade', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Heart className="h-3 w-3" />
                                  Estado Civil
                                </label>
                                <Input
                                  value={editedData.estado_civil || ''}
                                  onChange={(e) => handleFieldChange('estado_civil', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
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
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />
                                  CEP
                                </label>
                                <Input
                                  value={editedData.cep || ''}
                                  onChange={(e) => handleFieldChange('cep', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

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

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />
                                  UF
                                </label>
                                <Select
                                  value={editedData.uf || ''}
                                  onValueChange={(value) => handleFieldChange('uf', value === '__none__' ? '' : value)}
                                >
                                  <SelectTrigger className={invisibleInputClass}>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[300px]">
                                    <SelectItem value="__none__">Não informado</SelectItem>
                                    {['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
                                      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
                                      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].map((uf) => (
                                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                                  <Stethoscope className="h-3 w-3" />
                                  CRM
                                </label>
                                <Input
                                  value={editedData.crm || ''}
                                  onChange={(e) => handleFieldChange('crm', e.target.value)}
                                  placeholder="CRM/UF 00000"
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Stethoscope className="h-3 w-3" />
                                  RQE
                                </label>
                                <Input
                                  value={editedData.rqe || ''}
                                  onChange={(e) => handleFieldChange('rqe', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Briefcase className="h-3 w-3" />
                                  Especialidades Médicas
                                </label>
                                <EspecialidadeMultiSelect
                                  value={editedData.especialidades || []}
                                  onChange={(value) => handleFieldChange('especialidades', value)}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Building2 className="h-3 w-3" />
                                  Unidades Vinculadas
                                </label>
                                <UnidadeMultiSelect
                                  value={editedData.unidades_vinculadas || []}
                                  onChange={(value) => handleFieldChange('unidades_vinculadas', value)}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Activity className="h-3 w-3" />
                                  Status do Médico
                                </label>
                                <Select
                                  value={editedData.status_medico || 'Ativo'}
                                  onValueChange={(value) => handleFieldChange('status_medico', value)}
                                >
                                  <SelectTrigger className={invisibleInputClass}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Ativo">Ativo</SelectItem>
                                    <SelectItem value="Inativo">Inativo</SelectItem>
                                    <SelectItem value="Suspenso">Suspenso</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <FileSignature className="h-3 w-3" />
                                  Status do Contrato
                                </label>
                                <Select
                                  value={editedData.status_contrato || 'Ativo'}
                                  onValueChange={(value) => handleFieldChange('status_contrato', value)}
                                >
                                  <SelectTrigger className={invisibleInputClass}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Ativo">Ativo</SelectItem>
                                    <SelectItem value="Inativo">Inativo</SelectItem>
                                    <SelectItem value="Pendente">Pendente</SelectItem>
                                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
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

                            <div className="grid grid-cols-2 gap-3 min-w-0">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <Building2 className="h-3 w-3" />
                                  CNPJ
                                </label>
                                <Input
                                  value={editedData.cnpj || ''}
                                  onChange={(e) => handleFieldChange('cnpj', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Modalidade de Contrato</label>
                                <Select
                                  value={editedData.modalidade_contrato || ''}
                                  onValueChange={(value) => handleFieldChange('modalidade_contrato', value)}
                                >
                                  <SelectTrigger className={invisibleInputClass}>
                                    <SelectValue placeholder="Selecione a modalidade" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                                    <SelectItem value="Pessoa Jurídica e Sócio">Pessoa Jurídica e Sócio</SelectItem>
                                    <SelectItem value="Sócio">Sócio</SelectItem>
                                    <SelectItem value="PF Condicionada a PJ">PF Condicionada a PJ</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Data Início</label>
                                <Input
                                  type="date"
                                  value={editedData.data_inicio_contrato || ''}
                                  onChange={(e) => handleFieldChange('data_inicio_contrato', e.target.value)}
                                  className={invisibleInputClass}
                                />
                              </div>
                            </div>


                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border/50">
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
                          </div>

                          {/* Links Externos */}
                          {leadId && !isNewLead && (
                            <LeadLinksExternosSection leadId={leadId} />
                          )}

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
                              className="flex w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 hover:border-input hover:bg-muted/30 focus:border-input focus:bg-muted/30 transition-all overflow-hidden min-h-[60px]"
                              placeholder="Observações gerais..."
                            />
                          </div>

                          {/* Origin Tracking */}
                          {lead && (lead.licitacao_origem || lead.contrato_origem || lead.servico_origem) && (
                            <div className="pt-2 border-t">
                              <h4 className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-2">
                                <FileText className="h-3 w-3" />
                                Origem da Oportunidade
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {lead.licitacao_origem && (
                                  <Badge variant="outline" className="text-xs">
                                    Licitação: {lead.licitacao_origem.numero_edital}
                                  </Badge>
                                )}
                                {lead.contrato_origem && (
                                  <Badge variant="outline" className="text-xs">
                                    Contrato: {lead.contrato_origem.codigo_contrato || 'Sem código'}
                                  </Badge>
                                )}
                                {lead.servico_origem && (
                                  <Badge variant="outline" className="text-xs">
                                    Serviço: {lead.servico_origem.nome}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Médico Vinculado */}
                          {medicoVinculado && (
                            <div className="pt-2 border-t">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-600">Médico Vinculado</span>
                                </div>
                                <Button variant="outline" onClick={handleGoToMedico} size="sm" className="gap-1.5">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Ver Cadastro
                                </Button>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {medicoVinculado.nome_completo} • {medicoVinculado.crm}
                              </div>
                            </div>
                          )}

                          {/* Anexos - no final */}
                          <LeadAnexosSection leadId={leadId} />

                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Propostas */}
                <TabsContent value="propostas" className="m-0 h-full">
                  <ScrollArea className="h-full p-4">
                    <LeadPropostasSection 
                      leadId={leadId} 
                      leadNome={lead?.nome} 
                      unidadesVinculadas={lead?.unidades_vinculadas || []} 
                    />
                  </ScrollArea>
                </TabsContent>

                {/* Histórico / Anotações */}
                <TabsContent value="historico" className="m-0 h-full p-4">
                  <LeadHistoricoAnotacoesSection 
                    leadId={leadId} 
                    phoneE164={lead?.phone_e164 || editedData.phone_e164}
                    onConversaClick={(conversaId) => setSidebarConversaId(conversaId)}
                  />
                </TabsContent>

                {/* OLD - Documentação e Prontuário - Admin, Líderes e Gestores de Contratos */}
                {canViewOld && <TabsContent value="old" className="m-0 h-full">
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-6">
                      {medicoVinculado?.id ? (
                        <>
                          <ProntuarioTab medicoId={medicoVinculado.id} />
                          <DocumentacaoTab medicoId={medicoVinculado.id} leadId={leadId} />
                        </>
                      ) : (
                        <DocumentacaoTab medicoId="" leadId={leadId} />
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>}

                {/* Conversão */}
                <TabsContent value="conversao" className="m-0 h-full">
                  <ScrollArea className="h-full p-4">
                    <div className="space-y-6">
                      {/* Blacklist Status */}
                      <BlacklistSection 
                        phoneE164={editedData.phone_e164} 
                        nome={editedData.nome}
                        origem={medicoVinculado ? 'clinico' : 'lead'}
                      />

                      {/* Bloqueio Temporário de Disparos */}
                      <BloqueioTemporarioSection
                        leadId={leadId}
                        nome={editedData.nome}
                      />

                      {/* Show approval section for Corpo Médico when on medicos page and already converted (check status OR medicoVinculado) */}
                      {isOnMedicosPage && (medicoVinculado || lead?.status === 'Convertido') ? (
                        <>
                          {medicoVinculado?.data_aprovacao_corpo_medico ? (
                            <>
                              <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-6 text-center">
                                <Award className="h-12 w-12 text-green-600 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-green-600 mb-2">
                                  Corpo Clínico Ativo
                                </h3>
                                <p className="text-muted-foreground mb-4 text-sm">
                                  Este médico foi aprovado e faz parte do Corpo Clínico.
                                </p>
                                <div className="text-sm text-muted-foreground">
                                  Aprovado em: {format(new Date(medicoVinculado.data_aprovacao_corpo_medico), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </div>
                              </div>

                              {/* Seção de Reprocessar Médico - criar novo card no Kanban */}
                              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                  <Activity className="h-8 w-8 text-blue-600" />
                                  <div>
                                    <h3 className="text-lg font-semibold text-blue-700">
                                      Reprocessar Médico
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                      Adicione este médico ao Kanban para um novo contrato/processo, mantendo-o no Corpo Clínico.
                                    </p>
                                  </div>
                                </div>

                                {!showReprocessamentoForm ? (
                                  <Button 
                                    variant="outline"
                                    onClick={() => setShowReprocessamentoForm(true)}
                                    className="gap-2 border-blue-500/50 text-blue-700 hover:bg-blue-500/10"
                                  >
                                    <Activity className="h-4 w-4" />
                                    Reprocessar no Kanban
                                  </Button>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                      <div className="flex items-start gap-2 mb-3">
                                        <Stethoscope className="h-5 w-5 text-blue-600 mt-0.5" />
                                        <div>
                                          <p className="text-sm font-medium text-blue-700">Novo Processo</p>
                                          <p className="text-xs text-blue-600">
                                            O médico continuará no Corpo Clínico e será adicionado ao Kanban para participar de um novo processo (ex: novo contrato, nova unidade).
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-sm font-medium text-foreground mb-2 block">
                                        Motivo do reprocessamento <span className="text-red-500">*</span>
                                      </label>
                                      <textarea
                                        value={motivoReprocessamento}
                                        onChange={(e) => setMotivoReprocessamento(e.target.value)}
                                        placeholder="Descreva o motivo pelo qual este médico está sendo reprocessado (ex: novo contrato para hospital X, quer trabalhar sábados e domingos, etc.)"
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                                      />
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button 
                                        variant="outline"
                                        onClick={() => {
                                          setShowReprocessamentoForm(false);
                                          setMotivoReprocessamento('');
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button 
                                        onClick={() => reprocessarMedicoMutation.mutate()}
                                        disabled={reprocessarMedicoMutation.isPending || !motivoReprocessamento.trim()}
                                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                                      >
                                        <Activity className="h-4 w-4" />
                                        {reprocessarMedicoMutation.isPending ? 'Processando...' : 'Confirmar Reprocessamento'}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Seção de Desconverter do Corpo Clínico */}
                              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                  <Undo2 className="h-8 w-8 text-amber-600" />
                                  <div>
                                    <h3 className="text-lg font-semibold text-amber-700">
                                      Desconverter para Lead
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                      Remova este médico do Corpo Clínico e volte-o para o status de Lead.
                                    </p>
                                  </div>
                                </div>

                                {!showDesconversaoCorpoForm ? (
                                  <Button 
                                    variant="outline"
                                    onClick={() => setShowDesconversaoCorpoForm(true)}
                                    className="gap-2 border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
                                  >
                                    <Undo2 className="h-4 w-4" />
                                    Desconverter para Lead
                                  </Button>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                      <div className="flex items-start gap-2 mb-3">
                                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                                        <div>
                                          <p className="text-sm font-medium text-amber-700">Atenção</p>
                                          <p className="text-xs text-amber-600">
                                            Esta ação irá remover o médico do Corpo Clínico, desvincular o registro e mover o lead para "Acompanhamento". O histórico será mantido.
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-sm font-medium text-foreground mb-2 block">
                                        Motivo da desconversão <span className="text-red-500">*</span>
                                      </label>
                                      <textarea
                                        value={motivoDesconversaoCorpo}
                                        onChange={(e) => setMotivoDesconversaoCorpo(e.target.value)}
                                        placeholder="Descreva o motivo pelo qual este médico está sendo removido do Corpo Clínico (ex: encerrou contrato, mudou de cidade, não atende mais requisitos, etc.)"
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                                      />
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button 
                                        variant="outline"
                                        onClick={() => {
                                          setShowDesconversaoCorpoForm(false);
                                          setMotivoDesconversaoCorpo('');
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button 
                                        variant="destructive"
                                        onClick={() => desconversaoCorpoClinicoMutation.mutate()}
                                        disabled={desconversaoCorpoClinicoMutation.isPending || !motivoDesconversaoCorpo.trim()}
                                        className="gap-2"
                                      >
                                        <Undo2 className="h-4 w-4" />
                                        {desconversaoCorpoClinicoMutation.isPending ? 'Processando...' : 'Confirmar Desconversão'}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="rounded-lg border p-6">
                              <div className="flex items-center gap-3 mb-4">
                                <ClipboardCheck className="h-8 w-8 text-primary" />
                                <div>
                                  <h3 className="text-lg font-semibold">
                                    Aprovar para Corpo Clínico
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    Confirme os itens abaixo para mover este médico para a aba Corpo Clínico
                                  </p>
                                </div>
                              </div>
                              
                              <div className="space-y-4 mb-6">
                                {/* Status dropdown */}
                                <div className="p-3 rounded-lg border bg-muted/30">
                                  <label className="text-sm font-medium flex items-center gap-2 mb-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    Status do Médico
                                  </label>
                                  <select
                                    value={statusMedico}
                                    onChange={(e) => {
                                      setStatusMedico(e.target.value);
                                      setHasApprovalChanges(true);
                                    }}
                                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                                  >
                                    <option value="Ativo">Ativo</option>
                                    <option value="Inativo">Inativo</option>
                                    <option value="Suspenso">Suspenso</option>
                                  </select>
                                </div>

                                <div className="flex items-center space-x-3 p-3 rounded-lg border bg-muted/30">
                                  <Checkbox 
                                    id="contrato" 
                                    checked={aprovacaoContrato}
                                    onCheckedChange={(checked) => handleApprovalChange('contrato', !!checked)}
                                  />
                                  <label htmlFor="contrato" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                    <FileSignature className="h-4 w-4 text-muted-foreground" />
                                    Contrato Assinado
                                  </label>
                                </div>
                                
                                <div className="flex items-center space-x-3 p-3 rounded-lg border bg-muted/30">
                                  <Checkbox 
                                    id="documentacao" 
                                    checked={aprovacaoDocumentacao}
                                    onCheckedChange={(checked) => handleApprovalChange('documentacao', !!checked)}
                                  />
                                  <label htmlFor="documentacao" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    Documentação com Unidade Completa
                                  </label>
                                </div>
                                
                                <div className="flex items-center space-x-3 p-3 rounded-lg border bg-muted/30">
                                  <Checkbox 
                                    id="cadastro" 
                                    checked={aprovacaoCadastro}
                                    onCheckedChange={(checked) => handleApprovalChange('cadastro', !!checked)}
                                  />
                                  <label htmlFor="cadastro" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                                    Cadastro Aprovado pela Unidade
                                  </label>
                                </div>
                              </div>

                              {/* Campo de motivo - aparece quando todas aprovações estão marcadas */}
                              {aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro && (
                                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-3">
                                  <p className="text-sm text-green-600 flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Ao salvar, o médico será movido para a aba Corpo Clínico!
                                  </p>
                                  <div>
                                    <label className="text-sm font-medium text-foreground mb-2 block">
                                      Motivo da aprovação <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                      value={motivoAprovacao}
                                      onChange={(e) => {
                                        setMotivoAprovacao(e.target.value);
                                        setHasApprovalChanges(true);
                                      }}
                                      placeholder="Descreva o motivo da aprovação para Corpo Clínico (ex: documentação completa, contrato assinado, aprovado pela unidade X, etc.)"
                                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2 justify-end">
                                <Button 
                                  onClick={() => saveApprovalMutation.mutate()}
                                  disabled={
                                    saveApprovalMutation.isPending || 
                                    !hasApprovalChanges ||
                                    (aprovacaoContrato && aprovacaoDocumentacao && aprovacaoCadastro && !motivoAprovacao.trim())
                                  }
                                  className="gap-2"
                                >
                                  <Save className="h-4 w-4" />
                                  {saveApprovalMutation.isPending ? 'Salvando...' : 'Salvar Aprovações'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : medicoVinculado ? (
                        <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-6 text-center">
                          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-green-600 mb-2">
                            Lead Convertido com Sucesso!
                          </h3>
                          <p className="text-muted-foreground mb-4 text-sm">
                            Este lead foi convertido para médico e agora faz parte do processo de documentação.
                          </p>
                          <Button onClick={handleGoToMedico} className="gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Ver Cadastro do Médico
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-lg border p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <UserCheck className="h-8 w-8 text-primary" />
                            <div>
                              <h3 className="text-lg font-semibold">
                                Converter Lead em Médico
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Verifique os campos obrigatórios antes de converter este lead em médico.
                              </p>
                            </div>
                          </div>

                          {/* Checklist de campos obrigatórios para conversão */}
                          {(() => {
                            const nome = editedData.nome?.trim() || lead?.nome?.trim();
                            const cpf = editedData.cpf?.trim() || lead?.cpf?.trim();
                            const telefone = editedData.phone_e164?.trim() || lead?.phone_e164?.trim();
                            const email = editedData.email?.trim() || lead?.email?.trim();
                            const unidadesVinculadas = editedData.unidades_vinculadas || lead?.unidades_vinculadas || [];
                            const modalidade = editedData.modalidade_contrato?.trim() || lead?.modalidade_contrato?.trim();
                            const temProposta = propostas && propostas.length > 0;
                            
                            // Campos opcionais (se tiver)
                            const cnpj = editedData.cnpj?.trim() || lead?.cnpj?.trim();
                            const crm = editedData.crm?.trim() || lead?.crm?.trim();
                            const rqe = editedData.rqe?.trim() || lead?.rqe?.trim();
                            const especialidade = editedData.especialidade?.trim() || lead?.especialidade?.trim() || (editedData.especialidades?.length > 0) || (lead?.especialidades?.length > 0);
                            
                            // Verifica campos obrigatórios
                            const camposObrigatorios = [
                              { campo: 'Nome', preenchido: !!nome, valor: nome },
                              { campo: 'CPF', preenchido: !!cpf, valor: cpf },
                              { campo: 'Telefone', preenchido: !!telefone, valor: telefone },
                              { campo: 'E-mail', preenchido: !!email, valor: email },
                              { campo: 'Local de atuação (Unidades)', preenchido: unidadesVinculadas.length > 0, valor: unidadesVinculadas.length > 0 ? `${unidadesVinculadas.length} unidade(s)` : null },
                              { campo: 'Modalidade de contrato', preenchido: !!modalidade, valor: modalidade },
                              { campo: 'Proposta Vinculada', preenchido: !!temProposta, valor: temProposta ? `${propostas.length} proposta(s)` : null },
                            ];
                            
                            // Campos opcionais
                            const camposOpcionais = [
                              { campo: 'CNPJ', preenchido: !!cnpj, valor: cnpj },
                              { campo: 'CRM', preenchido: !!crm, valor: crm },
                              { campo: 'RQE', preenchido: !!rqe, valor: rqe },
                              { campo: 'Especialidade', preenchido: !!especialidade, valor: especialidade === true ? 'Informado' : especialidade },
                            ];
                            
                            const todosObrigatoriosPreenchidos = camposObrigatorios.every(c => c.preenchido);
                            
                            // Proposta de disparo mais recente (não vinculada ainda a este lead)
                            const propostaDisparoRecente = disparosRecentes?.find(
                              d => d.propostaDetalhes && d.propostaDetalhes.lead_id !== leadId
                            );
                            
                            return (
                              <div className="space-y-4 mb-6">
                                {/* Campos Obrigatórios */}
                                <div className="space-y-2">
                                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <ClipboardCheck className="h-4 w-4" />
                                    Campos Obrigatórios
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {camposObrigatorios.map((item) => {
                                      // Tratamento especial para Proposta Vinculada
                                      if (item.campo === 'Proposta Vinculada' && !item.preenchido && propostaDisparoRecente) {
                                        const proposta = propostaDisparoRecente.propostaDetalhes;
                                        return (
                                          <div 
                                            key={item.campo}
                                            className="col-span-full flex flex-col gap-2 p-3 rounded-md border bg-amber-500/10 border-amber-500/30"
                                          >
                                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                              <Send className="h-4 w-4 flex-shrink-0" />
                                              <span className="font-medium text-sm">Proposta Vinculada:</span>
                                              <span className="text-xs opacity-80">Disparo identificado!</span>
                                            </div>
                                            <div className="ml-6 p-2 rounded bg-background/50 border text-sm">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="space-y-1">
                                                  <p className="font-medium text-foreground">
                                                    {proposta?.nome || proposta?.descricao || 'Proposta de Disparo'}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground">
                                                    {proposta?.contrato?.cliente?.nome_empresa} - {proposta?.contrato?.codigo_contrato}
                                                    {proposta?.unidade && ` | ${proposta.unidade.nome}`}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground">
                                                    Enviado em: {propostaDisparoRecente.data_envio 
                                                      ? format(new Date(propostaDisparoRecente.data_envio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                                      : 'N/A'}
                                                  </p>
                                                </div>
                                                <Button
                                                  size="sm"
                                                  onClick={() => vincularPropostaDisparoMutation.mutate(proposta.id)}
                                                  disabled={vincularPropostaDisparoMutation.isPending}
                                                  className="shrink-0"
                                                >
                                                  {vincularPropostaDisparoMutation.isPending ? 'Vinculando...' : 'Vincular Proposta'}
                                                </Button>
                                              </div>
                                            </div>
                                            <p className="ml-6 text-xs text-muted-foreground">
                                              Ou vincule manualmente na aba "Propostas"
                                            </p>
                                          </div>
                                        );
                                      }
                                      
                                      return (
                                        <div 
                                          key={item.campo}
                                          className={`flex items-center gap-2 p-2 rounded-md border text-sm ${
                                            item.preenchido 
                                              ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400' 
                                              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'
                                          }`}
                                        >
                                          {item.preenchido ? (
                                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                          ) : (
                                            <XCircle className="h-4 w-4 flex-shrink-0" />
                                          )}
                                          <span className="font-medium">{item.campo}:</span>
                                          <span className="truncate text-xs opacity-80">
                                            {item.preenchido ? item.valor : 'Não informado'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                
                                {/* Campos Opcionais */}
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Campos Opcionais (se tiver)
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {camposOpcionais.map((item) => (
                                      <div 
                                        key={item.campo}
                                        className={`flex items-center gap-2 p-2 rounded-md border text-xs ${
                                          item.preenchido 
                                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400' 
                                            : 'bg-muted/30 border-muted text-muted-foreground'
                                        }`}
                                      >
                                        {item.preenchido ? (
                                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                                        ) : (
                                          <span className="h-3 w-3 flex-shrink-0 rounded-full border border-current" />
                                        )}
                                        <span className="font-medium">{item.campo}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                
                                {/* Checkbox de confirmação final */}
                                {todosObrigatoriosPreenchidos && (
                                  <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
                                    <div className="flex items-center space-x-3">
                                      <Checkbox 
                                        id="check-confirmacao-final" 
                                        checked={checkLeadDadosCompletos && checkLeadDocumentosVerificados && checkLeadPropostaAceita}
                                        onCheckedChange={(checked) => {
                                          setCheckLeadDadosCompletos(!!checked);
                                          setCheckLeadDocumentosVerificados(!!checked);
                                          setCheckLeadPropostaAceita(!!checked);
                                        }}
                                      />
                                      <label htmlFor="check-confirmacao-final" className="text-sm font-medium cursor-pointer">
                                        Confirmo que verifiquei todos os dados e documentos estão corretos para conversão
                                      </label>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Mensagem de campos faltando */}
                                {!todosObrigatoriosPreenchidos && (
                                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                    <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4" />
                                      Preencha todos os campos obrigatórios na aba "Dados Pessoais" antes de converter.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Área de conversão - só aparece quando todos checks estão marcados */}
                          {checkLeadDadosCompletos && checkLeadDocumentosVerificados && checkLeadPropostaAceita ? (
                            !showConversaoForm ? (
                              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                                <p className="text-sm text-green-600 flex items-center gap-2 mb-3">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Todos os requisitos foram verificados. Você pode converter agora.
                                </p>
                                <Button 
                                  onClick={() => setShowConversaoForm(true)}
                                  className="gap-2"
                                >
                                  <ArrowRight className="h-4 w-4" />
                                  Converter em Médico
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium text-foreground mb-2 block">
                                      Canal de Conversão <span className="text-red-500">*</span>
                                    </label>
                                    <Select value={canalConversao} onValueChange={setCanalConversao}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecione o canal..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="INDICACAO">INDICAÇÃO</SelectItem>
                                        <SelectItem value="WHATSAPP">WHATSAPP</SelectItem>
                                        <SelectItem value="EMAIL">EMAIL</SelectItem>
                                        <SelectItem value="TRAFEGO-PAGO">TRÁFEGO PAGO</SelectItem>
                                        <SelectItem value="LISTA-CAPTADORA">LISTA CAPTADORA</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Como o lead foi efetivamente captado/respondeu
                                    </p>
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="text-sm font-medium text-foreground mb-2 block">
                                    Motivo da conversão <span className="text-red-500">*</span>
                                  </label>
                                  <textarea
                                    value={motivoConversao}
                                    onChange={(e) => setMotivoConversao(e.target.value)}
                                    placeholder="Descreva o motivo pelo qual este lead está sendo convertido em médico (ex: profissional aceito para vaga X, interesse confirmado, documentação OK, etc.)"
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                                  />
                                </div>

                                <div className="flex gap-2 justify-end">
                                  <Button 
                                    variant="outline"
                                    onClick={() => {
                                      setShowConversaoForm(false);
                                      setMotivoConversao('');
                                      setCanalConversao('');
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button 
                                    onClick={() => convertToMedicoMutation.mutate()}
                                    disabled={convertToMedicoMutation.isPending || !motivoConversao.trim() || !canalConversao}
                                    className="gap-2"
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                    {convertToMedicoMutation.isPending ? 'Convertendo...' : 'Confirmar Conversão'}
                                  </Button>
                                </div>
                              </div>
                            )
                          ) : (
                            <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Marque todos os itens acima para habilitar a conversão.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {lead?.data_conversao && (
                        <div className="rounded-lg border p-4">
                          <h4 className="font-medium mb-2 text-sm">Informações da Conversão</h4>
                          <div className="text-sm text-muted-foreground">
                            Data: {format(new Date(lead.data_conversao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                      )}

                      {/* Seção de Desconversão - aparece quando há médico vinculado e não está no corpo clínico (no Kanban ou Acompanhamento) */}
                      {medicoVinculado && !medicoVinculado.data_aprovacao_corpo_medico && (isOnMedicosPage || isOnAcompanhamentoPage) && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <Undo2 className="h-8 w-8 text-amber-600" />
                            <div>
                              <h3 className="text-lg font-semibold text-amber-700">
                                Voltar a ser Lead
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Se o médico desistiu, não tem documentação ou não irá prosseguir, você pode reverter para lead.
                              </p>
                            </div>
                          </div>

                          {!showDesconversaoForm ? (
                            <Button 
                              variant="outline"
                              onClick={() => setShowDesconversaoForm(true)}
                              className="gap-2 border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
                            >
                              <Undo2 className="h-4 w-4" />
                              Desconverter para Lead
                            </Button>
                          ) : (
                            <div className="space-y-4">
                              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <div className="flex items-start gap-2 mb-3">
                                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-amber-700">Atenção</p>
                                    <p className="text-xs text-amber-600">
                                      Esta ação irá remover o vínculo com o médico e o card do Kanban será excluído.
                                      O histórico será mantido.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium text-foreground mb-2 block">
                                  Motivo da desconversão <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                  value={motivoDesconversao}
                                  onChange={(e) => setMotivoDesconversao(e.target.value)}
                                  placeholder="Descreva o motivo pelo qual este médico está sendo revertido para lead (ex: desistiu, falta de documentação, não respondeu, etc.)"
                                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                                />
                              </div>

                              <div className="flex gap-2 justify-end">
                                <Button 
                                  variant="outline"
                                  onClick={() => {
                                    setShowDesconversaoForm(false);
                                    setMotivoDesconversao('');
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button 
                                  variant="destructive"
                                  onClick={() => desconversaoMutation.mutate()}
                                  disabled={desconversaoMutation.isPending || !motivoDesconversao.trim()}
                                  className="gap-2"
                                >
                                  <Undo2 className="h-4 w-4" />
                                  {desconversaoMutation.isPending ? 'Processando...' : 'Confirmar Desconversão'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Seção de Descarte - aparece no Kanban ou Acompanhamento para leads não descartados (exceto se já no corpo clínico) */}
                      {(isOnMedicosPage || isOnAcompanhamentoPage) && !isNewLead && lead?.status !== 'Descartado' && (!medicoVinculado?.data_aprovacao_corpo_medico) && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <XCircle className="h-8 w-8 text-red-600" />
                            <div>
                              <h3 className="text-lg font-semibold text-red-700">
                                Descartar Lead
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {medicoVinculado 
                                  ? 'O vínculo com o médico será removido e o lead voltará para o banco de leads com status "Descartado".'
                                  : 'Se este lead não tem interesse, não respondeu ou não é viável, você pode descartá-lo do funil.'}
                              </p>
                            </div>
                          </div>

                          {!showDescarteForm ? (
                            <Button 
                              variant="outline"
                              onClick={() => setShowDescarteForm(true)}
                              className="gap-2 border-red-500/50 text-red-700 hover:bg-red-500/10"
                            >
                              <XCircle className="h-4 w-4" />
                              Descartar Lead
                            </Button>
                          ) : (
                            <div className="space-y-4">
                              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                                <div className="flex items-start gap-2 mb-3">
                                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-red-700">Atenção</p>
                                    <p className="text-xs text-red-600">
                                      {medicoVinculado 
                                        ? 'O vínculo com médico será removido, o card do Kanban será excluído e o lead será marcado como "Descartado".'
                                        : 'O lead será movido para a coluna "Descartados". O histórico será mantido.'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium text-foreground mb-2 block">
                                  Motivo do descarte <span className="text-red-500">*</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    (mínimo 60 caracteres)
                                  </span>
                                </label>
                                <textarea
                                  value={motivoDescarte}
                                  onChange={(e) => setMotivoDescarte(e.target.value)}
                                  placeholder="Descreva detalhadamente o motivo pelo qual este lead está sendo descartado (ex: não atende aos requisitos, não respondeu após múltiplas tentativas, desistiu do processo, etc.)"
                                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]"
                                />
                                <div className="flex justify-between mt-1">
                                  <span className={`text-xs ${motivoDescarte.length < 60 ? 'text-red-500' : 'text-green-600'}`}>
                                    {motivoDescarte.length}/60 caracteres mínimos
                                  </span>
                                  {motivoDescarte.length >= 60 && (
                                    <span className="text-xs text-green-600">✓ Requisito atendido</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <Button 
                                  variant="outline"
                                  onClick={() => {
                                    setShowDescarteForm(false);
                                    setMotivoDescarte('');
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button 
                                  variant="destructive"
                                  onClick={() => descartarLeadMutation.mutate()}
                                  disabled={descartarLeadMutation.isPending || motivoDescarte.trim().length < 60}
                                  className="gap-2"
                                >
                                  <XCircle className="h-4 w-4" />
                                  {descartarLeadMutation.isPending ? 'Processando...' : 'Confirmar Descarte'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Lead já descartado */}
                      {lead?.status === 'Descartado' && (
                        <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-6 text-center">
                          <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-red-600 mb-2">
                            Lead Descartado
                          </h3>
                          <p className="text-muted-foreground text-sm">
                            Este lead foi descartado do funil de captação.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Atividades Tab */}
                <TabsContent value="atividades" className="m-0 h-full overflow-hidden">
                  <div className="h-full">
                    {leadId && <LeadAtividadesPanel leadId={leadId} onClose={() => {}} embedded />}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Channels Sidebar - WhatsApp / Instagram / LinkedIn */}
          <div className="w-[380px] flex-shrink-0 border-l bg-muted/20 flex flex-col">
            {leadId && <LeadChannelsSidebar leadId={leadId} activeConversaIdOverride={sidebarConversaId} />}
          </div>
        </div>
      </DialogContent>

      {/* Import Dialog */}
      <ImportarLeadTextoDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={(data) => {
          // Merge imported data with current editedData
          const newData = { ...editedData };
          
          if (data.nome) newData.nome = data.nome;
          if (data.cpf) newData.cpf = data.cpf;
          if (data.data_nascimento) newData.data_nascimento = data.data_nascimento;
          if (data.crm) newData.crm = data.crm;
          if (data.rqe) newData.rqe = data.rqe;
          if (data.especialidade) newData.especialidade = data.especialidade;
          if (data.telefone) newData.phone_e164 = normalizeToE164(data.telefone);
          if (data.email) newData.email = data.email;
          if (data.endereco) newData.endereco = data.endereco;
          if (data.cep) newData.cep = data.cep;
          if (data.rg) newData.rg = data.rg;
          if (data.nacionalidade) newData.nacionalidade = data.nacionalidade;
          if (data.naturalidade) newData.naturalidade = data.naturalidade;
          if (data.estado_civil) newData.estado_civil = data.estado_civil;
          if (data.cnpj) newData.cnpj = data.cnpj;
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

    <RegiaoInteresseDialog
      open={showRegiaoInteresse}
      onOpenChange={setShowRegiaoInteresse}
      leadId={lead?.id}
      onAfterNavigate={() => onOpenChange(false)}
    />
    </>
  );
}
