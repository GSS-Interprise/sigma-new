import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, DollarSign, User, MapPin, AlertTriangle, Paperclip, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { useLicitacoesProfiles } from "@/hooks/useLicitacoesProfiles";
import { LicitacaoResultadoItensDialog } from "./LicitacaoResultadoItensDialog";
import { LicitacaoDescarteDialog } from "./LicitacaoDescarteDialog";
import { Button } from "@/components/ui/button";
import { CardActionsMenu } from "@/components/demandas/CardActionsMenu";

// Status que requerem resultado obrigatório (Inteligência Competitiva)
const STATUS_REQUER_RESULTADO = ['arrematados', 'nao_ganhamos'];
// Status que requer modal de descarte
const STATUS_DESCARTE = 'descarte_edital';
interface LicitacoesKanbanProps {
  columns: { id: string; label: string; cor?: string }[];
  onCardClick?: (licitacao: any) => void;
  onCardDoubleClick?: (licitacao: any) => void;
  filters?: {
    search?: string;
    etiquetas?: string[];
    responsavel?: string;
    dataInicio?: Date;
    dataFim?: Date;
    tipoLicitacao?: string;
  };
  onHasMoreChange?: (hasMore: boolean, loadMore: () => void) => void;
}

interface ServicoContrato {
  id: string;
  nome: string;
  valor: number;
}

type LicitacaoWithResponsavel = {
  id: string;
  created_at: string;
  updated_at: string;
  numero_edital: string;
  orgao: string;
  objeto: string;
  valor_estimado: number | null;
  data_abertura: string | null;
  data_limite: string | null;
  data_disputa: string | null;
  status: string;
  responsavel_id: string | null;
  observacoes: string | null;
  licitacao_codigo: string | null;
  municipio_uf: string | null;
  tipo_modalidade: string | null;
  subtipo_modalidade: string | null;
  etiquetas: string[] | null;
  fonte: string | null;
  effect_id: string | null;
  titulo: string | null;
  prioridade: string | null;
  tipo_licitacao: string | null;
  responsavel?: { id: string; nome_completo: string } | null;
  // Campos de validação para conversão em contrato
  servicos_contrato?: ServicoContrato[] | null;
  check_conversao_1?: boolean;
  check_conversao_2?: boolean;
  check_conversao_3?: boolean;
};

const TAG_COLOR_MAP: { [key: string]: string } = {
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

// Importante: manter como string literal (as const) para evitar GenericStringError nos tipos do client.
// NOTA: 'objeto' e 'observacoes' permanecem fora do select inicial por performance.
// 'objeto_contrato' precisa ficar no select base porque é usado na validação de conversão para contrato.
const LICITACOES_KANBAN_SELECT =
  'id,created_at,updated_at,numero_edital,orgao,cnpj_orgao,valor_estimado,data_abertura,data_limite,data_disputa,status,responsavel_id,municipio_uf,tipo_modalidade,subtipo_modalidade,etiquetas,titulo,prioridade,tipo_licitacao,servicos_contrato,objeto_contrato,check_conversao_1,check_conversao_2,check_conversao_3,dados_customizados' as const;

// Colunas pesadas carregadas sob demanda ao clicar no card
const LICITACOES_HEAVY_COLUMNS = 'objeto,objeto_contrato,observacoes' as const;

// Função para validar se a licitação pode ser movida
const isLicitacaoValidaParaMover = (licitacao: LicitacaoWithResponsavel): { valido: boolean; motivo?: string } => {
  const servicos = licitacao.servicos_contrato || [];
  
  // Verificar se tem pelo menos 1 serviço
  if (servicos.length === 0) {
    return { valido: false, motivo: "Adicione pelo menos 1 serviço com nome e valor na aba 'Converter em Contrato'." };
  }
  
  // Verificar se todos os serviços têm nome e valor válido
  for (const servico of servicos) {
    if (!servico.nome || servico.nome.trim() === '') {
      return { valido: false, motivo: "Todos os serviços devem ter um nome preenchido." };
    }
    if (!servico.valor || servico.valor <= 0) {
      return { valido: false, motivo: "Todos os serviços devem ter um valor maior que zero." };
    }
  }
  
  // Verificar os 3 checkboxes
  if (!licitacao.check_conversao_1 || !licitacao.check_conversao_2 || !licitacao.check_conversao_3) {
    return { valido: false, motivo: "Marque os 3 checkboxes obrigatórios na aba 'Converter em Contrato'." };
  }
  
  // Verificar objeto do contrato
  if (!(licitacao as any).objeto_contrato || !(licitacao as any).objeto_contrato.trim()) {
    return { valido: false, motivo: "Preencha o 'Objeto do Contrato' na aba 'Converter em Contrato'." };
  }
  
  return { valido: true };
};

export function LicitacoesKanban({ columns, onCardClick, onCardDoubleClick, filters, onHasMoreChange }: LicitacoesKanbanProps) {
  const queryClient = useQueryClient();
  const [fileDropTarget, setFileDropTarget] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string | null>(null);
  const { isSetorAges } = useUserSetor();
  const { userRoles } = usePermissions();
  const [page, setPage] = useState(0);
  
  // Estados para controle do diálogo de resultado
  const [resultadoDialogOpen, setResultadoDialogOpen] = useState(false);
  const [descarteDialogOpen, setDescarteDialogOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ licitacaoId: string; newStatus: string } | null>(null);
  const [pendingLicitacao, setPendingLicitacao] = useState<LicitacaoWithResponsavel | null>(null);

  // Estados para coluna descartadas (carregamento sob demanda)
  const [descartadasLoaded, setDescartadasLoaded] = useState(false);
  const [descartadasData, setDescartadasData] = useState<LicitacaoWithResponsavel[]>([]);
  const [descartadasLoading, setDescartadasLoading] = useState(false);

  // Auto-scroll durante drag
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Configurações do auto-scroll
  const SCROLL_ZONE_WIDTH = 100; // Pixels da borda para ativar scroll
  const SCROLL_SPEED = 15; // Pixels por frame

  const handleAutoScroll = useCallback((clientX: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const leftEdge = rect.left + SCROLL_ZONE_WIDTH;
    const rightEdge = rect.right - SCROLL_ZONE_WIDTH;

    // Limpar intervalo anterior
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }

    // Scroll para esquerda
    if (clientX < leftEdge) {
      const intensity = 1 - (clientX - rect.left) / SCROLL_ZONE_WIDTH;
      autoScrollIntervalRef.current = setInterval(() => {
        container.scrollLeft -= SCROLL_SPEED * Math.max(0.3, intensity);
      }, 16);
    }
    // Scroll para direita
    else if (clientX > rightEdge) {
      const intensity = 1 - (rect.right - clientX) / SCROLL_ZONE_WIDTH;
      autoScrollIntervalRef.current = setInterval(() => {
        container.scrollLeft += SCROLL_SPEED * Math.max(0.3, intensity);
      }, 16);
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  // Listener global para drag - captura movimento mesmo fora dos elementos drop
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalDrag = (e: DragEvent) => {
      handleAutoScroll(e.clientX);
    };

    // Usar dragover no document para capturar movimento global
    document.addEventListener('dragover', handleGlobalDrag);

    return () => {
      document.removeEventListener('dragover', handleGlobalDrag);
      stopAutoScroll();
    };
  }, [isDragging, handleAutoScroll, stopAutoScroll]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  // Verificar se é gestor_ages exclusivo (sem acesso GSS)
  const isGestorAgesOnly = userRoles?.some(r => r.role === 'gestor_ages') && 
                           !userRoles?.some(r => r.role === 'admin' || r.role === 'diretoria' || r.role === 'lideres' || r.role === 'gestor_captacao' || r.role === 'gestor_contratos');

  // Combinar verificações de setor e role
  const shouldFilterAgesOnly = isSetorAges || isGestorAgesOnly;

  // Paginação incremental (mantém acesso ao histórico via "Carregar mais")
  const PAGE_SIZE = 400;
  const pageEnd = (page + 1) * PAGE_SIZE; // carregamos acumulado

  // Buscar IDs das licitações AGES para filtrar (apenas para gestor_ages)
  const { data: agesLicitacaoIds } = useQuery({
    queryKey: ["ages-licitacao-ids-kanban"],
    enabled: isGestorAgesOnly,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_licitacoes")
        .select("licitacao_id");
      
      if (error) throw error;
      return data?.map(al => al.licitacao_id).filter(Boolean) || [];
    },
  });

  const { data, isLoading } = useQuery<{ items: LicitacaoWithResponsavel[]; hasMore: boolean }>({
    queryKey: ['licitacoes-kanban', filters, shouldFilterAgesOnly, agesLicitacaoIds, page],
    queryFn: async () => {
      let query = supabase
        .from('licitacoes')
        .select(LICITACOES_KANBAN_SELECT)
        // Ordenação única: data_disputa (mais próximas primeiro)
        .order('data_disputa', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }); // fallback para licitações sem data_disputa

      // Filtro para gestor_ages exclusivo: apenas licitações vinculadas em ages_licitacoes
      if (isGestorAgesOnly && agesLicitacaoIds) {
        if (agesLicitacaoIds.length === 0) {
          return { items: [], hasMore: false }; // Nenhuma licitação AGES vinculada
        }
        query = query.in('id', agesLicitacaoIds);
      } else if (isSetorAges) {
        // Filtro automático por setor AGES (tipo_licitacao)
        query = query.eq('tipo_licitacao', 'AGES');
      } else if (filters?.tipoLicitacao) {
        // Filtro manual por tipo selecionado pelo usuário
        query = query.eq('tipo_licitacao', filters.tipoLicitacao);
      }
      // Se não houver filtro de tipo, mostra TODAS as licitações (GSS + AGES)

      // Apply filters
      if (filters?.search) {
        query = query.or(`titulo.ilike.%${filters.search}%,numero_edital.ilike.%${filters.search}%,orgao.ilike.%${filters.search}%`);
      }

      if (filters?.responsavel) {
        query = query.eq('responsavel_id', filters.responsavel);
      }

      if (filters?.dataInicio) {
        query = query.gte('data_disputa', filters.dataInicio.toISOString());
      }

      if (filters?.dataFim) {
        query = query.lte('data_disputa', filters.dataFim.toISOString());
      }

      // Excluir descartadas da query principal — carregadas sob demanda
      query = query.neq('status', 'descarte_edital');

      // Buscar 1 item extra para detectar se existe mais histórico
      query = query.range(0, pageEnd);

      const { data, error } = await query;
      if (error) throw error;

      const raw = (data || []) as unknown as LicitacaoWithResponsavel[];
      const hasMore = raw.length > pageEnd;
      const sliced = hasMore ? raw.slice(0, pageEnd) : raw;

      // Filter by etiquetas in memory (since it's an array field)
      let filteredData: any[] = sliced;
      if (filters?.etiquetas && filters.etiquetas.length > 0) {
        filteredData = filteredData.filter(lic => 
          lic.etiquetas && filters.etiquetas?.some((tag: string) => lic.etiquetas?.includes(tag))
        );
      }

      // Fetch responsavel data separately
      if (filteredData.length > 0) {
        const responsaveisIds = filteredData
          .map(l => l.responsavel_id)
          .filter((id): id is string => id !== null);
        
        if (responsaveisIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, nome_completo')
            .in('id', responsaveisIds);
          
          const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
            return {
              items: filteredData.map(licitacao => ({
            ...licitacao,
            servicos_contrato: Array.isArray(licitacao.servicos_contrato) 
              ? licitacao.servicos_contrato as unknown as ServicoContrato[]
              : [],
            responsavel: licitacao.responsavel_id ? profilesMap.get(licitacao.responsavel_id) : null
              })) as LicitacaoWithResponsavel[],
              hasMore,
            };
        }
      }

      return {
        items: filteredData.map((lic) => ({
          ...lic,
          servicos_contrato: Array.isArray(lic.servicos_contrato)
            ? (lic.servicos_contrato as unknown as ServicoContrato[])
            : [],
        })) as LicitacaoWithResponsavel[],
        hasMore,
      };
    },
    staleTime: 30 * 1000,
  });

  const licitacoes = data?.items || [];
  const hasMore = !!data?.hasMore;

  useEffect(() => {
    onHasMoreChange?.(hasMore, () => setPage((p) => p + 1));
  }, [hasMore]);

  const { data: profiles } = useLicitacoesProfiles();

  // Count de descartadas (query leve, apenas count)
  const { data: descartadasCount = 0 } = useQuery({
    queryKey: ['licitacoes-descartadas-count', filters, shouldFilterAgesOnly, agesLicitacaoIds],
    queryFn: async () => {
      let query = supabase
        .from('licitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'descarte_edital');

      if (isGestorAgesOnly && agesLicitacaoIds) {
        if (agesLicitacaoIds.length === 0) return 0;
        query = query.in('id', agesLicitacaoIds);
      } else if (isSetorAges) {
        query = query.eq('tipo_licitacao', 'AGES');
      } else if (filters?.tipoLicitacao) {
        query = query.eq('tipo_licitacao', filters.tipoLicitacao);
      }

      if (filters?.search) {
        query = query.or(`titulo.ilike.%${filters.search}%,numero_edital.ilike.%${filters.search}%,orgao.ilike.%${filters.search}%`);
      }
      if (filters?.responsavel) {
        query = query.eq('responsavel_id', filters.responsavel);
      }
      if (filters?.dataInicio) {
        query = query.gte('data_disputa', filters.dataInicio.toISOString());
      }
      if (filters?.dataFim) {
        query = query.lte('data_disputa', filters.dataFim.toISOString());
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    staleTime: 30 * 1000,
  });

  // Função para carregar descartadas sob demanda
  const loadDescartadas = useCallback(async () => {
    setDescartadasLoading(true);
    try {
      let query = supabase
        .from('licitacoes')
        .select(LICITACOES_KANBAN_SELECT)
        .eq('status', 'descarte_edital')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (isGestorAgesOnly && agesLicitacaoIds) {
        if (agesLicitacaoIds.length === 0) {
          setDescartadasData([]);
          setDescartadasLoaded(true);
          setDescartadasLoading(false);
          return;
        }
        query = query.in('id', agesLicitacaoIds);
      } else if (isSetorAges) {
        query = query.eq('tipo_licitacao', 'AGES');
      } else if (filters?.tipoLicitacao) {
        query = query.eq('tipo_licitacao', filters.tipoLicitacao);
      }

      if (filters?.search) {
        query = query.or(`titulo.ilike.%${filters.search}%,numero_edital.ilike.%${filters.search}%,orgao.ilike.%${filters.search}%`);
      }
      if (filters?.responsavel) {
        query = query.eq('responsavel_id', filters.responsavel);
      }
      if (filters?.dataInicio) {
        query = query.gte('data_disputa', filters.dataInicio.toISOString());
      }
      if (filters?.dataFim) {
        query = query.lte('data_disputa', filters.dataFim.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const raw = (data || []) as unknown as LicitacaoWithResponsavel[];

      // Fetch responsavel profiles
      const responsaveisIds = raw.map(l => l.responsavel_id).filter((id): id is string => id !== null);
      let result = raw.map(lic => ({ ...lic, servicos_contrato: Array.isArray(lic.servicos_contrato) ? lic.servicos_contrato as unknown as ServicoContrato[] : [] })) as LicitacaoWithResponsavel[];

      if (responsaveisIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, nome_completo')
          .in('id', responsaveisIds);
        const profMap = new Map(profs?.map(p => [p.id, p]) || []);
        result = result.map(lic => ({
          ...lic,
          responsavel: lic.responsavel_id ? profMap.get(lic.responsavel_id) : null,
        }));
      }

      setDescartadasData(result);
      setDescartadasLoaded(true);
    } catch (err) {
      console.error('Erro ao carregar descartadas:', err);
      toast.error('Erro ao carregar descartadas');
    } finally {
      setDescartadasLoading(false);
    }
  }, [filters, isGestorAgesOnly, isSetorAges, agesLicitacaoIds]);

  // Buscar configuração de cores das etiquetas
  const { data: tagsConfig = [] } = useQuery({
    queryKey: ["licitacoes-etiquetas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes_etiquetas_config")
        .select("nome, cor_id")
        .order("nome");
      if (error) throw error;
      return (data || []).map((t: any) => ({
        name: t?.nome,
        colorId: t?.cor_id,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: any }) => {
      console.log('Updating licitacao status:', { id, status });
      
      // Buscar dados completos da licitação para criar rascunho
      const { data: licitacaoData } = await supabase
        .from('licitacoes')
        .select('*')
        .eq('id', id)
        .single();
      
      const { data, error } = await supabase
        .from('licitacoes')
        .update({ status: status as any, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      
      if (error) {
        console.error('Error updating licitacao:', error);
        throw error;
      }
      
      console.log('Update result:', data);

      // Log activity with old and new values
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const oldStatus = licitacaoData?.status || '';
        const { error: activityError } = await supabase.from('licitacoes_atividades').insert({
          licitacao_id: id,
          user_id: user.id,
          tipo: 'status_alterado',
          descricao: `Status alterado de "${oldStatus}" para "${status}"`,
          campo_alterado: 'status',
          valor_antigo: oldStatus,
          valor_novo: status,
        });
        
        if (activityError) {
          console.error('Error logging activity:', activityError);
        }
      }

      // Criar/Atualizar contrato rascunho quando mover para arrematados
      if (status === 'arrematados' && licitacaoData) {
        // Carregar objeto_contrato (texto puro) sob demanda
        const { data: heavyData } = await supabase
          .from('licitacoes')
          .select('objeto_contrato')
          .eq('id', id)
          .single();

        const overlayJson = {
          titulo: licitacaoData.titulo,
          numero_edital: licitacaoData.numero_edital,
          orgao: licitacaoData.orgao,
          objeto: heavyData?.objeto_contrato || '',
          valor_estimado: licitacaoData.valor_estimado,
          municipio_uf: licitacaoData.municipio_uf,
          tipo_modalidade: licitacaoData.tipo_modalidade,
          subtipo_modalidade: licitacaoData.subtipo_modalidade,
          data_disputa: licitacaoData.data_disputa,
          etiquetas: licitacaoData.etiquetas || [],
          observacoes: licitacaoData.observacoes,
          licitacao_id: id,
        };

        const servicosJson = licitacaoData.servicos_contrato || [];

        // Verificar se já existe rascunho
        const { data: existente } = await supabase
          .from('contrato_rascunho')
          .select('id')
          .eq('licitacao_id', id)
          .eq('status', 'rascunho')
          .maybeSingle();

        if (existente) {
          // Atualizar rascunho existente
          await supabase
            .from('contrato_rascunho')
            .update({
              overlay_json: overlayJson,
              servicos_json: servicosJson,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existente.id);
        } else {
          // Criar novo rascunho
          const { data: novoRascunho } = await supabase
            .from('contrato_rascunho')
            .insert({
              licitacao_id: id,
              overlay_json: overlayJson,
              servicos_json: servicosJson,
              status: 'rascunho',
              status_kanban: 'prospectar',
              created_by: user?.id,
            })
            .select()
            .single();

          // Copiar anexos da licitação para rascunho
          if (novoRascunho) {
            const { data: anexosLicitacao } = await supabase.storage
              .from('licitacoes-anexos')
              .list(id);

            if (anexosLicitacao && anexosLicitacao.length > 0) {
              const anexosParaInserir = anexosLicitacao.map(arquivo => ({
                contrato_rascunho_id: novoRascunho.id,
                arquivo_url: `${id}/${arquivo.name}`,
                arquivo_nome: arquivo.name,
                arquivo_path: `licitacoes-anexos/${id}/${arquivo.name}`,
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

        // Copiar anexos para o pré-contrato real (tabela contratos)
        const { data: preContrato } = await supabase
          .from('contratos')
          .select('id')
          .eq('licitacao_origem_id', id)
          .eq('status_contrato', 'Pre-Contrato')
          .maybeSingle();

        if (preContrato) {
          // Verificar se já tem anexos copiados
          const { data: anexosExistentes } = await supabase
            .from('contrato_anexos')
            .select('id')
            .eq('contrato_id', preContrato.id)
            .limit(1);

          if (!anexosExistentes || anexosExistentes.length === 0) {
            const { data: anexosLicitacao } = await supabase.storage
              .from('licitacoes-anexos')
              .list(id);

            if (anexosLicitacao && anexosLicitacao.length > 0) {
              const anexosParaContrato = anexosLicitacao.map(arquivo => ({
                contrato_id: preContrato.id,
                arquivo_url: `licitacoes-anexos/${id}/${arquivo.name}`,
                arquivo_nome: arquivo.name,
                usuario_id: user?.id,
                usuario_nome: 'Sistema (arrematação automática)',
              }));

              await supabase
                .from('contrato_anexos')
                .insert(anexosParaContrato);
            }
          }
        }
        
        toast.success('Contrato rascunho criado/atualizado automaticamente!');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      queryClient.invalidateQueries({ queryKey: ['contratos-temporarios'] });
      queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes-descartadas-count'] });
      // Resetar cache de descartadas para forçar recarregamento
      setDescartadasLoaded(false);
      setDescartadasData([]);
      toast.success('Status atualizado');
    },
    onError: (error: any) => {
      console.error('Mutation error:', error);
      toast.error(`Erro ao atualizar status: ${error.message || 'Erro desconhecido'}`);
    },
  });

  // Função para verificar se a licitação é prioritária (SC ou valor >= 1M) - apenas para visual
  const isPrioridadeMaster = (licitacao: LicitacaoWithResponsavel) => {
    const valorAlto = (licitacao.valor_estimado || 0) >= 1000000;
    const isSC = licitacao.municipio_uf?.toUpperCase().includes('SC') || 
                 licitacao.municipio_uf?.toUpperCase().includes('SANTA CATARINA');
    return valorAlto || isSC;
  };

  // Ordenação simples: apenas por data_disputa (mais próximas primeiro)
  const sortByDataDisputa = (a: LicitacaoWithResponsavel, b: LicitacaoWithResponsavel) => {
    const dateA = a.data_disputa ? new Date(a.data_disputa).getTime() : Infinity;
    const dateB = b.data_disputa ? new Date(b.data_disputa).getTime() : Infinity;
    return dateA - dateB; // Datas mais próximas primeiro
  };

  const getLicitacoesByStatus = (status: string) => {
    // Descartadas são carregadas sob demanda, não vêm da query principal
    if (status === 'descarte_edital') {
      return descartadasData.sort(sortByDataDisputa);
    }
    const filtered = licitacoes?.filter(lic => lic.status === status) || [];
    // Todas as colunas: ordenação apenas por data_disputa (mais próximas primeiro)
    return filtered.sort(sortByDataDisputa);
  };

  const handleDragStart = (e: React.DragEvent, licitacaoId: string) => {
    e.dataTransfer.setData('licitacaoId', licitacaoId);
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Auto-scroll horizontal durante drag
    if (isDragging) {
      handleAutoScroll(e.clientX);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    stopAutoScroll();
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    // Parar auto-scroll ao soltar
    setIsDragging(false);
    stopAutoScroll();
    
    // Ignore file drops on the column - only handle card drops
    if (e.dataTransfer.types.includes('Files')) {
      return;
    }
    const licitacaoId = e.dataTransfer.getData('licitacaoId');
    console.log('🔍 handleDrop - licitacaoId:', licitacaoId, 'newStatus:', newStatus);
    
    if (licitacaoId && licitacaoId.trim() !== '') {
      const licitacao = licitacoes?.find(l => l.id === licitacaoId) || descartadasData.find(l => l.id === licitacaoId);
      console.log('🔍 handleDrop - licitacao encontrada:', !!licitacao);
      
      // Validação SOMENTE para coluna "arrematados"
      if (newStatus === 'arrematados') {
        if (licitacao) {
          // Carregar objeto_contrato sob demanda (não está no select do kanban)
          const { data: heavyData } = await supabase
            .from('licitacoes')
            .select('objeto_contrato')
            .eq('id', licitacaoId)
            .single();
          
          const licitacaoComObjeto = { ...licitacao, objeto_contrato: heavyData?.objeto_contrato };
          const validacao = isLicitacaoValidaParaMover(licitacaoComObjeto);
          if (!validacao.valido) {
            toast.error(validacao.motivo || "Licitação não pode ser movida. Verifique a aba 'Converter em Contrato'.", {
              duration: 5000,
            });
            return;
          }
        }
      }
      
      // Verificar se é descarte de edital - usar modal específico
      if (newStatus === STATUS_DESCARTE && licitacao) {
        console.log('🔍 handleDrop - iniciando verificação de descarte existente');
        // Verificar se já existe registro de descarte
        supabase
          .from('licitacao_descartes')
          .select('id')
          .eq('licitacao_id', licitacaoId)
          .maybeSingle()
          .then(({ data: descarteExistente, error }) => {
            console.log('🔍 handleDrop - resposta descarte:', { descarteExistente, error });
            if (error) {
              console.error('Erro ao verificar descarte existente:', error);
              // Mesmo com erro, abrir o diálogo para permitir o descarte
              setPendingDrop({ licitacaoId, newStatus });
              setPendingLicitacao(licitacao);
              setDescarteDialogOpen(true);
              return;
            }
            
            if (!descarteExistente) {
              console.log('🔍 handleDrop - abrindo diálogo de descarte');
              // Não há descarte registrado, abrir diálogo
              setPendingDrop({ licitacaoId, newStatus });
              setPendingLicitacao(licitacao);
              setDescarteDialogOpen(true);
            } else {
              console.log('🔍 handleDrop - descarte já existe, atualizando status');
              // Já tem descarte, só atualizar status
              updateStatusMutation.mutate({ id: licitacaoId, status: newStatus });
            }
          });
        return;
      }
      
      // Verificar se o novo status requer resultado de inteligência competitiva
      if (STATUS_REQUER_RESULTADO.includes(newStatus) && licitacao) {
        // Verificar se já existe resultado registrado para esta licitação
        supabase
          .from('licitacao_resultados')
          .select('id')
          .eq('licitacao_id', licitacaoId)
          .maybeSingle()
          .then(({ data: resultadoExistente }) => {
            if (!resultadoExistente) {
              // Não há resultado, abrir diálogo
              setPendingDrop({ licitacaoId, newStatus });
              setPendingLicitacao(licitacao);
              setResultadoDialogOpen(true);
            } else {
              // Já tem resultado, só atualizar status
              updateStatusMutation.mutate({ id: licitacaoId, status: newStatus });
            }
          });
        return;
      }
      
      updateStatusMutation.mutate({ id: licitacaoId, status: newStatus });
    }
  };

  // Handler para confirmar resultado (novo dialog já salva internamente)
  const handleResultadoConfirm = async () => {
    if (!pendingDrop) return;
    
    setResultadoDialogOpen(false);
    
    // Atualizar o status após salvar resultado
    updateStatusMutation.mutate({ id: pendingDrop.licitacaoId, status: pendingDrop.newStatus });
    
    setPendingDrop(null);
    setPendingLicitacao(null);
  };

  const handleResultadoCancel = () => {
    setPendingDrop(null);
    setPendingLicitacao(null);
    setResultadoDialogOpen(false);
  };

  // Handler para confirmar descarte
  const handleDescarteConfirm = async () => {
    if (!pendingDrop) return;
    
    setDescarteDialogOpen(false);
    
    // Atualizar o status após salvar descarte
    updateStatusMutation.mutate({ id: pendingDrop.licitacaoId, status: pendingDrop.newStatus });
    
    setPendingDrop(null);
    setPendingLicitacao(null);
  };

  const handleDescarteCancel = () => {
    setPendingDrop(null);
    setPendingLicitacao(null);
    setDescarteDialogOpen(false);
  };

  const normalizeTagKey = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const tagColorByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tagsConfig as any[]) {
      const key = normalizeTagKey(t?.name);
      if (key) map.set(key, String(t?.colorId ?? ""));
    }
    return map;
  }, [tagsConfig]);

  const getTagColor = (tagName: string) => {
    const key = normalizeTagKey(tagName);
    const colorId = (key && tagColorByKey.get(key)) || "gray";
    return TAG_COLOR_MAP[colorId] || "bg-gray-500";
  };

  const getDiasAteDisputa = (dataDisputa: string | null) => {
    if (!dataDisputa) return null;
    return Math.ceil((new Date(dataDisputa).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  // File upload logic for cards
  const uploadFileToLicitacao = async (licitacaoId: string, file: File) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: profile } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', user.id)
      .single();

    const fileExt = file.name.split('.').pop();
    const fileName = `${licitacaoId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('licitacoes-anexos')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('licitacoes-anexos')
      .getPublicUrl(fileName);

    // Verifica duplicata por nome antes de inserir
    const { data: existingAnexo } = await supabase
      .from('licitacoes_anexos')
      .select('id')
      .eq('licitacao_id', licitacaoId)
      .eq('arquivo_nome', file.name)
      .limit(1);

    if (existingAnexo && existingAnexo.length > 0) {
      const { error: updateError } = await supabase
        .from('licitacoes_anexos')
        .update({
          arquivo_url: publicUrl,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
        })
        .eq('id', existingAnexo[0].id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('licitacoes_anexos')
        .insert({
          licitacao_id: licitacaoId,
          arquivo_nome: file.name,
          arquivo_url: publicUrl,
          usuario_id: user.id,
          usuario_nome: profile?.nome_completo || 'Usuário',
        });
      if (insertError) throw insertError;
    }
  };

  const handleFileDrop = async (e: React.DragEvent, licitacaoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDropTarget(null);

    // Check if it's a file drop (not a card drag)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploadingFiles(licitacaoId);
      try {
        for (const file of Array.from(e.dataTransfer.files)) {
          await uploadFileToLicitacao(licitacaoId, file);
        }
        queryClient.invalidateQueries({ queryKey: ['licitacoes-anexos', licitacaoId] });
        toast.success(`${e.dataTransfer.files.length} arquivo(s) anexado(s)`);
      } catch (error: any) {
        console.error('Error uploading file:', error);
        toast.error(error.message || 'Erro ao anexar arquivo');
      } finally {
        setUploadingFiles(null);
      }
    }
  };

  const handleFileDragOver = (e: React.DragEvent, licitacaoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show drop target if dragging files (not cards)
    if (e.dataTransfer.types.includes('Files')) {
      setFileDropTarget(licitacaoId);
    }
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setFileDropTarget(null);
  };

  if (isLoading) {
    return <div className="p-4">Carregando...</div>;
  }

  return (
    <>
      <div className="flex flex-col min-h-0 h-full">

        <div 
          ref={scrollContainerRef}
          className="flex-1 min-h-0 flex gap-2 sm:gap-3 overflow-x-auto overflow-y-hidden pb-2 px-1"
          onDragOver={handleDragOver}
        >
        {columns.map((column) => (
        <Card 
          key={column.id} 
          className="w-[260px] sm:w-[280px] md:w-[300px] lg:w-[320px] flex-shrink-0 flex flex-col h-full"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div 
                  className="h-2 w-2 rounded-full" 
                  style={{ backgroundColor: column.cor || 'hsl(var(--primary))' }}
                />
                <span>{column.label}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {column.id === 'descarte_edital' ? descartadasCount : getLicitacoesByStatus(column.id).length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden pt-0">
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-3">
                {getLicitacoesByStatus(column.id).map((licitacao) => {
                  const diasAteDisputa = getDiasAteDisputa(licitacao.data_disputa);
                  const isUrgente = diasAteDisputa !== null && diasAteDisputa <= 10 && diasAteDisputa >= 0;
                  const isPrioridadeAltaUsuario = licitacao.prioridade === 'alta';
                  const isPrioritarioMaster = isPrioridadeMaster(licitacao);

                  const isAges = licitacao.tipo_licitacao === 'AGES';
                  
                  // Card vermelho se: SC ou >= 1M ou prioridade alta do usuário
                  const isDestaque = isPrioritarioMaster || isPrioridadeAltaUsuario;

                  return (
                    <Card
                      key={licitacao.id}
                      className={`cursor-move hover:shadow-md transition-all relative ${
                        // AGES: borda azul escura grossa + fundo azul claro + texto preto
                        isAges
                          ? 'bg-blue-100 border-blue-800 border-[4px] dark:bg-blue-900/30 dark:border-blue-600'
                          : // Vermelho se SC, >= 1M ou prioridade alta
                            isDestaque 
                            ? 'bg-red-50 border-red-500 border-2 dark:bg-red-950/30' 
                            : ''
                      } ${
                        isUrgente && !isAges && !isDestaque 
                          ? 'border-destructive border-2' 
                          : ''
                      } ${
                        fileDropTarget === licitacao.id ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''
                      } ${
                        uploadingFiles === licitacao.id ? 'opacity-70' : ''
                      }`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, licitacao.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleFileDragOver(e, licitacao.id)}
                      onDragLeave={handleFileDragLeave}
                      onDrop={(e) => {
                        // Check if it's a file drop
                        if (e.dataTransfer.types.includes('Files')) {
                          handleFileDrop(e, licitacao.id);
                        }
                      }}
                      onClick={async () => {
                        if (onCardClick) {
                          try {
                            const { data: heavy } = await supabase
                              .from('licitacoes')
                              .select(LICITACOES_HEAVY_COLUMNS)
                              .eq('id', licitacao.id)
                              .single();
                            onCardClick({ ...licitacao, ...heavy });
                          } catch {
                            // Fallback: abrir com dados disponíveis
                            onCardClick(licitacao);
                          }
                        }
                      }}
                      onDoubleClick={() => onCardDoubleClick?.(licitacao)}
                    >
                      {/* File drop overlay */}
                      {fileDropTarget === licitacao.id && (
                        <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center z-10 pointer-events-none">
                          <div className="flex flex-col items-center gap-1 text-primary">
                            <Paperclip className="h-6 w-6" />
                            <span className="text-xs font-medium">Soltar arquivo</span>
                          </div>
                        </div>
                      )}
                      {uploadingFiles === licitacao.id && (
                        <div className="absolute inset-0 bg-background/80 rounded-lg flex items-center justify-center z-10">
                          <span className="text-xs text-muted-foreground">Enviando...</span>
                        </div>
                      )}
                      <CardContent className="p-3 space-y-2">
                        {/* Menu 3 pontinhos no canto superior direito */}
                        <div className="absolute top-1 right-1 z-20" onClick={(e) => e.stopPropagation()}>
                          <CardActionsMenu
                            tipo="licitacao"
                            recursoId={licitacao.id}
                            label={licitacao.titulo || licitacao.numero_edital || licitacao.orgao || "Licitação"}
                          />
                        </div>

                        {/* Badge de Validação */}

                        {/* Etiquetas */}
                        {licitacao.etiquetas && licitacao.etiquetas.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {licitacao.etiquetas.map((tag: string, idx: number) => (
                              <span
                                key={idx} 
                                className={`${getTagColor(tag)} text-white text-xs px-2 py-0.5 rounded-full font-medium`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Título e Badges */}
                        <div className="space-y-1">
                          <h4 className="font-semibold text-sm line-clamp-2">
                            {licitacao.titulo || licitacao.numero_edital}
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {isDestaque && (
                              <Badge className="text-xs bg-red-500 hover:bg-red-600">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Prioridade
                              </Badge>
                            )}
                            {isUrgente && (
                              <Badge variant="destructive" className="text-xs">
                                <Clock className="mr-1 h-3 w-3" />
                                {diasAteDisputa} dias
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Orgão */}
                        {licitacao.orgao && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {licitacao.orgao}
                          </p>
                        )}

                        {/* Informações principais */}
                        <div className="space-y-1.5 text-xs">
                          {licitacao.municipio_uf && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{licitacao.municipio_uf}</span>
                            </div>
                          )}

                          {licitacao.valor_estimado && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <DollarSign className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                }).format(licitacao.valor_estimado)}
                              </span>
                            </div>
                          )}

                          {licitacao.data_disputa && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {format(new Date(licitacao.data_disputa), 'dd/MM/yyyy HH:mm')}
                              </span>
                            </div>
                          )}

                          {licitacao.responsavel && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <User className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{licitacao.responsavel.nome_completo}</span>
                            </div>
                          )}
                        </div>

                        {/* Modalidade */}
                        {licitacao.subtipo_modalidade && (
                          <Badge variant="outline" className="text-xs">
                            {licitacao.subtipo_modalidade}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                
                {/* Botão de carregamento sob demanda para descartadas */}
                {column.id === 'descarte_edital' && !descartadasLoaded && (
                  <div className="text-center py-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadDescartadas}
                      disabled={descartadasLoading}
                      className="w-full"
                    >
                      {descartadasLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>Carregar descartadas ({descartadasCount})</>
                      )}
                    </Button>
                  </div>
                )}

                {/* Estado vazio para colunas normais ou descartadas já carregadas */}
                {getLicitacoesByStatus(column.id).length === 0 && (column.id !== 'descarte_edital' || descartadasLoaded) && (
                  <div className="text-center text-sm text-muted-foreground py-6">
                    Nenhuma licitação
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
        </div>
      </div>
      
      {/* Dialog de Resultado para Inteligência Competitiva */}
      <LicitacaoResultadoItensDialog
        open={resultadoDialogOpen}
        onOpenChange={setResultadoDialogOpen}
        licitacaoId={pendingDrop?.licitacaoId || ''}
        novoStatus={pendingDrop?.newStatus || ''}
        licitacaoTitulo={pendingLicitacao?.titulo || pendingLicitacao?.numero_edital || ''}
        onConfirm={handleResultadoConfirm}
        onCancel={handleResultadoCancel}
      />

      {/* Dialog de Descarte de Edital */}
      <LicitacaoDescarteDialog
        open={descarteDialogOpen}
        onOpenChange={setDescarteDialogOpen}
        licitacao={pendingLicitacao}
        onConfirm={handleDescarteConfirm}
        onCancel={handleDescarteCancel}
      />
    </>
  );
}
