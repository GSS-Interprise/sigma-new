import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/components/ui/markdown-textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Calendar, 
  DollarSign, 
  MapPin, 
  User, 
  FileText, 
  Edit2,
  Send,
  Clock,
  AlertTriangle,
  Building2,
  Tag,
  X,
  Plus,
  Check,
  Save,
  Trash2,
  FileSignature,
  CheckCircle2,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { LicitacaoAnexosBar } from "./LicitacaoAnexosBar";
import { LicitacaoComentarioAvancadoInput } from "./LicitacaoComentarioAvancadoInput";
import { LicitacaoAtividadeItem } from "./LicitacaoAtividadeItem";
import { LicitacaoRiscoIndicator } from "./LicitacaoRiscoIndicator";
import { LicitacaoResultadoItensDialog } from "./LicitacaoResultadoItensDialog";
import { LicitacaoCompetitividadeViewDialog } from "./LicitacaoCompetitividadeViewDialog";
import { LicitacaoDescarteDialog } from "./LicitacaoDescarteDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useLicitacoesProfiles } from "@/hooks/useLicitacoesProfiles";
import { useLicitacaoAutoSave } from "@/hooks/useLicitacaoAutoSave";
import { useLicitacaoRealtimeSync } from "@/hooks/useLicitacaoRealtimeSync";
import { useLicitacaoEditLock } from "@/hooks/useLicitacaoEditLock";
import { LicitacaoLockBadge } from "./LicitacaoLockBadge";
import { toLocalTime } from "@/lib/dateUtils";
import { LicitacaoField, getFieldsOrder, saveFieldsOrder, FieldConfig } from "./LicitacaoFieldsConfig";
import { 
  useLayoutEditor, 
  LayoutEditorControls, 
  DraggableItem, 
  DropZone,
  getLayoutConfig
} from "./LayoutEditor";

// Status que requerem resultado obrigatório (Inteligência Competitiva)
const STATUS_REQUER_RESULTADO = ['nao_ganhamos'];
// Status que requer modal de descarte
const STATUS_DESCARTE = 'descarte_edital';

interface LicitacaoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacao: any;
  onEdit?: () => void;
  onSuccess?: () => void;
  isNew?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  captacao_edital: "bg-blue-500",
  capitacao_de_credenciamento: "bg-blue-400",
  edital_analise: "bg-purple-500",
  conferencia: "bg-green-400",
  deliberacao: "bg-yellow-500",
  esclarecimentos_impugnacao: "bg-orange-500",
  cadastro_proposta: "bg-cyan-500",
  aguardando_sessao: "bg-indigo-500",
  em_disputa: "bg-red-500",
  proposta_final: "bg-pink-500",
  recurso_contrarrazao: "bg-amber-500",
  adjudicacao_homologacao: "bg-emerald-500",
  arrematados: "bg-green-500",
  descarte_edital: "bg-gray-500",
  suspenso_revogado: "bg-rose-500",
  nao_ganhamos: "bg-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  captacao_edital: "Captação de edital",
  capitacao_de_credenciamento: "Captação de Credenciamento",
  edital_analise: "Edital em análise",
  conferencia: "Conferência",
  deliberacao: "Deliberação",
  esclarecimentos_impugnacao: "Esclarecimentos/Impugnação",
  cadastro_proposta: "Cadastro de proposta",
  aguardando_sessao: "Aguardando sessão",
  em_disputa: "Em disputa",
  proposta_final: "Proposta final",
  recurso_contrarrazao: "Recurso/Contrarrazão",
  adjudicacao_homologacao: "Adjudicação/Homologação",
  arrematados: "Arrematados",
  descarte_edital: "Descarte de edital",
  suspenso_revogado: "Suspensos/Revogados",
  nao_ganhamos: "Não ganhamos",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

import { EtiquetasDropdown, TAG_COLORS as DROPDOWN_COLORS, TagConfig } from "./EtiquetasDropdown";
// linkifyText e linkifyHtml importados de @/lib/linkify
import { linkifyText, linkifyHtml } from "@/lib/linkify";

// DEFAULT_TAGS removido - agora vem do banco de dados

const getTagBgColor = (tagName: string, tagsConfig: TagConfig[]) => {
  const tag = tagsConfig.find(t => t.name === tagName);
  const colorId = tag?.colorId || "gray";
  const colorMap: Record<string, string> = {
    blue: "bg-blue-600",
    teal: "bg-teal-600",
    green: "bg-green-600",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
    pink: "bg-pink-500",
    purple: "bg-purple-600",
    gray: "bg-gray-500",
    stone: "bg-stone-400",
    black: "bg-black",
  };
  return colorMap[colorId] || "bg-gray-500";
};

export function LicitacaoDetailDialog({ 
  open, 
  onOpenChange, 
  licitacao,
  onEdit,
  onSuccess,
  isNew = false
}: LicitacaoDetailDialogProps) {
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [fieldsOrder, setFieldsOrder] = useState<FieldConfig[]>(getFieldsOrder());

  // Buscar etiquetas do banco de dados
  const { data: tagsConfigFromDb = [] } = useQuery({
    queryKey: ["licitacoes-etiquetas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes_etiquetas_config")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data.map((tag: any) => ({
        name: tag.nome,
        colorId: tag.cor_id,
      })) as TagConfig[];
    },
  });

  const tagsConfig = tagsConfigFromDb;
  const [activeTab, setActiveTab] = useState("detalhes");
  const [servicos, setServicos] = useState<{ id: string; nome: string; valor: number }[]>([]);
  const [novoServico, setNovoServico] = useState("");
  const [objetoContrato, setObjetoContrato] = useState("");
  const [checkConversao1, setCheckConversao1] = useState(false);
  const [checkConversao2, setCheckConversao2] = useState(false);
  const [checkConversao3, setCheckConversao3] = useState(false);
  
  // Estado para controle do dialog de resultado
  const [resultadoDialogOpen, setResultadoDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const [pendingManualSaveSnapshot, setPendingManualSaveSnapshot] = useState<any | null>(null);
  const [competitividadeViewOpen, setCompetitividadeViewOpen] = useState(false);
  const [salvandoConversao, setSalvandoConversao] = useState(false);
  // Estado para controle do dialog de descarte
  const [descarteDialogOpen, setDescarteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isLeader } = usePermissions();
  // Qualquer usuário autenticado pode alterar o tipo de licitação (GSS/AGES)
  const canEditTipoLicitacao = true;
  const isInitialLoadRef = useRef(true);
  const previousDataRef = useRef<any>(null);
  const formDataRef = useRef<any>({}); // Ref para acessar formData no flush sem causar loop

  // Wrapper: mantém o formDataRef sincronizado no MESMO tick do setState
  // (evita salvar "texto cortado" ao fechar o dialog ou clicar em Salvar logo após digitar/colar)
  const setFormDataSafe = useCallback((updater: any) => {
    setFormData((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      formDataRef.current = next;
      return next;
    });
  }, []);

  // Manter um ID estável mesmo se o parent limpar `licitacao` ao fechar o dialog
  const [stableLicitacaoId, setStableLicitacaoId] = useState<string | null>(null);
  // Ref para rastrear o último ID carregado (evita vazamento de dados entre licitações)
  const lastLoadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNew) {
      setStableLicitacaoId(null);
      // Limpar refs ao criar nova licitação
      formDataRef.current = {};
      previousDataRef.current = null;
      lastLoadedIdRef.current = null;
      return;
    }
    if (licitacao?.id) {
      // Se mudou de licitação, LIMPAR as refs para evitar vazamento de dados
      if (lastLoadedIdRef.current && lastLoadedIdRef.current !== licitacao.id) {
        console.log('[LicitacaoDialog] ID mudou, limpando refs:', lastLoadedIdRef.current, '->', licitacao.id);
        formDataRef.current = {};
        previousDataRef.current = null;
      }
      setStableLicitacaoId(licitacao.id);
    }
  }, [isNew, licitacao?.id]);

  // Limpar estado quando o dialog fecha
  useEffect(() => {
    if (!open) {
      // Resetar refs quando fecha o dialog para evitar vazamento na próxima abertura
      formDataRef.current = {};
      previousDataRef.current = null;
      lastLoadedIdRef.current = null;
    }
  }, [open]);

  // Redundância (caso exista algum setFormData legado)
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Salvamento manual (auto-save desativado)
  const { saveNow, isSaving: isAutoSaving, syncUpdatedAt } = useLicitacaoAutoSave(stableLicitacaoId, onSuccess);

  // Realtime sync - sincroniza updated_at automaticamente para evitar falsos conflitos
  const { markAsSavedByMe } = useLicitacaoRealtimeSync(
    stableLicitacaoId,
    open && !isNew,
    {
      onSelfUpdate: (newUpdatedAt) => {
        console.log('[LicitacaoDialog] Self-update synced:', newUpdatedAt);
        syncUpdatedAt(newUpdatedAt);
        if (previousDataRef.current) {
          previousDataRef.current = { ...previousDataRef.current, updated_at: newUpdatedAt };
        }
      },
      onExternalUpdate: (newData) => {
        console.log('[LicitacaoDialog] External update received, syncing token');
        // Sincroniza o token updated_at para evitar falsos conflitos no próximo save
        if (newData?.updated_at) {
          syncUpdatedAt(newData.updated_at);
          if (previousDataRef.current) {
            previousDataRef.current = { ...previousDataRef.current, updated_at: newData.updated_at };
          }
        }
      },
    }
  );

  // Sistema de lock colaborativo - evita conflitos entre usuários editando o mesmo card
  const { 
    hasLock, 
    lockedBy, 
    isLoading: isLoadingLock,
    releaseLock 
  } = useLicitacaoEditLock(stableLicitacaoId, open && !isNew);

  // Liberar lock quando o dialog fecha
  useEffect(() => {
    if (!open && stableLicitacaoId) {
      releaseLock();
    }
  }, [open, stableLicitacaoId, releaseLock]);

  // Determinar se pode editar (tem lock ou é novo)
  const canEdit = isNew || hasLock;

  // Carregar dados de conversão quando a licitação muda
  useEffect(() => {
    if (licitacao && open) {
      const servicosFromDb = Array.isArray(licitacao.servicos_contrato) 
        ? licitacao.servicos_contrato.map((s: any) => ({
            id: s.id || crypto.randomUUID(),
            nome: s.nome || '',
            valor: s.valor || 0
          }))
        : [];
      setServicos(servicosFromDb);
      setObjetoContrato((licitacao as any).objeto_contrato || '');
      setCheckConversao1(licitacao.check_conversao_1 || false);
      setCheckConversao2(licitacao.check_conversao_2 || false);
      setCheckConversao3(licitacao.check_conversao_3 || false);
    }
  }, [licitacao, open]);

  // Salvar dados de conversão automaticamente
  const salvarDadosConversao = async () => {
    if (!licitacao?.id) return;
    
    setSalvandoConversao(true);
    try {
      const nextUpdatedAt = new Date().toISOString();
      const { data: updatedRows, error } = await supabase
        .from('licitacoes')
        .update({
          servicos_contrato: servicos,
          objeto_contrato: objetoContrato,
          check_conversao_1: checkConversao1,
          check_conversao_2: checkConversao2,
          check_conversao_3: checkConversao3,
          updated_at: nextUpdatedAt,
        })
        .eq('id', licitacao.id)
        .select('updated_at');

      if (error) throw error;

      // Usar o updated_at real retornado pelo servidor
      const serverUpdatedAt = updatedRows?.[0]?.updated_at || nextUpdatedAt;

      // Marcar como salvo por mim para o realtime sync reconhecer
      markAsSavedByMe(serverUpdatedAt);
      // Sincroniza updated_at local para evitar falsos conflitos no próximo save
      if (previousDataRef.current) {
        previousDataRef.current = { ...previousDataRef.current, updated_at: serverUpdatedAt };
      }
      syncUpdatedAt(serverUpdatedAt);
      
      queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
      toast.success('Dados de conversão salvos!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSalvandoConversao(false);
    }
  };

  // Funções para gerenciar serviços
  const adicionarServico = () => {
    if (novoServico.trim()) {
      setServicos(prev => [...prev, { id: crypto.randomUUID(), nome: novoServico.trim(), valor: 0 }]);
      setNovoServico("");
    }
  };

  const removerServico = (id: string) => {
    setServicos(prev => prev.filter(s => s.id !== id));
  };

  const atualizarServico = (id: string, field: 'nome' | 'valor', value: string | number) => {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  
  // Layout Editor
  const {
    layoutConfig,
    layoutMode,
    setLayoutMode,
    draggedItem,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    handleConfigChange,
    handleSectionConfigChange,
    saveLayout,
    resetLayout,
    getItemConfig,
    getItemsBySection,
    addCustomField,
    removeCustomField,
    addFieldDialogOpen,
    setAddFieldDialogOpen,
    existingFieldIds,
    AddCustomFieldDialog,
  } = useLayoutEditor();

  useEffect(() => {
    if (licitacao) {
      // Carregar dados customizados do campo dados_customizados
      const dadosCustomizados = licitacao.dados_customizados || {};

      // Verificar se é a MESMA licitação (para decidir se podemos usar refs como fallback)
      const isSameLicitacao = lastLoadedIdRef.current === licitacao.id;

      // Algumas queries (ex: listagens/kanban com select parcial) podem NÃO trazer certas colunas.
      // Nesses casos, o valor vem como `undefined` e não podemos sobrescrever o texto
      // já digitado/carregado no formulário (senão o campo "some" ao salvar/refetch).
      
      // Proteção para campo `objeto`
      const objetoFromProp = (licitacao as any).objeto;
      let safeObjeto: string;
      if (objetoFromProp !== undefined) {
        safeObjeto = objetoFromProp ?? "";
      } else if (isSameLicitacao) {
        safeObjeto = formDataRef.current?.objeto ?? previousDataRef.current?.objeto ?? "";
      } else {
        console.warn('[LicitacaoDialog] objeto undefined para nova licitação:', licitacao.id);
        safeObjeto = "";
      }
      
      // Proteção para campo `observacoes` - mesma lógica do objeto
      // IMPORTANTE: Previne que refetches do Realtime sobrescrevam o que o usuário digitou
      const observacoesFromProp = (licitacao as any).observacoes;
      let safeObservacoes: string;
      if (observacoesFromProp !== undefined) {
        safeObservacoes = observacoesFromProp ?? "";
      } else if (isSameLicitacao) {
        safeObservacoes = formDataRef.current?.observacoes ?? previousDataRef.current?.observacoes ?? "";
      } else {
        console.warn('[LicitacaoDialog] observacoes undefined para nova licitação:', licitacao.id);
        safeObservacoes = "";
      }

      // Proteção para campo `cnpj_orgao` - mesma lógica do objeto/observacoes
      const cnpjOrgaoFromProp = (licitacao as any).cnpj_orgao;
      let safeCnpjOrgao: string;
      if (cnpjOrgaoFromProp !== undefined) {
        safeCnpjOrgao = cnpjOrgaoFromProp ?? "";
      } else if (isSameLicitacao) {
        safeCnpjOrgao = formDataRef.current?.cnpj_orgao ?? previousDataRef.current?.cnpj_orgao ?? "";
      } else {
        safeCnpjOrgao = "";
      }
      
      // Marcar como carregamento inicial para não disparar auto-save
      isInitialLoadRef.current = true;
      
      const initialData = {
        titulo: licitacao.titulo || '',
        numero_edital: licitacao.numero_edital || '',
        orgao: licitacao.orgao || '',
        objeto: safeObjeto,
        status: licitacao.status || 'captacao_edital',
        responsavel_id: licitacao.responsavel_id || '',
        data_disputa: licitacao.data_disputa ? toLocalTime(licitacao.data_disputa) : undefined,
        valor_estimado: licitacao.valor_estimado || '',
        tipo_modalidade: licitacao.tipo_modalidade || '',
        subtipo_modalidade: licitacao.subtipo_modalidade || '',
        municipio_uf: licitacao.municipio_uf || '',
        cnpj_orgao: safeCnpjOrgao,
        etiquetas: licitacao.etiquetas || [],
        observacoes: safeObservacoes,
        tipo_licitacao: licitacao.tipo_licitacao || 'GSS',
        prioridade: licitacao.prioridade || '',
        ...dadosCustomizados, // Incluir campos customizados
      };
      
      setFormData(initialData);
      // Guarda o updated_at do registro para o auto-save conseguir fazer controle de concorrência
      previousDataRef.current = { ...initialData, updated_at: licitacao.updated_at ?? null };
      // Atualizar o ID carregado APÓS popular as refs (evita vazamento entre licitações)
      lastLoadedIdRef.current = licitacao.id;
      // Após o próximo render, permitir auto-save
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    } else if (isNew) {
      isInitialLoadRef.current = true;
      
      setFormData({
        titulo: '',
        numero_edital: '',
        orgao: '',
        objeto: '',
        status: 'captacao_edital',
        responsavel_id: '',
        data_disputa: undefined,
        valor_estimado: '',
        tipo_modalidade: '',
        subtipo_modalidade: '',
        municipio_uf: '',
        etiquetas: [],
        observacoes: '',
        tipo_licitacao: 'GSS',
        prioridade: '',
        cnpj_orgao: '',
      });
      
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    }
  }, [licitacao, isNew]);

  // Abrir já em modo de edição ao abrir o card
  useEffect(() => {
    if (open) setEditando(true);
  }, [open]);

  const { data: profiles } = useLicitacoesProfiles();

  const { data: atividades, isLoading: loadingAtividades } = useQuery({
    queryKey: ["licitacoes-atividades", licitacao?.id],
    queryFn: async () => {
      if (!licitacao?.id) return [];
      
      const { data, error } = await supabase
        .from("licitacoes_atividades")
        .select(`
          *,
          profiles:user_id!left (
            nome_completo
          )
        `)
        .eq("licitacao_id", licitacao.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!licitacao?.id,
  });

  // Query para verificar se existem dados de competitividade
  const { data: itensCompetitividade } = useQuery({
    queryKey: ["licitacao-itens-exists", licitacao?.id],
    queryFn: async () => {
      if (!licitacao?.id) return [];
      const { data, error } = await supabase
        .from("licitacao_itens")
        .select("id")
        .eq("licitacao_id", licitacao.id)
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!licitacao?.id,
  });

  const hasCompetitividadeData = (itensCompetitividade?.length || 0) > 0;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const licitacaoData = {
        ...data,
        fonte: "Manual",
        responsavel_id: userId,
      };

      const { data: newLicitacao, error } = await supabase
        .from('licitacoes')
        .insert([licitacaoData])
        .select()
        .single();

      if (error) throw error;

      // Registrar atividade de criação
      if (newLicitacao && userId) {
        await supabase.from('licitacoes_atividades').insert({
          licitacao_id: newLicitacao.id,
          user_id: userId,
          tipo: 'comentario',
          descricao: 'Licitação criada manualmente',
        });
      }

      // Criar tarefa na worklist
      if (newLicitacao) {
        const dataLimite = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        let prioridade = "media";
        if (data.data_disputa) {
          const diasAteDisputa = Math.ceil(
            (new Date(data.data_disputa).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          prioridade = diasAteDisputa <= 10 ? "alta" : "media";
        }

        await supabase.from("worklist_tarefas").insert({
          modulo: "licitacoes",
          titulo: `Captação de edital – ${data.titulo || data.numero_edital}`,
          descricao: data.titulo,
          status: "captacao_edital",
          prioridade,
          data_limite: dataLimite,
          licitacao_id: newLicitacao.id,
          created_by: userId,
        });
      }

      return newLicitacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      toast.success('Licitação criada com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      // Mensagem amigável baseada no tipo de erro
      const msg = error?.code === '23502' 
        ? 'Campos obrigatórios não preenchidos. Verifique Nº do Edital, Objeto e Órgão.'
        : error?.code === '23505'
        ? 'Já existe uma licitação com esses dados.'
        : error?.message?.includes('null value in column')
        ? 'Campos obrigatórios não preenchidos. Verifique Nº do Edital, Objeto e Órgão.'
        : error?.message || 'Erro ao criar licitação. Verifique os campos e tente novamente.';
      toast.error(msg, { duration: 6000 });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const oldStatus = licitacao?.status;
      const newStatus = data.status;

      // IMPORTANT: usar o updated_at mais recente conhecido pelo dialog (evita falso conflito após você mesmo salvar)
      const expectedUpdatedAt = previousDataRef.current?.updated_at ?? licitacao?.updated_at ?? null;
      const nextUpdatedAt = new Date().toISOString();

      let updateQuery = supabase
        .from('licitacoes')
        .update({ ...data, updated_at: nextUpdatedAt })
        .eq('id', licitacao.id);

      if (expectedUpdatedAt) {
        updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
      } else {
        updateQuery = updateQuery.is('updated_at', null);
      }

      const { data: updatedRows, error } = await updateQuery.select('id, updated_at');
      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        const conflict = new Error('CONCURRENCY_CONFLICT: esta licitação foi alterada por outra pessoa.');
        (conflict as any).code = 'CONCURRENCY_CONFLICT';
        throw conflict;
      }

      const saved = updatedRows[0] as any;

      // Detectar campos alterados e registrar atividades
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const camposParaComparar = ['titulo', 'numero_edital', 'orgao', 'objeto', 'status', 'valor_estimado', 'tipo_modalidade', 'subtipo_modalidade', 'municipio_uf', 'observacoes'];
        const camposAlterados: { campo: string; antigo: any; novo: any }[] = [];

        for (const campo of camposParaComparar) {
          const valorAntigo = licitacao?.[campo];
          const valorNovo = data[campo];

          if (valorAntigo !== valorNovo && (valorAntigo || valorNovo)) {
            camposAlterados.push({
              campo,
              antigo: valorAntigo || '-',
              novo: valorNovo || '-'
            });
          }
        }

        // Registrar cada campo alterado
        for (const alteracao of camposAlterados) {
          await supabase.from('licitacoes_atividades').insert({
            licitacao_id: licitacao.id,
            user_id: user.id,
            tipo: 'campo_atualizado',
            descricao: `Campo "${alteracao.campo}" alterado`,
            campo_alterado: alteracao.campo,
            valor_antigo: String(alteracao.antigo),
            valor_novo: String(alteracao.novo),
          });
        }

        // Se não houver campos alterados individualmente, registrar update genérico
        if (camposAlterados.length === 0) {
          await supabase.from('licitacoes_atividades').insert({
            licitacao_id: licitacao.id,
            user_id: user.id,
            tipo: 'campo_atualizado',
            descricao: 'Registro atualizado',
          });
        }
      }

      // Notificar setor AGES quando tipo_licitacao mudar de GSS para AGES
      const oldTipo = licitacao?.tipo_licitacao;
      const newTipo = data.tipo_licitacao;
      
      if (oldTipo !== 'AGES' && newTipo === 'AGES') {
        try {
          // Buscar todos os usuários com role gestor_ages
          const { data: usersAges } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'gestor_ages');

          if (usersAges && usersAges.length > 0) {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            
            const notificacoes = usersAges
              .filter(u => u.user_id !== currentUser?.id) // Não notificar quem fez a alteração
              .map(u => ({
                user_id: u.user_id,
                tipo: 'licitacao_transferida_ages',
                titulo: '📋 Nova licitação transferida para AGES',
                mensagem: `A licitação "${data.titulo || licitacao?.titulo || data.numero_edital || licitacao?.numero_edital || 'Sem título'}" foi transferida de GSS para AGES`,
                link: `/licitacoes?open=${licitacao.id}`,
                referencia_id: licitacao.id,
                lida: false,
              }));

            if (notificacoes.length > 0) {
              await supabase.from('system_notifications').insert(notificacoes);
            }
          }
        } catch (notifError) {
          console.error('Erro ao criar notificações para AGES:', notifError);
        }
      }

      // ETAPA 2: Criar contrato rascunho automaticamente ao arrematar
      if (newStatus === 'arrematados' && oldStatus !== 'arrematados') {
        // Sanitizar HTML do objeto
        const sanitizeObjeto = (html: string | null | undefined): string => {
          if (!html) return '';
          if (!html.includes('<')) return html;
          const div = document.createElement('div');
          div.innerHTML = html;
          return div.textContent || div.innerText || '';
        };
        const overlayJson = {
          titulo: data.titulo || licitacao.titulo,
          numero_edital: data.numero_edital || licitacao.numero_edital,
          orgao: data.orgao || licitacao.orgao,
          cnpj_orgao: data.cnpj_orgao || (licitacao as any).cnpj_orgao || null,
          objeto: sanitizeObjeto(data.objeto || licitacao.objeto),
          valor_estimado: data.valor_estimado || licitacao.valor_estimado,
          municipio_uf: data.municipio_uf || licitacao.municipio_uf,
          tipo_modalidade: data.tipo_modalidade || licitacao.tipo_modalidade,
          subtipo_modalidade: data.subtipo_modalidade || licitacao.subtipo_modalidade,
          data_disputa: data.data_disputa || licitacao.data_disputa,
          etiquetas: data.etiquetas || licitacao.etiquetas || [],
          observacoes: data.observacoes || licitacao.observacoes,
          licitacao_id: licitacao.id,
        };

        // Capturar serviços da licitação para o rascunho
        const servicosJson = data.servicos_contrato || licitacao.servicos_contrato || [];

        // Verificar se já existe rascunho
        const { data: existente } = await supabase
          .from('contrato_rascunho')
          .select('id')
          .eq('licitacao_id', licitacao.id)
          .eq('status', 'rascunho')
          .maybeSingle();

        if (existente) {
          // Atualizar rascunho existente (idempotência)
          await supabase
            .from('contrato_rascunho')
            .update({
              overlay_json: overlayJson,
              servicos_json: servicosJson,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existente.id);
        } else {
          const { data: novoRascunho } = await supabase
            .from('contrato_rascunho')
            .insert({
              licitacao_id: licitacao.id,
              overlay_json: overlayJson,
              servicos_json: servicosJson,
              status: 'rascunho',
              status_kanban: 'prospectar',
              created_by: user?.id,
            })
            .select()
            .single();

          if (novoRascunho) {
            // Copiar anexos da licitação
            const { data: anexosLicitacao } = await supabase.storage
              .from('licitacoes-anexos')
              .list(licitacao.id);

            if (anexosLicitacao && anexosLicitacao.length > 0) {
              const anexosParaInserir = anexosLicitacao.map(arquivo => ({
                contrato_rascunho_id: novoRascunho.id,
                arquivo_url: `${licitacao.id}/${arquivo.name}`,
                arquivo_nome: arquivo.name,
                arquivo_path: `licitacoes-anexos/${licitacao.id}/${arquivo.name}`,
                mime_type: arquivo.metadata?.mimetype || null,
                origem: 'licitacao_card',
                uploaded_by: user?.id,
              }));

              await supabase
                .from('contrato_rascunho_anexos')
                .insert(anexosParaInserir);
            }
          }
        }
      }

      return { updated_at: (saved?.updated_at as string) ?? nextUpdatedAt };
    },
    onSuccess: (result: any) => {
      if (result?.updated_at) {
        // Mantém o ETag (updated_at) do dialog e do auto-save sincronizados
        previousDataRef.current = { ...(formDataRef.current || {}), updated_at: result.updated_at };
        syncUpdatedAt(result.updated_at);
      }
      queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes-atividades'] });
      queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
      setEditando(false);
      
      if (formData.status === 'arrematados' && licitacao?.status !== 'arrematados') {
        toast.success('Licitação arrematada! Contrato rascunho criado automaticamente.');
      } else {
        toast.success('Licitação atualizada com sucesso');
      }
      onSuccess?.();
    },
    onError: (error: any) => {
      const isConflict =
        error?.code === 'CONCURRENCY_CONFLICT' ||
        String(error?.message || '').includes('CONCURRENCY_CONFLICT');

      if (isConflict) {
        toast.warning('Outra pessoa atualizou esta licitação. Recarregue e tente novamente.');
        queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
        queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
        return;
      }

      toast.error(error.message || 'Erro ao atualizar licitação');
    },
  });

  const adicionarComentarioMutation = useMutation({
    mutationFn: async (dados: {
      texto: string;
      mencionadosIds: string[];
      isCritico: boolean;
      respostaEsperadaAte: Date | null;
      responsavelRespostaId: string | null;
      setorResponsavel: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      // Inserir comentário com campos avançados
      const { error } = await supabase
        .from("licitacoes_atividades")
        .insert({
          licitacao_id: licitacao.id,
          user_id: userData.user.id,
          tipo: "comentario",
          descricao: dados.texto,
          is_critico: dados.isCritico,
          resposta_esperada_ate: dados.respostaEsperadaAte?.toISOString() || null,
          responsavel_resposta_id: dados.responsavelRespostaId,
          setor_responsavel: dados.setorResponsavel,
        });

      if (error) throw error;

      // Criar notificações para os usuários mencionados
      if (dados.mencionadosIds.length > 0) {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("nome_completo")
          .eq("id", userData.user.id)
          .single();

        const autorNome = userProfile?.nome_completo || "Alguém";
        const tituloLicitacao = licitacao?.titulo || licitacao?.numero_edital || "uma licitação";

        const notificacoes = dados.mencionadosIds
          .filter(id => id !== userData.user!.id)
          .map(userId => ({
            user_id: userId,
            tipo: "licitacao_mencao",
            titulo: dados.isCritico ? "⚠️ Mensagem crítica - Você foi mencionado" : "Você foi mencionado",
            mensagem: `${autorNome} mencionou você em um comentário na licitação "${tituloLicitacao}"`,
            link: `/licitacoes?open=${licitacao.id}`,
            referencia_id: licitacao.id,
            lida: false,
          }));

        if (notificacoes.length > 0) {
          await supabase.from("system_notifications").insert(notificacoes);
        }
      }

      // Notificar responsável se definido
      if (dados.responsavelRespostaId && dados.responsavelRespostaId !== userData.user.id) {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("nome_completo")
          .eq("id", userData.user.id)
          .single();

        const autorNome = userProfile?.nome_completo || "Alguém";
        const tituloLicitacao = licitacao?.titulo || licitacao?.numero_edital || "uma licitação";

        await supabase.from("system_notifications").insert({
          user_id: dados.responsavelRespostaId,
          tipo: dados.isCritico ? "licitacao_mensagem_critica" : "licitacao_resposta_solicitada",
          titulo: dados.isCritico ? "⚠️ Resposta crítica solicitada" : "Resposta solicitada",
          mensagem: `${autorNome} solicitou sua resposta${dados.respostaEsperadaAte ? ` até ${new Date(dados.respostaEsperadaAte).toLocaleDateString('pt-BR')}` : ''} na licitação "${tituloLicitacao}"`,
          link: `/licitacoes?open=${licitacao.id}`,
          referencia_id: licitacao.id,
          lida: false,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licitacoes-atividades", licitacao?.id] });
      toast.success("Comentário adicionado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao adicionar comentário");
    },
  });

  // Função para fazer upload de imagem colada no editor
  const handleImagePasteUpload = async (file: File) => {
    if (!licitacao?.id && isNew) {
      toast.warning('Salve a licitação antes de adicionar anexos');
      return;
    }
    
    const licitacaoId = licitacao?.id;
    if (!licitacaoId) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', userId)
        .single();

      // Gera nome único para o arquivo
      const timestamp = Date.now();
      const extension = file.type.split('/')[1] || 'png';
      const fileName = `pasted_image_${timestamp}.${extension}`;
      const filePath = `${licitacaoId}/${timestamp}_${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('licitacoes-anexos')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('licitacoes_anexos')
        .insert({
          licitacao_id: licitacaoId,
          arquivo_nome: fileName,
          arquivo_url: filePath,
          usuario_id: userId,
          usuario_nome: profile?.nome_completo || 'Usuário',
        });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-tabela', licitacaoId] });
      queryClient.invalidateQueries({ queryKey: ['licitacao-anexos-bucket', licitacaoId] });
      toast.success('Imagem adicionada aos anexos');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao fazer upload da imagem');
    }
  };

  // Função handleAddComentario removida - agora usamos diretamente adicionarComentarioMutation.mutate no componente

  // Função para verificar se precisa de resultado
  const checkStatusRequiresResultado = (novoStatus: string) => {
    const statusAtual = licitacao?.status;
    const precisaResultado = STATUS_REQUER_RESULTADO.includes(novoStatus) && !STATUS_REQUER_RESULTADO.includes(statusAtual);
    return precisaResultado;
  };

  // Handler para confirmar resultado e salvar
  const handleResultadoConfirm = async () => {
    setResultadoDialogOpen(false);

    // Se o usuário veio do botão "Salvar" (salvamento manual), concluir o save agora
    if (pendingManualSaveSnapshot) {
      const snapshot = pendingManualSaveSnapshot;
      setPendingManualSaveSnapshot(null);
      setPendingStatusChange(null);

      const saved = await saveNow(snapshot, previousDataRef.current);
      if (saved && saved.updated_at) {
        // Atualizar previousDataRef com o updated_at real do banco
        previousDataRef.current = { ...snapshot, updated_at: saved.updated_at };
        // Marcar para o realtime sync reconhecer como mudança própria
        markAsSavedByMe(saved.updated_at);
      }
      toast.success(saved ? 'Tudo salvo!' : 'Nada para salvar.');
      return;
    }

    // Fluxo legado (criação/edição via mutations)
    handleSaveInternal();
  };

  // Handler para confirmar descarte e salvar
  const handleDescarteConfirm = async () => {
    setDescarteDialogOpen(false);

    // Se o usuário veio do botão "Salvar" (salvamento manual), concluir o save agora
    if (pendingManualSaveSnapshot) {
      const snapshot = pendingManualSaveSnapshot;
      setPendingManualSaveSnapshot(null);
      setPendingStatusChange(null);

      const saved = await saveNow(snapshot, previousDataRef.current);
      if (saved && saved.updated_at) {
        // Atualizar previousDataRef com o updated_at real do banco
        previousDataRef.current = { ...snapshot, updated_at: saved.updated_at };
        // Marcar para o realtime sync reconhecer como mudança própria
        markAsSavedByMe(saved.updated_at);
      }
      toast.success(saved ? 'Tudo salvo!' : 'Nada para salvar.');
      return;
    }

    // Fluxo legado (criação/edição via mutations)
    setPendingStatusChange(null);
    handleSaveInternal();
  };

  // Handler para cancelar descarte
  const handleDescarteCancel = () => {
    setFormData((prev: any) => ({ ...prev, status: licitacao?.status || 'captacao_edital' }));
    setPendingStatusChange(null);
    setDescarteDialogOpen(false);
  };

  const handleSaveInternal = () => {
    // Validação de campos obrigatórios na criação
    if (isNew) {
      const erros: string[] = [];
      if (!formData.numero_edital?.trim()) erros.push("Nº do Edital");
      if (!formData.objeto?.trim()) erros.push("Objeto");
      if (!formData.orgao?.trim()) erros.push("Órgão");
      
      if (erros.length > 0) {
        toast.error(`Campos obrigatórios não preenchidos: ${erros.join(", ")}`, {
          duration: 6000,
          description: "Preencha todos os campos obrigatórios antes de salvar.",
        });
        return;
      }
    }

    // Separar campos padrões dos customizados
    const camposPadrao = ['titulo', 'numero_edital', 'orgao', 'objeto', 'status', 'responsavel_id', 'data_disputa', 'valor_estimado', 'tipo_modalidade', 'subtipo_modalidade', 'municipio_uf', 'cnpj_orgao', 'etiquetas', 'observacoes'];
    
    // Extrair dados customizados (campos que começam com custom_)
    const dadosCustomizados: Record<string, any> = {};
    Object.keys(formData).forEach(key => {
      if (key.startsWith('custom_') && formData[key] !== undefined && formData[key] !== '') {
        dadosCustomizados[key] = formData[key];
      }
    });
    
    // Preparar dados, convertendo campos vazios para null (especialmente UUIDs)
    const dataToSend = {
      titulo: formData.titulo || null,
      numero_edital: formData.numero_edital || null,
      orgao: formData.orgao || null,
      objeto: formData.objeto || null,
      status: formData.status,
      responsavel_id: formData.responsavel_id && formData.responsavel_id.trim() !== '' ? formData.responsavel_id : null,
      data_disputa: formData.data_disputa?.toISOString() || null,
      valor_estimado: formData.valor_estimado === '' || formData.valor_estimado === undefined ? null : formData.valor_estimado,
      tipo_modalidade: formData.tipo_modalidade || null,
      subtipo_modalidade: formData.subtipo_modalidade || null,
        municipio_uf: formData.municipio_uf || null,
        cnpj_orgao: formData.cnpj_orgao || null,
        etiquetas: formData.etiquetas || [],
      observacoes: formData.observacoes || null,
      tipo_licitacao: formData.tipo_licitacao || 'GSS',
      prioridade: formData.prioridade || null,
      dados_customizados: Object.keys(dadosCustomizados).length > 0 ? dadosCustomizados : null,
    };
    
    if (isNew) {
      createMutation.mutate(dataToSend);
    } else {
      updateMutation.mutate(dataToSend);
    }
  };

  const handleSave = () => {
    // Verificar se mudança de status requer modal de descarte
    if (!isNew && formData.status === STATUS_DESCARTE && licitacao?.status !== STATUS_DESCARTE) {
      setPendingStatusChange(formData.status);
      setDescarteDialogOpen(true);
      return;
    }
    
    // Verificar se mudança de status requer resultado
    if (!isNew && checkStatusRequiresResultado(formData.status)) {
      setPendingStatusChange(formData.status);
      setResultadoDialogOpen(true);
      return;
    }
    
    handleSaveInternal();
  };

  const toggleEtiqueta = (etiqueta: string) => {
    setFormData((prev: any) => ({
      ...prev,
      etiquetas: prev.etiquetas.includes(etiqueta)
        ? prev.etiquetas.filter((e: string) => e !== etiqueta)
        : [...prev.etiquetas, etiqueta],
    }));
  };

  const adicionarNovaEtiqueta = () => {
    if (novaEtiqueta.trim() && !formData.etiquetas.includes(novaEtiqueta.trim())) {
      setFormData((prev: any) => ({
        ...prev,
        etiquetas: [...prev.etiquetas, novaEtiqueta.trim()],
      }));
      setNovaEtiqueta("");
    }
  };

  const getTagColor = (tag: string) => {
    return getTagBgColor(tag, tagsConfig);
  };

  const handleAddTag = async (name: string, colorId: string) => {
    // Adicionar à licitação atual
    if (!formData.etiquetas?.includes(name)) {
      setFormData((prev: any) => ({
        ...prev,
        etiquetas: [...(prev.etiquetas || []), name],
      }));
    }
    
    // Salvar no banco se for uma nova tag
    if (!tagsConfig.some(t => t.name === name)) {
      try {
        const { error } = await supabase
          .from("licitacoes_etiquetas_config")
          .insert({ nome: name, cor_id: colorId });
        
        if (error) {
          if (error.code === '23505') {
            // Tag já existe, apenas ignore
            return;
          }
          throw error;
        }
        
        // Invalidar cache para recarregar
        queryClient.invalidateQueries({ queryKey: ["licitacoes-etiquetas-config"] });
      } catch (error) {
        console.error("Erro ao salvar etiqueta:", error);
        toast.error("Erro ao salvar etiqueta");
      }
    }
  };

  const handleUpdateTagColor = async (name: string, colorId: string) => {
    try {
      const { error } = await supabase
        .from("licitacoes_etiquetas_config")
        .update({ cor_id: colorId, updated_at: new Date().toISOString() })
        .eq("nome", name);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["licitacoes-etiquetas-config"] });
    } catch (error) {
      console.error("Erro ao atualizar cor da etiqueta:", error);
      toast.error("Erro ao atualizar cor da etiqueta");
    }
  };

  const handleDeleteTag = async (name: string) => {
    // Remover da licitação atual
    setFormData((prev: any) => ({
      ...prev,
      etiquetas: (prev.etiquetas || []).filter((e: string) => e !== name),
    }));
    
    // Remover do banco
    try {
      const { error } = await supabase
        .from("licitacoes_etiquetas_config")
        .delete()
        .eq("nome", name);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["licitacoes-etiquetas-config"] });
    } catch (error) {
      console.error("Erro ao excluir etiqueta:", error);
      toast.error("Erro ao excluir etiqueta");
    }
  };

  if (!licitacao && !isNew) return null;

  const diasAteDisputa = licitacao?.data_disputa
    ? Math.ceil((new Date(licitacao.data_disputa).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isUrgente = diasAteDisputa !== null && diasAteDisputa <= 10 && diasAteDisputa >= 0;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const getAtividadeIcon = (tipo: string) => {
    switch (tipo) {
      case "status_change":
      case "status_alterado":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "field_update":
      case "campo_atualizado":
        return <Edit2 className="h-4 w-4 text-blue-500" />;
      case "anexo_adicionado":
        return <FileText className="h-4 w-4 text-green-500" />;
      default:
        return <User className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[1600px] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{isNew ? 'Novo Edital' : 'Detalhes da Licitação'}</DialogTitle>
          <DialogDescription>{isNew ? 'Crie um novo edital' : 'Visualize e edite as informações da licitação'}</DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Área Principal */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Content wrapper */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header - compacto */}
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
                  {editando ? (
                    <Input
                      value={formData.titulo}
                      onChange={(e) =>
                        setFormData((prev: any) => ({ ...prev, titulo: e.target.value }))
                      }
                      className="text-lg font-bold h-8 max-w-[300px]"
                      placeholder="Título"
                      disabled={!canEdit}
                    />
                  ) : (
                    <h2 className="text-lg font-bold truncate">
                      {isNew ? 'Novo Edital' : (licitacao?.titulo || licitacao?.numero_edital)}
                    </h2>
                  )}
                  
                  {editando ? (
                    <Select 
                      value={formData.status} 
                      onValueChange={(value) =>
                        setFormData((prev: any) => ({ ...prev, status: value }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="w-[180px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`${STATUS_COLORS[licitacao?.status || 'captacao_edital']} text-white px-2 py-0.5 rounded-full text-xs font-medium`}>
                      {STATUS_LABELS[licitacao?.status || 'captacao_edital'] || licitacao?.status || 'captacao_edital'}
                    </span>
                  )}
                  
                  {isUrgente && (
                    <Badge variant="destructive" className="text-xs py-0 h-5">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {diasAteDisputa}d
                    </Badge>
                  )}
                  
                  {/* Etiquetas inline */}
                  {editando ? (
                    <>
                      {formData.etiquetas?.map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          className={`${getTagColor(tag)} text-white px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 cursor-pointer`}
                          onClick={() => toggleEtiqueta(tag)}
                        >
                          {tag}
                          <X className="h-2.5 w-2.5" />
                        </span>
                      ))}
                      <EtiquetasDropdown
                        selectedTags={formData.etiquetas || []}
                        availableTags={tagsConfig}
                        onToggleTag={toggleEtiqueta}
                        onAddTag={handleAddTag}
                        onUpdateTagColor={handleUpdateTagColor}
                        onDeleteTag={handleDeleteTag}
                      />
                    </>
                  ) : (
                    licitacao?.etiquetas?.map((tag: string, idx: number) => (
                      <span
                        key={idx}
                        className={`${getTagColor(tag)} text-white px-2 py-0.5 rounded text-xs font-medium`}
                      >
                        {tag}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex gap-1.5 flex-shrink-0 items-center">
                  {/* Indicador de lock colaborativo */}
                  {!isNew && (
                    <LicitacaoLockBadge 
                      hasLock={hasLock} 
                      lockedBy={lockedBy} 
                      isLoading={isLoadingLock} 
                    />
                  )}
                  
                  {/* Indicador de salvamento automático */}
                  {!isNew && isAutoSaving && (
                    <span className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
                      <Save className="h-3 w-3 animate-spin" />
                      Salvando...
                    </span>
                  )}
                  
                  {isAdmin && (
                    <LayoutEditorControls
                      isAdmin={isAdmin}
                      layoutMode={layoutMode}
                      onToggle={() => setLayoutMode(!layoutMode)}
                      onReset={resetLayout}
                      onSave={saveLayout}
                      onAddField={() => setAddFieldDialogOpen(true)}
                    />
                  )}
                  {editando ? (
                    <>
                      {!isNew && (
                        <>
                          {/* Botão de Salvar Manual */}
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-7 px-3 text-xs gap-1.5"
                            disabled={!canEdit || isAutoSaving}
                            onClick={async () => {
                              if (!canEdit) {
                                toast.warning('Você está em modo visualização. Outro usuário está editando.');
                                return;
                              }
                              // Snapshot mais recente (ref atualizada no mesmo tick do setFormDataSafe)
                              const snapshot = formDataRef.current;
                              const novoStatus = snapshot.status;
                              const statusAtual = licitacao?.status;
                              
                              // Verificar se o novo status requer modal de descarte
                              if (novoStatus === STATUS_DESCARTE && statusAtual !== STATUS_DESCARTE) {
                                setPendingStatusChange(novoStatus);
                                setPendingManualSaveSnapshot(snapshot);
                                setDescarteDialogOpen(true);
                                return;
                              }
                              
                              // Verificar se o novo status requer resultado de inteligência competitiva
                              const precisaResultado = STATUS_REQUER_RESULTADO.includes(novoStatus) && 
                                                       !STATUS_REQUER_RESULTADO.includes(statusAtual || '');
                              
                              if (precisaResultado) {
                                // Verificar se já existe resultado para esta licitação
                                const { data: resultadoExistente } = await supabase
                                  .from('licitacao_resultados')
                                  .select('id')
                                  .eq('licitacao_id', licitacao?.id)
                                  .maybeSingle();
                                
                                if (!resultadoExistente) {
                                  // Abrir diálogo de resultado antes de salvar
                                  setPendingStatusChange(novoStatus);
                                  setPendingManualSaveSnapshot(snapshot);
                                  setResultadoDialogOpen(true);
                                  return;
                                }
                              }
                              
                              // Salvar normalmente se não precisar de resultado ou já existir
                              try {
                              const result = await saveNow(snapshot, previousDataRef.current);
                              if (result && result.updated_at) {
                                // Atualizar previousDataRef com o updated_at real do banco
                                previousDataRef.current = { ...snapshot, updated_at: result.updated_at };
                                // Marcar para o realtime sync reconhecer como mudança própria
                                markAsSavedByMe(result.updated_at);
                              }
                              toast.success(result ? 'Tudo salvo!' : 'Nada para salvar.');
                              } catch {
                                // erros já tratados no hook (toast + logs)
                              }
                            }}
                          >
                            {isAutoSaving ? (
                              <>
                                <Save className="h-3 w-3 animate-spin" />
                                Salvando...
                              </>
                            ) : (
                              <>
                                <Save className="h-3 w-3" />
                                Salvar
                              </>
                            )}
                          </Button>
                          
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                            setEditando(false);
                            setFormDataSafe({
                              titulo: licitacao?.titulo || '',
                              numero_edital: licitacao?.numero_edital || '',
                              orgao: licitacao?.orgao || '',
                              objeto: licitacao?.objeto || '',
                              status: licitacao?.status || 'captacao_edital',
                              responsavel_id: licitacao?.responsavel_id || '',
                              data_disputa: licitacao?.data_disputa ? new Date(licitacao.data_disputa) : undefined,
                              valor_estimado: licitacao?.valor_estimado || '',
                              tipo_modalidade: licitacao?.tipo_modalidade || '',
                              subtipo_modalidade: licitacao?.subtipo_modalidade || '',
                              municipio_uf: licitacao?.municipio_uf || '',
                              etiquetas: licitacao?.etiquetas || [],
                              observacoes: licitacao?.observacoes || '',
                              tipo_licitacao: licitacao?.tipo_licitacao || 'GSS',
                            });
                          }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {isNew && (
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave} disabled={isSaving}>
                          <Save className="h-3 w-3 mr-1" />
                          {isSaving ? 'Criando...' : 'Criar Edital'}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Botão de Inteligência Competitiva */}
                      {!isNew && hasCompetitividadeData && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setCompetitividadeViewOpen(true)}
                        >
                          <TrendingUp className="h-3 w-3" />
                          Competitividade
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(true)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs para navegar entre Detalhes, Competitividade e Converter em Contrato */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="mx-3 mt-2 w-fit">
                <TabsTrigger value="detalhes" className="text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Detalhes
                </TabsTrigger>
                {!isNew && (
                  <TabsTrigger value="competitividade" className="text-xs">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Competitividade
                  </TabsTrigger>
                )}
                <TabsTrigger value="converter" className="text-xs">
                  <FileSignature className="h-3.5 w-3.5 mr-1.5" />
                  Converter em Contrato
                </TabsTrigger>
              </TabsList>

              {/* Aba Detalhes */}
              <TabsContent value="detalhes" className="flex-1 min-h-0 overflow-hidden m-0">
                <ScrollArea className="h-full px-3 py-2">
                  <div className="space-y-1.5">
                    
                    {/* Campos Section - compacto */}
                    <DropZone
                      section="campos"
                      layoutMode={layoutMode}
                      onDrop={handleDrop}
                      draggedItem={draggedItem}
                      sectionConfig={layoutConfig.sectionSettings.campos}
                      onSectionConfigChange={(changes) => handleSectionConfigChange("campos", changes)}
                    >
                      <div 
                        className="grid gap-x-3 gap-y-1.5"
                        style={{
                          gridTemplateColumns: `repeat(auto-fill, minmax(clamp(160px, calc(100% / ${layoutConfig.sectionSettings.campos.columns} - 12px), 100%), 1fr))`,
                        }}
                      >
                        {getItemsBySection("campos").map((itemConfig, index) => {
                          const field = fieldsOrder.find(f => f.id === itemConfig.id);
                          
                          // Renderizar campo customizado
                          if (itemConfig.isCustom && itemConfig.customConfig) {
                            const customField = itemConfig.customConfig;
                            const fieldValue = formData[customField.id] || '';
                            
                            return (
                              <DraggableItem
                                key={itemConfig.id}
                                id={itemConfig.id}
                                layoutMode={layoutMode}
                                config={itemConfig}
                                onConfigChange={handleConfigChange}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onRemoveCustomField={removeCustomField}
                              >
                                <div className="flex items-center gap-1 py-0.5">
                                  <span className="text-xs text-muted-foreground flex-shrink-0 w-20">{customField.label}</span>
                                  {editando ? (
                                    customField.type === 'select' && customField.options ? (
                                      <Select
                                        value={fieldValue}
                                        onValueChange={(value) =>
                                          setFormDataSafe((prev: any) => ({ ...prev, [customField.id]: value }))
                                        }
                                      >
                                        <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
                                          <SelectValue placeholder={customField.placeholder || "—"} />
                                        </SelectTrigger>
                                        <SelectContent className="z-50">
                                          {customField.options.map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-xs">
                                              {opt}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : customField.type === 'date' ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            className="h-6 px-1.5 text-xs font-normal justify-start border border-transparent hover:border-border hover:bg-muted/50 transition-colors flex-1 min-w-0"
                                          >
                                            {fieldValue ? format(new Date(fieldValue), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 z-50" align="start">
                                          <div className="p-3 space-y-3">
                                            <CalendarComponent
                                              mode="single"
                                              selected={fieldValue ? new Date(fieldValue) : undefined}
                                              onSelect={(date) => {
                                                setFormDataSafe((prev: any) => {
                                                  if (!date) return { ...prev, [customField.id]: null };

                                                  const currentDate = fieldValue ? new Date(fieldValue) : new Date();
                                                  date.setHours(currentDate.getHours(), currentDate.getMinutes());

                                                  return { ...prev, [customField.id]: date.toISOString() };
                                                });
                                              }}
                                              initialFocus
                                              className="pointer-events-auto p-0"
                                            />
                                            <div className="flex items-center gap-2 border-t pt-3">
                                              <span className="text-xs text-muted-foreground">Hora:</span>
                                              <Input
                                                type="time"
                                                className="h-8 w-full text-sm"
                                                value={fieldValue ? format(new Date(fieldValue), "HH:mm") : "09:00"}
                                                onChange={(e) => {
                                                  const [hours, minutes] = e.target.value.split(':').map(Number);
                                                  const newDate = fieldValue ? new Date(fieldValue) : new Date();
                                                  newDate.setHours(hours || 0, minutes || 0);

                                                  setFormDataSafe((prev: any) => ({
                                                    ...prev,
                                                    [customField.id]: newDate.toISOString(),
                                                  }));
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : customField.type === 'currency' ? (
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        value={fieldValue ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(fieldValue) || 0) : ''}
                                        onChange={(e) => {
                                          const rawValue = e.target.value.replace(/\D/g, '');
                                          const numericValue = parseInt(rawValue, 10) / 100;
                                          setFormDataSafe((prev: any) => ({ ...prev, [customField.id]: numericValue || '' }));
                                        }}
                                        className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
                                        placeholder={customField.placeholder || "0,00"}
                                      />
                                    ) : customField.type === 'number' ? (
                                      <Input
                                        type="number"
                                        value={fieldValue}
                                        onChange={(e) =>
                                          setFormDataSafe((prev: any) => ({ ...prev, [customField.id]: e.target.value }))
                                        }
                                        className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
                                        placeholder={customField.placeholder || "—"}
                                      />
                                    ) : (
                                        <Input
                                          value={fieldValue}
                                          onChange={(e) =>
                                            setFormDataSafe((prev: any) => ({ ...prev, [customField.id]: e.target.value }))
                                          }
                                        className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
                                        placeholder={customField.placeholder || "—"}
                                      />
                                    )
                                  ) : (
                                    <span className="text-xs font-medium">
                                      {customField.type === 'currency' && fieldValue 
                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(fieldValue) || 0)
                                        : customField.type === 'date' && fieldValue
                                        ? format(new Date(fieldValue), "dd/MM/yyyy", { locale: ptBR })
                                        : fieldValue || "—"}
                                    </span>
                                  )}
                                </div>
                              </DraggableItem>
                            );
                          }
                          
                          // Campo padrão
                          if (!field) return null;
                          
                          return (
                            <DraggableItem
                              key={itemConfig.id}
                              id={itemConfig.id}
                              layoutMode={layoutMode}
                              config={itemConfig}
                              onConfigChange={handleConfigChange}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                            >
                              <LicitacaoField
                                field={field}
                                editando={editando}
                                formData={formData}
                                setFormData={setFormDataSafe}
                                licitacao={licitacao}
                                profiles={profiles || []}
                                layoutMode={false}
                                onMoveUp={() => {}}
                                onMoveDown={() => {}}
                                isFirst={true}
                                isLast={true}
                                canEditTipoLicitacao={canEditTipoLicitacao}
                              />
                            </DraggableItem>
                          );
                        })}
                      </div>
                    </DropZone>


                    <Separator className="my-2" />

                    {/* Main Section - Objeto prioritário */}
                    <DropZone
                      section="main"
                      layoutMode={layoutMode}
                      onDrop={handleDrop}
                      draggedItem={draggedItem}
                      sectionConfig={layoutConfig.sectionSettings.main}
                      onSectionConfigChange={(changes) => handleSectionConfigChange("main", changes)}
                    >
                      <div className="space-y-2">
                        {/* Objeto - área principal e expandida */}
                        <DraggableItem
                          id="objeto"
                          layoutMode={layoutMode}
                          config={getItemConfig("objeto")}
                          onConfigChange={handleConfigChange}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-semibold text-primary uppercase tracking-wide">Objeto</span>
                            </div>
                            {editando ? (
                              <RichTextEditor
                                value={formData.objeto}
                                onChange={(value) =>
                                  setFormDataSafe((prev: any) => ({ ...prev, objeto: value }))
                                }
                                minHeight="300px"
                                placeholder="Descreva o objeto..."
                                onImagePaste={handleImagePasteUpload}
                              />
                            ) : (
                              <div 
                                className="text-sm prose prose-sm max-w-none bg-muted/30 rounded-md p-3 min-h-[200px] relative overflow-hidden [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all hover:[&_a]:text-blue-800 [&_a]:cursor-pointer [&_a]:relative [&_a]:z-10 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_td]:text-xs [&_th]:border [&_th]:border-border [&_th]:p-1.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-muted/50"
                                onClick={(e) => {
                                  const target = e.target as HTMLElement;
                                  if (target.tagName === 'A') {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const href = (target as HTMLAnchorElement).href;
                                    if (href) window.open(href, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(linkifyHtml(licitacao?.objeto || "—")) }}
                              />
                            )}
                          </div>
                        </DraggableItem>

                        {/* Observações */}
                        {true && (
                          <DraggableItem
                            id="observacoes"
                            layoutMode={layoutMode}
                            config={getItemConfig("observacoes")}
                            onConfigChange={handleConfigChange}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Edit2 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Observações</span>
                              </div>
                              {editando ? (
                                <Textarea
                                  value={formData.observacoes}
                                  onChange={(e) =>
                                    setFormDataSafe((prev: any) => ({ ...prev, observacoes: e.target.value }))
                                  }
                                  className="text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors resize-y min-h-[80px]"
                                  placeholder="Adicionar observação..."
                                  rows={4}
                                />
                              ) : (
                                <p className="text-xs text-muted-foreground [&_a]:relative [&_a]:z-10">{linkifyText(licitacao?.observacoes || "")}</p>
                              )}
                            </div>
                          </DraggableItem>
                        )}
                      </div>
                    </DropZone>

                    {/* Anexos - dentro do scroll (só mostra para licitações existentes) */}
                    {licitacao?.id && (
                      <div className="pt-2">
                        <LicitacaoAnexosBar licitacaoId={licitacao.id} />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Aba Competitividade */}
              {!isNew && (
                <TabsContent value="competitividade" className="flex-1 min-h-0 overflow-hidden m-0">
                  <ScrollArea className="h-full px-3 py-4">
                    <div className="space-y-4">
                      {hasCompetitividadeData ? (
                        <>
                          {/* Visualização dos dados existentes */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-primary" />
                              <h3 className="text-sm font-semibold">Dados de Inteligência Competitiva</h3>
                            </div>
                            {licitacao?.status !== 'arrematados' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPendingStatusChange(licitacao?.status || 'nao_ganhamos');
                                setResultadoDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Editar Dados
                            </Button>
                            )}
                          </div>
                          
                          {/* Preview inline dos dados */}
                          <div className="border rounded-lg p-4 bg-muted/30">
                            <p className="text-sm text-muted-foreground mb-2">
                              Esta licitação possui dados de competitividade registrados.
                            </p>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setCompetitividadeViewOpen(true)}
                            >
                              <TrendingUp className="h-4 w-4 mr-1" />
                              Visualizar Relatório Completo
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg">
                          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Nenhuma informação de competitividade registrada
                          </p>
                          <p className="text-xs text-muted-foreground mb-4">
                            Registre os itens e concorrentes para análise de inteligência competitiva.
                          </p>
                          {licitacao?.status !== 'arrematados' && <Button
                            variant="default"
                            onClick={() => {
                              setPendingStatusChange(licitacao?.status || 'arrematados');
                              setResultadoDialogOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Registrar Competitividade
                          </Button>}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {/* Aba Converter em Contrato */}
              <TabsContent value="converter" className="flex-1 min-h-0 overflow-hidden m-0">
                <ScrollArea className="h-full px-3 py-4">
                  <div className="space-y-4">
                    {/* Cabeçalho estilo prontuário */}
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <FileSignature className="h-8 w-8 text-primary" />
                        <div>
                          <h3 className="text-base font-semibold">Preparar para Contrato</h3>
                          <p className="text-sm text-muted-foreground">
                            Preencha os requisitos abaixo para habilitar a movimentação desta licitação no Kanban.
                          </p>
                        </div>
                      </div>

                      {/* Checklist de campos obrigatórios estilo prontuário */}
                      {(() => {
                        const servicosValidos = servicos.length > 0 && servicos.every(s => s.nome.trim() && s.valor > 0);
                        const orgao = licitacao?.orgao;
                        const municipioUf = licitacao?.municipio_uf;
                        const numeroEdital = licitacao?.numero_edital;
                        const cnpj = licitacao?.cnpj_orgao || (licitacao as any)?.dados_customizados?.custom_cnpj || formData.cnpj_orgao;
                        const objetoPreenchido = objetoContrato.trim().length > 0;

                        const camposObrigatorios = [
                          { campo: 'Nº Edital', preenchido: !!numeroEdital, valor: numeroEdital },
                          { campo: 'Órgão', preenchido: !!orgao, valor: orgao },
                          { campo: 'Município/UF', preenchido: !!municipioUf, valor: municipioUf },
                          { campo: 'CNPJ', preenchido: !!cnpj, valor: cnpj },
                          { campo: 'Objeto do Contrato', preenchido: objetoPreenchido, valor: objetoPreenchido ? objetoContrato.substring(0, 40) + (objetoContrato.length > 40 ? '...' : '') : null },
                          { campo: 'Serviços do Contrato', preenchido: servicosValidos, valor: servicosValidos ? `${servicos.length} serviço(s) adicionado(s)` : null },
                        ];

                        const verificacoes = [
                          { id: 'check1', label: 'Documentação verificada e completa', checked: checkConversao1, setter: setCheckConversao1 },
                          { id: 'check2', label: 'Valores e condições conferidos', checked: checkConversao2, setter: setCheckConversao2 },
                          { id: 'check3', label: 'Responsável técnico definido', checked: checkConversao3, setter: setCheckConversao3 },
                        ];
                        const checkboxesValidos = checkConversao1 && checkConversao2 && checkConversao3;
                        const todosValidos = camposObrigatorios.every(c => c.preenchido) && checkboxesValidos;

                        return (
                          <div className="space-y-4">
                            {/* Campos obrigatórios da licitação */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                Campos Obrigatórios da Licitação
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {camposObrigatorios.map((item) => (
                                  <div
                                    key={item.campo}
                                    className={`flex items-center gap-2 p-2 rounded-md border text-sm ${
                                      item.preenchido
                                        ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                                    }`}
                                  >
                                    {item.preenchido ? (
                                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                    ) : (
                                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    )}
                                    <span className="font-medium">{item.campo}:</span>
                                    <span className="truncate text-xs opacity-80">
                                      {item.preenchido ? item.valor : 'Não informado'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {camposObrigatorios.some(c => !c.preenchido) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  ⚠️ Campos faltantes devem ser preenchidos na aba <strong>Detalhes</strong>.
                                </p>
                              )}
                            </div>

                            <Separator />

                            {/* Objeto do Contrato */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <FileSignature className="h-4 w-4" />
                                Objeto do Contrato
                                <span className="text-xs font-normal text-muted-foreground">(obrigatório)</span>
                              </h4>
                              <Textarea
                                value={objetoContrato}
                                onChange={(e) => setObjetoContrato(e.target.value)}
                                placeholder="Descreva o objeto do contrato de forma clara e objetiva (sem formatação HTML)..."
                                rows={4}
                                className={`resize-none text-sm ${!objetoContrato.trim() ? 'border-destructive/50' : 'border-green-500/30'}`}
                              />
                              {!objetoContrato.trim() && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Campo obrigatório — diferente do "Objeto" da aba Detalhes (que pode ter formatação HTML).
                                </p>
                              )}
                            </div>

                            <Separator />

                            {/* Serviços do Contrato */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                Serviços do Contrato
                                <span className="text-xs font-normal text-muted-foreground">(obrigatório)</span>
                              </h4>

                              <div className="space-y-2">
                                {servicos.map((servico) => {
                                  const nomeInvalido = !servico.nome.trim();
                                  const valorInvalido = !servico.valor || servico.valor <= 0;
                                  return (
                                    <div
                                      key={servico.id}
                                      className={`flex items-center gap-2 p-2 rounded-lg border bg-card ${
                                        (nomeInvalido || valorInvalido) ? 'border-destructive/50' : 'border-green-500/30 bg-green-500/5'
                                      }`}
                                    >
                                      <Input
                                        value={servico.nome}
                                        onChange={(e) => atualizarServico(servico.id, 'nome', e.target.value)}
                                        className={`flex-1 h-8 text-sm ${nomeInvalido ? 'border-destructive' : ''}`}
                                        placeholder="Nome do serviço *"
                                      />
                                      <div className="relative w-36">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={servico.valor || ''}
                                          onChange={(e) => atualizarServico(servico.id, 'valor', parseFloat(e.target.value) || 0)}
                                          className={`h-8 text-sm pl-8 ${valorInvalido ? 'border-destructive' : ''}`}
                                          placeholder="0,00"
                                        />
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() => removerServico(servico.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  );
                                })}

                                {servicos.length === 0 && (
                                  <div className="text-center py-6 border-2 border-dashed rounded-lg border-destructive/30 bg-destructive/5">
                                    <FileSignature className="h-8 w-8 mx-auto mb-2 text-destructive/50" />
                                    <p className="text-sm text-destructive font-medium">Nenhum serviço adicionado</p>
                                    <p className="text-xs text-muted-foreground">Adicione pelo menos 1 serviço com nome e valor</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <Input
                                  value={novoServico}
                                  onChange={(e) => setNovoServico(e.target.value)}
                                  className="flex-1 h-9"
                                  placeholder="Digite o nome do serviço..."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      adicionarServico();
                                    }
                                  }}
                                />
                                <Button onClick={adicionarServico} disabled={!novoServico.trim()} className="h-9">
                                  <Plus className="h-4 w-4 mr-1" />
                                  Adicionar
                                </Button>
                              </div>
                            </div>

                            <Separator />

                            {/* Verificações obrigatórias estilo checklist prontuário */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Check className="h-4 w-4" />
                                Verificações Obrigatórias
                              </h4>
                              <div className="space-y-2">
                                {verificacoes.map((v) => (
                                  <div
                                    key={v.id}
                                    onClick={() => v.setter(!v.checked)}
                                    className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                                      v.checked
                                        ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                                        : 'bg-muted/40 border-border hover:bg-muted/70 text-muted-foreground'
                                    }`}
                                  >
                                    <Checkbox
                                      id={v.id}
                                      checked={v.checked}
                                      onCheckedChange={(checked) => v.setter(checked as boolean)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <label htmlFor={v.id} className="text-sm cursor-pointer font-medium">
                                      {v.label}
                                    </label>
                                    {v.checked && <CheckCircle2 className="h-4 w-4 ml-auto flex-shrink-0" />}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Status geral */}
                            <div className={`p-3 rounded-lg border flex items-center gap-2 ${
                              todosValidos
                                ? 'bg-green-500/10 border-green-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                            }`}>
                              {todosValidos ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                              ) : (
                                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                              )}
                              <span className={`text-sm font-medium ${todosValidos ? 'text-green-700' : 'text-amber-700'}`}>
                                {todosValidos
                                  ? '✅ Licitação validada — pode ser movida para Arrematados'
                                  : 'Preencha todos os requisitos para habilitar a movimentação'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Botão Salvar */}
                    <Button
                      className="w-full"
                      onClick={salvarDadosConversao}
                      disabled={salvandoConversao}
                    >
                      {salvandoConversao ? (
                        <>Salvando...</>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Salvar Dados de Conversão
                        </>
                      )}
                    </Button>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            </div>
          </div>

          {/* Painel Lateral - Atividades */}
          <div className="w-80 border-l flex flex-col bg-muted/20 flex-shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                Atividades
              </h3>
            </div>
            
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-1">
                {atividades?.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
                    <Clock className="h-10 w-10 mb-3 opacity-50" />
                    <p className="text-sm font-medium text-center">Nenhuma atividade</p>
                    <p className="text-xs text-center mt-1">Alterações serão exibidas aqui.</p>
                  </div>
                )}
                {atividades?.map((atividade: any, index: number) => (
                  <div 
                    key={atividade.id} 
                    className={`px-4 py-3 hover:bg-muted/50 transition-colors ${index !== (atividades?.length || 0) - 1 ? 'border-b border-border/50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                          {atividade.profiles?.nome_completo?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">
                            {atividade.profiles?.nome_completo || "Sistema"}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(atividade.created_at), "dd MMM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="flex-shrink-0 mt-0.5">{getAtividadeIcon(atividade.tipo)}</span>
                          <span className="break-words overflow-hidden [&_a]:relative [&_a]:z-10">
                            {atividade.tipo === 'campo_atualizado' ? 'editou' : linkifyText(atividade.descricao)}
                          </span>
                        </div>
                        
                        {/* Mostrar campos alterados */}
                        {atividade.campo_alterado && atividade.valor_antigo && atividade.valor_novo && (
                          <div className="mt-2 space-y-1">
                            <div className="text-xs text-muted-foreground capitalize">{atividade.campo_alterado.replace(/_/g, ' ')}</div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs px-1.5 py-0">
                                {atividade.valor_antigo.length > 30 ? atividade.valor_antigo.slice(0, 30) + '...' : atividade.valor_antigo}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs px-1.5 py-0">
                                {atividade.valor_novo.length > 30 ? atividade.valor_novo.slice(0, 30) + '...' : atividade.valor_novo}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <LicitacaoComentarioAvancadoInput
              profiles={profiles || []}
              onEnviar={(dados) => adicionarComentarioMutation.mutate({
                texto: dados.mensagem,
                mencionadosIds: dados.mencionados,
                isCritico: dados.isCritico,
                respostaEsperadaAte: dados.respostaEsperadaAte,
                responsavelRespostaId: dados.responsavelRespostaId,
                setorResponsavel: dados.setorResponsavel,
              })}
              isLoading={adicionarComentarioMutation.isPending}
            />
          </div>
        </div>
      </DialogContent>

      {/* Dialog para adicionar campo customizado */}
      <AddCustomFieldDialog
        open={addFieldDialogOpen}
        onOpenChange={setAddFieldDialogOpen}
        onAdd={addCustomField}
        existingIds={existingFieldIds}
      />

      {/* Dialog de resultado obrigatório */}
      <LicitacaoResultadoItensDialog
        open={resultadoDialogOpen}
        onOpenChange={(open) => {
          if (!open && pendingStatusChange) {
            setFormData((prev: any) => ({ ...prev, status: licitacao?.status || 'captacao_edital' }));
            setPendingStatusChange(null);
          }
          setResultadoDialogOpen(open);
        }}
        licitacaoId={licitacao?.id || ''}
        novoStatus={pendingStatusChange || ''}
        licitacaoTitulo={formData.titulo || licitacao?.titulo || licitacao?.numero_edital || ''}
        onConfirm={handleResultadoConfirm}
        onCancel={() => {
          setFormData((prev: any) => ({ ...prev, status: licitacao?.status || 'captacao_edital' }));
          setPendingStatusChange(null);
          setResultadoDialogOpen(false);
        }}
      />

      {/* Dialog de visualização de competitividade */}
      <LicitacaoCompetitividadeViewDialog
        open={competitividadeViewOpen}
        onOpenChange={setCompetitividadeViewOpen}
        licitacaoId={licitacao?.id || ''}
        licitacaoTitulo={licitacao?.titulo || licitacao?.numero_edital || ''}
        onEdit={() => {
          setCompetitividadeViewOpen(false);
          // Abrir dialog de edição sempre (os dados já estão carregados)
          setPendingStatusChange(licitacao?.status || 'arrematados');
          setResultadoDialogOpen(true);
        }}
      />

      {/* Dialog de descarte */}
      <LicitacaoDescarteDialog
        open={descarteDialogOpen}
        onOpenChange={(open) => {
          if (!open && pendingStatusChange) {
            handleDescarteCancel();
          }
          setDescarteDialogOpen(open);
        }}
        licitacao={licitacao ? {
          id: licitacao.id,
          numero_edital: licitacao.numero_edital,
          valor_estimado: licitacao.valor_estimado,
          municipio_uf: licitacao.municipio_uf,
          orgao: licitacao.orgao,
          subtipo_modalidade: licitacao.subtipo_modalidade,
          tipo_modalidade: licitacao.tipo_modalidade,
          objeto: licitacao.objeto,
          titulo: licitacao.titulo,
        } : null}
        onConfirm={handleDescarteConfirm}
        onCancel={handleDescarteCancel}
      />
    </Dialog>
  );
}
