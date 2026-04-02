import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Search, FileSpreadsheet, ArrowUpDown, Check, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileUpload } from "./FileUpload";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toLocalTime } from "@/lib/dateUtils";
import { PendenciaDetailModal } from "./PendenciaDetailModal";
import { PendenciasMetrics } from "./PendenciasMetrics";
import { ImportarPendenciasDialog } from "./ImportarPendenciasDialog";

interface RegistroForm {
  cliente_id: string;
  medico_id: string;
  segmento: "RX" | "TC" | "US" | "RM" | "MM";
  nivel_urgencia: "pronto_socorro" | "internados" | "baixa";
  data_deteccao: string;
  data_referencia: string;
  quantidade_pendente?: number;
  descricao_inicial?: string;
  status_pendencia: string;
  prazo_limite_sla: string;
  observacoes_internas: string;
  anexos: string[];
}

// SLA legacy (nivel_urgencia)
const SLA_HORAS_LEGACY: Record<string, number> = {
  pronto_socorro: 2,
  internados: 4,
  baixa: 48,
};

// SLA novo (campo sla)
const SLA_LABELS: Record<string, string> = {
  "Pronto Socorro": "Pronto Socorro (2h)",
  "Alta": "Alta (2h)",
  "Internado": "Internado (4h)",
  "Atendimento Ambulatorial": "Ambulatorial (48h)",
};

const NIVEL_URGENCIA_LABELS: Record<string, string> = {
  pronto_socorro: "Pronto Socorro (SLA: 2h)",
  internados: "Internados (SLA: 4h)",
  baixa: "Baixa (SLA: 48h)",
};

// Função híbrida que prioriza sla_horas (novo) mas usa nivel_urgencia como fallback
const getSlaHoras = (registro: any): number => {
  if (registro.sla_horas) return registro.sla_horas;
  return SLA_HORAS_LEGACY[registro.nivel_urgencia || "internados"] || 4;
};

// Exibir SLA de forma amigável
const getDisplaySla = (registro: any): string => {
  if (registro.sla) return SLA_LABELS[registro.sla] || registro.sla;
  return NIVEL_URGENCIA_LABELS[registro.nivel_urgencia || "internados"];
};

// Calcular validade (data de expiração do SLA) - usar prazo_limite_sla se existir
const getValidade = (registro: any): Date => {
  // Usar prazo_limite_sla do banco se existir
  if (registro.prazo_limite_sla) {
    return new Date(registro.prazo_limite_sla);
  }
  // Fallback: calcular baseado em data_deteccao + SLA horas
  const slaHoras = getSlaHoras(registro);
  return new Date(new Date(registro.data_deteccao).getTime() + slaHoras * 60 * 60 * 1000);
};

// Formatar tempo restante em horas e minutos
const formatTempoRestante = (validade: Date, isResolvida: boolean): string => {
  if (isResolvida) return "Resolvida";
  
  const agora = new Date();
  const diffMs = validade.getTime() - agora.getTime();
  
  if (diffMs <= 0) {
    // Vencido - mostrar quanto tempo atrás venceu
    const atrasoMs = Math.abs(diffMs);
    const atrasoHoras = Math.floor(atrasoMs / (1000 * 60 * 60));
    const atrasoMin = Math.floor((atrasoMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (atrasoHoras >= 24) {
      const dias = Math.floor(atrasoHoras / 24);
      const horasRestantes = atrasoHoras % 24;
      return `-${dias}d ${horasRestantes}h`;
    }
    return `-${atrasoHoras}h ${atrasoMin}min`;
  }
  
  // Tempo restante
  const horasRestantes = Math.floor(diffMs / (1000 * 60 * 60));
  const minRestantes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (horasRestantes >= 24) {
    const dias = Math.floor(horasRestantes / 24);
    const horas = horasRestantes % 24;
    return `${dias}d ${horas}h`;
  }
  return `${horasRestantes}h ${minRestantes}min`;
};

interface AbaPendenciasAtrasosProps {
  clienteIdFilter?: string;
  dataFilter?: string;
}

export function AbaPendenciasAtrasos({ clienteIdFilter, dataFilter }: AbaPendenciasAtrasosProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPendenciaId, setSelectedPendenciaId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [segmentoFilter, setSegmentoFilter] = useState<string | null>(null);
  const [medicoFilter, setMedicoFilter] = useState<string | null>(null);
  const [urgenciaFilter, setUrgenciaFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<'medico' | 'segmento' | 'status' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Filtros de cards de métricas
  const [activeMetricFilter, setActiveMetricFilter] = useState<string | null>(null);
  const [activeSegmentoFilter, setActiveSegmentoFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

  const [formData, setFormData] = useState<RegistroForm>({
    cliente_id: "",
    medico_id: "",
    segmento: "RX" as const,
    nivel_urgencia: "internados" as const,
    data_deteccao: new Date().toISOString(),
    data_referencia: new Date().toISOString().split('T')[0],
    quantidade_pendente: 1,
    descricao_inicial: "",
    status_pendencia: "aberta",
    prazo_limite_sla: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    observacoes_internas: "",
    anexos: [],
  });

  // Buscar apenas pendências ABERTAS (não resolvidas) para a lista - com paginação
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ["radiologia-pendencias-abertas", clienteIdFilter, dataFilter],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("radiologia_pendencias")
          .select(`
            *,
            clientes:cliente_id (nome_empresa),
            medicos!medico_id (nome_completo, email),
            medico_atribuido:medicos!medico_atribuido_id (nome_completo, email)
          `)
          .neq("status_pendencia", "resolvida")
          .order("data_deteccao", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (clienteIdFilter) {
          query = query.eq("cliente_id", clienteIdFilter);
        }

        if (dataFilter) {
          const startOfDay = `${dataFilter}T00:00:00`;
          const endOfDay = `${dataFilter}T23:59:59`;
          query = query.gte("data_deteccao", startOfDay).lte("data_deteccao", endOfDay);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      return allData;
    },
  });

  // Query para dados agrupados - busca TODOS os registros para contabilização correta
  const { data: groupedDataFromDb } = useQuery({
    queryKey: ["radiologia-grouped-data", clienteIdFilter, dataFilter, viewMode],
    queryFn: async () => {
      if (viewMode !== 'grouped') return null;

      // Buscar TODAS as pendências abertas usando paginação (limite padrão do Supabase é 1000)
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("radiologia_pendencias")
          .select(`
            cliente_id,
            medico_id,
            clientes:cliente_id (nome_empresa),
            medicos!medico_id (nome_completo)
          `)
          .eq("status_pendencia", "aberta")
          .range(offset, offset + PAGE_SIZE - 1);

        if (clienteIdFilter) {
          query = query.eq("cliente_id", clienteIdFilter);
        }

        if (dataFilter) {
          const startOfDay = `${dataFilter}T00:00:00`;
          const endOfDay = `${dataFilter}T23:59:59`;
          query = query.gte("data_deteccao", startOfDay).lte("data_deteccao", endOfDay);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Agrupar por cliente e médico
      const byCliente: Record<string, {
        cliente: string;
        clienteId: string;
        medicos: Record<string, { nome: string; count: number }>;
      }> = {};

      allData.forEach((r: any) => {
        const clienteNome = r.clientes?.nome_empresa || 'Sem cliente';
        const clienteId = r.cliente_id || 'null';
        const medicoNome = r.medicos?.nome_completo || 'Sem médico';
        
        if (!byCliente[clienteId]) {
          byCliente[clienteId] = { cliente: clienteNome, clienteId, medicos: {} };
        }
        if (!byCliente[clienteId].medicos[medicoNome]) {
          byCliente[clienteId].medicos[medicoNome] = { nome: medicoNome, count: 0 };
        }
        byCliente[clienteId].medicos[medicoNome].count++;
      });

      return Object.values(byCliente)
        .map(c => ({
          ...c,
          medicosArray: Object.values(c.medicos).sort((a, b) => b.count - a.count),
          total: Object.values(c.medicos).reduce((acc, m) => acc + m.count, 0)
        }))
        .sort((a, b) => b.total - a.total);
    },
    enabled: viewMode === 'grouped',
  });

  // Query agregada para métricas (contagens direto no banco)
  const { data: metricsData } = useQuery({
    queryKey: ["radiologia-metrics-agregadas", clienteIdFilter],
    queryFn: async () => {
      // Total de abertas
      let queryAbertas = supabase
        .from("radiologia_pendencias")
        .select("id", { count: "exact", head: true })
        .eq("status_pendencia", "aberta");
      if (clienteIdFilter) queryAbertas = queryAbertas.eq("cliente_id", clienteIdFilter);
      const { count: totalAbertas } = await queryAbertas;

      // Total de resolvidas
      let queryResolvidas = supabase
        .from("radiologia_pendencias")
        .select("id", { count: "exact", head: true })
        .eq("status_pendencia", "resolvida");
      if (clienteIdFilter) queryResolvidas = queryResolvidas.eq("cliente_id", clienteIdFilter);
      const { count: totalResolvidas } = await queryResolvidas;

      // Resolvidas hoje
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      let queryResolvidasHoje = supabase
        .from("radiologia_pendencias")
        .select("id", { count: "exact", head: true })
        .eq("status_pendencia", "resolvida")
        .gte("data_resolucao", hoje.toISOString());
      if (clienteIdFilter) queryResolvidasHoje = queryResolvidasHoje.eq("cliente_id", clienteIdFilter);
      const { count: resolvidasHoje } = await queryResolvidasHoje;

      // Contagem por segmento
      const segmentos = ["RX", "TC", "US", "RM", "MM"] as const;
      const resumoSegmento = await Promise.all(
        segmentos.map(async (seg) => {
          let qAbertas = supabase
            .from("radiologia_pendencias")
            .select("id", { count: "exact", head: true })
            .eq("segmento", seg)
            .eq("status_pendencia", "aberta");
          if (clienteIdFilter) qAbertas = qAbertas.eq("cliente_id", clienteIdFilter);

          let qResolvidas = supabase
            .from("radiologia_pendencias")
            .select("id", { count: "exact", head: true })
            .eq("segmento", seg)
            .eq("status_pendencia", "resolvida");
          if (clienteIdFilter) qResolvidas = qResolvidas.eq("cliente_id", clienteIdFilter);

          const [{ count: abertas }, { count: resolvidas }] = await Promise.all([
            qAbertas,
            qResolvidas,
          ]);

          return { segmento: seg, abertas: abertas || 0, resolvidas: resolvidas || 0 };
        })
      );

      // Médico com mais pendências - buscar TODAS usando paginação
      const PAGE_SIZE_MEDICO = 1000;
      let allMedicoData: any[] = [];
      let offsetMedico = 0;
      let hasMoreMedico = true;

      while (hasMoreMedico) {
        let queryMedicoPendencias = supabase
          .from("radiologia_pendencias")
          .select("medico_id, medicos!medico_id(nome_completo)")
          .eq("status_pendencia", "aberta")
          .not("medico_id", "is", null)
          .range(offsetMedico, offsetMedico + PAGE_SIZE_MEDICO - 1);
        
        if (clienteIdFilter) {
          queryMedicoPendencias = queryMedicoPendencias.eq("cliente_id", clienteIdFilter);
        }
        
        const { data: pendenciasComMedico } = await queryMedicoPendencias;
        
        if (pendenciasComMedico && pendenciasComMedico.length > 0) {
          allMedicoData = [...allMedicoData, ...pendenciasComMedico];
          offsetMedico += PAGE_SIZE_MEDICO;
          hasMoreMedico = pendenciasComMedico.length === PAGE_SIZE_MEDICO;
        } else {
          hasMoreMedico = false;
        }
      }
      
      let medicoMaisPendencias: { nome: string; quantidade: number } | null = null;
      if (allMedicoData.length > 0) {
        const countByMedico: Record<string, { nome: string; count: number }> = {};
        allMedicoData.forEach((p: any) => {
          const medicoId = p.medico_id;
          const medicoNome = p.medicos?.nome_completo || "Sem médico";
          if (!countByMedico[medicoId]) {
            countByMedico[medicoId] = { nome: medicoNome, count: 0 };
          }
          countByMedico[medicoId].count++;
        });
        const sorted = Object.values(countByMedico).sort((a, b) => b.count - a.count);
        if (sorted.length > 0) {
          medicoMaisPendencias = { nome: sorted[0].nome, quantidade: sorted[0].count };
        }
      }

      // Calcular tempo médio de resolução (data_deteccao → data_final)
      // Buscar pendências resolvidas com data_final preenchida para cálculo
      let tempoMedioResolucao: string | null = null;
      let queryTempoMedio = supabase
        .from("radiologia_pendencias")
        .select("data_deteccao, data_final")
        .eq("status_pendencia", "resolvida")
        .not("data_final", "is", null)
        .not("data_deteccao", "is", null)
        .limit(500); // Amostra para cálculo
      if (clienteIdFilter) queryTempoMedio = queryTempoMedio.eq("cliente_id", clienteIdFilter);
      const { data: resolvidasParaTempo } = await queryTempoMedio;
      
      if (resolvidasParaTempo && resolvidasParaTempo.length > 0) {
        const totalHoras = resolvidasParaTempo.reduce((acc, p) => {
          const dataFinal = new Date(p.data_final!);
          const dataDeteccao = new Date(p.data_deteccao);
          const diffHoras = (dataFinal.getTime() - dataDeteccao.getTime()) / (1000 * 60 * 60);
          return acc + diffHoras;
        }, 0);
        const mediaHoras = totalHoras / resolvidasParaTempo.length;
        const dias = Math.floor(mediaHoras / 24);
        const horas = Math.round(mediaHoras % 24);
        tempoMedioResolucao = dias > 0 ? `${dias}d ${horas}h` : `${horas}h`;
      }

      return {
        totalAbertas: totalAbertas || 0,
        totalResolvidas: totalResolvidas || 0,
        resolvidasHoje: resolvidasHoje || 0,
        resumoSegmento,
        medicoMaisPendencias,
        tempoMedioResolucao,
      };
    },
  });

  // Buscar clientes ativos
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome_empresa")
        .eq("status_cliente", "Ativo")
        .order("nome_empresa");

      if (error) throw error;
      return data;
    },
  });

  // Buscar médicos ativos
  const { data: medicos = [] } = useQuery({
    queryKey: ["medicos-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome_completo, email")
        .eq("status_medico", "Ativo")
        .order("nome_completo");

      if (error) throw error;
      return data;
    },
  });

  // Atualizar prazo SLA quando nível de urgência mudar
  const handleNivelUrgenciaChange = (nivel: string) => {
    const slaHoras = SLA_HORAS_LEGACY[nivel] || 4;
    // Usar a data de detecção como base para o cálculo do SLA
    const dataBase = formData.data_deteccao ? new Date(formData.data_deteccao) : new Date();
    const novoPrazo = new Date(dataBase.getTime() + slaHoras * 60 * 60 * 1000).toISOString();
    setFormData({ ...formData, nivel_urgencia: nivel as any, prazo_limite_sla: novoPrazo });
  };

  // Recalcular SLA quando a data de detecção mudar
  const handleDataDeteccaoChange = (novaData: string) => {
    const slaHoras = SLA_HORAS_LEGACY[formData.nivel_urgencia] || 4;
    const dataBase = new Date(novaData);
    const novoPrazo = new Date(dataBase.getTime() + slaHoras * 60 * 60 * 1000).toISOString();
    setFormData({ ...formData, data_deteccao: novaData, prazo_limite_sla: novoPrazo });
  };

  // Mutation para criar/atualizar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .single();

      const slaHorasSave = SLA_HORAS_LEGACY[formData.nivel_urgencia] || 4;
      const baseDate = new Date(formData.data_deteccao);
      const computedPrazo = new Date(baseDate.getTime() + slaHorasSave * 60 * 60 * 1000).toISOString();

      const dataToSave = {
        ...formData,
        tipo_registro: "pendencia",
        prazo_limite_sla: computedPrazo,
      };
      // Cast para any para contornar incompatibilidade de tipo temporária
      // até que o enum do banco seja atualizado
      const dataForDb = dataToSave as any;
      
      if (editingId) {
        const { error } = await supabase
          .from("radiologia_pendencias")
          .update({
            ...dataForDb,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);

        if (error) throw error;

        await supabase.from("radiologia_pendencias_historico").insert({
          pendencia_id: editingId,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || "Usuário",
          acao: "registro_atualizado",
          detalhes: "Registro atualizado",
        });
      } else {
        const { data: newRegistro, error } = await supabase
          .from("radiologia_pendencias")
          .insert([dataForDb])
          .select()
          .single();

        if (error) throw error;

        await supabase.from("radiologia_pendencias_historico").insert({
          pendencia_id: newRegistro.id,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || "Usuário",
          acao: "pendencia_criada",
          detalhes: "Pendência criada",
        });

        if (newRegistro.medico_id) {
          const medico = medicos.find((m) => m.id === newRegistro.medico_id);
          const cliente = clientes.find((c) => c.id === newRegistro.cliente_id);

          if (medico && cliente) {
            await supabase.functions.invoke("notify-radiologia-pendencia", {
              body: {
                pendenciaId: newRegistro.id,
                medicoEmail: medico.email,
                medicoNome: medico.nome_completo,
                clienteNome: cliente.nome_empresa,
                segmento: newRegistro.segmento,
                quantidadePendente: newRegistro.quantidade_pendente,
                descricaoInicial: newRegistro.descricao_inicial,
                prazoLimiteSla: newRegistro.prazo_limite_sla,
              },
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias-atrasos"] });
      resetForm();
      setDialogOpen(false);
      toast({ title: `Registro ${editingId ? "atualizado" : "criado"} com sucesso!` });
    },
    onError: (error) => {
      toast({
        title: `Erro ao ${editingId ? "atualizar" : "criar"} registro`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para deletar
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("radiologia_pendencias")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias-atrasos"] });
      toast({ title: "Registro removido com sucesso!" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover registro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      cliente_id: "",
      medico_id: "",
      segmento: "RX" as const,
      nivel_urgencia: "internados" as const,
      data_deteccao: new Date().toISOString(),
      data_referencia: new Date().toISOString().split('T')[0],
      quantidade_pendente: 1,
      descricao_inicial: "",
      status_pendencia: "aberta",
      prazo_limite_sla: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      observacoes_internas: "",
      anexos: [],
    });
    setEditingId(null);
  };

  const handleEdit = (registro: any) => {
    setFormData({
      cliente_id: registro.cliente_id,
      medico_id: registro.medico_id,
      segmento: registro.segmento as "RX" | "TC" | "US" | "RM" | "MM",
      nivel_urgencia: registro.nivel_urgencia || "internados",
      data_deteccao: registro.data_deteccao,
      data_referencia: registro.data_referencia || new Date(registro.data_deteccao).toISOString().split('T')[0],
      quantidade_pendente: registro.quantidade_pendente || 1,
      descricao_inicial: registro.descricao_inicial || "",
      status_pendencia: registro.status_pendencia,
      prazo_limite_sla: registro.prazo_limite_sla,
      observacoes_internas: registro.observacoes_internas || "",
      anexos: registro.anexos || [],
    });
    setEditingId(registro.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  // Métricas calculadas - agora usando dados agregados do banco + cálculos locais para SLA
  const metrics = useMemo(() => {
    // SLA vencido - calculado dos registros abertas que temos localmente
    const pendenciasVencidas = registros.filter((p) => {
      const slaHoras = getSlaHoras(p);
      const validadeCalc = new Date(new Date(p.data_deteccao).getTime() + slaHoras * 60 * 60 * 1000);
      return new Date() > validadeCalc;
    }).length;

    return {
      totalPendenciasAbertas: metricsData?.totalAbertas || registros.length,
      totalResolvidas: metricsData?.totalResolvidas || 0,
      pendenciasResolvidasHoje: metricsData?.resolvidasHoje || 0,
      pendenciasVencidas,
      tempoMedioResolucao: metricsData?.tempoMedioResolucao || "N/A",
      // Usar médico calculado do banco (conta TODAS as pendências, não só as 1000 primeiras)
      medicoMaisPendencias: metricsData?.medicoMaisPendencias || null,
    };
  }, [registros, metricsData]);

  // Resumo por segmento - agora usando dados agregados do banco
  const resumoSegmento = useMemo(() => {
    if (metricsData?.resumoSegmento) {
      return metricsData.resumoSegmento;
    }
    // Fallback para cálculo local se dados agregados não disponíveis
    const segmentos = ["RX", "TC", "US", "RM", "MM"];
    return segmentos.map((seg) => {
      const abertas = registros.filter(
        (p) => p.segmento === seg
      ).length;
      return { segmento: seg, abertas, resolvidas: 0, emAnalise: 0 };
    });
  }, [registros, metricsData]);

  // Computed values para filtros de coluna com contagem
  const medicosWithCount = useMemo(() => {
    const countMap: Record<string, { nome: string; count: number }> = {};
    registros.forEach(p => {
      const medico = p.medicos?.nome_completo || 'Médico não informado';
      if (!countMap[medico]) {
        countMap[medico] = { nome: medico, count: 0 };
      }
      countMap[medico].count++;
    });
    return Object.values(countMap).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [registros]);

  const segmentosWithCount = useMemo(() => {
    const countMap: Record<string, number> = {};
    registros.forEach(p => {
      const seg = p.segmento || 'N/A';
      countMap[seg] = (countMap[seg] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([seg, count]) => ({ segmento: seg, count }))
      .sort((a, b) => a.segmento.localeCompare(b.segmento));
  }, [registros]);

  const statusWithCount = useMemo(() => {
    const countMap: Record<string, number> = {};
    registros.forEach(p => {
      const status = p.status_pendencia || 'aberta';
      countMap[status] = (countMap[status] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status.localeCompare(b.status, 'pt-BR'));
  }, [registros]);

  // Filtros + ordenação por favoritos
  const filteredRegistros = useMemo(() => {
    let filtered = registros.filter((p) => {
      const matchSearch =
        (p.clientes?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        (p.medicos?.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        (p.exame?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      const matchStatus = !statusFilter || p.status_pendencia === statusFilter;
      const matchSegmento = !segmentoFilter || p.segmento === segmentoFilter;
      const matchMedico = !medicoFilter || (p.medicos?.nome_completo || 'Médico não informado') === medicoFilter;
      const matchUrgencia = urgenciaFilter === "all" || (p.sla?.toLowerCase().includes(urgenciaFilter.toLowerCase()) ?? false);
      // Aplicar filtro de segmento do badge
      const matchActiveSegmento = !activeSegmentoFilter || p.segmento === activeSegmentoFilter;
      return matchSearch && matchStatus && matchSegmento && matchMedico && matchUrgencia && matchActiveSegmento;
    });

    // Aplicar filtros de cards de métricas
    if (activeMetricFilter === 'sla_vencido') {
      filtered = filtered.filter((p) => {
        const slaHoras = getSlaHoras(p);
        const validadeCalc = new Date(new Date(p.data_deteccao).getTime() + slaHoras * 60 * 60 * 1000);
        return new Date() > validadeCalc;
      });
    }
    
    // Ordenação por campo selecionado
    let sorted = [...filtered];
    
    // Se filtro de médico_pendencias está ativo, ordenar por médico com mais pendências
    if (activeMetricFilter === 'medico_pendencias') {
      // Contar pendências por médico
      const countByMedico: Record<string, number> = {};
      sorted.forEach(p => {
        const medicoNome = p.medicos?.nome_completo || 'Sem médico';
        countByMedico[medicoNome] = (countByMedico[medicoNome] || 0) + 1;
      });
      // Ordenar pelo médico com mais pendências
      sorted.sort((a, b) => {
        const aCount = countByMedico[a.medicos?.nome_completo || 'Sem médico'] || 0;
        const bCount = countByMedico[b.medicos?.nome_completo || 'Sem médico'] || 0;
        if (bCount !== aCount) return bCount - aCount; // Mais pendências primeiro
        // Desempate: ordenar por nome do médico
        return (a.medicos?.nome_completo || '').localeCompare(b.medicos?.nome_completo || '', 'pt-BR');
      });
      return sorted;
    }

    // Se filtro de segmento está ativo, ordenar por cliente > médico
    if (activeSegmentoFilter) {
      // Contar por cliente
      const countByCliente: Record<string, number> = {};
      sorted.forEach(p => {
        const clienteNome = p.clientes?.nome_empresa || 'Sem cliente';
        countByCliente[clienteNome] = (countByCliente[clienteNome] || 0) + 1;
      });
      // Ordenar por cliente com mais pendências, depois por médico
      sorted.sort((a, b) => {
        const aCliente = a.clientes?.nome_empresa || 'Sem cliente';
        const bCliente = b.clientes?.nome_empresa || 'Sem cliente';
        const aCount = countByCliente[aCliente] || 0;
        const bCount = countByCliente[bCliente] || 0;
        if (bCount !== aCount) return bCount - aCount; // Cliente com mais pendências primeiro
        if (aCliente !== bCliente) return aCliente.localeCompare(bCliente, 'pt-BR');
        // Mesmo cliente: ordenar por médico
        return (a.medicos?.nome_completo || '').localeCompare(b.medicos?.nome_completo || '', 'pt-BR');
      });
      return sorted;
    }

    if (sortField) {
      sorted.sort((a, b) => {
        let aVal = '';
        let bVal = '';
        
        if (sortField === 'medico') {
          aVal = a.medicos?.nome_completo || '';
          bVal = b.medicos?.nome_completo || '';
        } else if (sortField === 'segmento') {
          aVal = a.segmento || '';
          bVal = b.segmento || '';
        } else if (sortField === 'status') {
          aVal = a.status_pendencia || '';
          bVal = b.status_pendencia || '';
        }
        
        const comparison = aVal.localeCompare(bVal, 'pt-BR');
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    // Status aberto primeiro, depois por data de entrada (mais antigas primeiro)
    return sorted.sort((a, b) => {
      if (!sortField) {
        // Priorizar status aberta (pendências em aberto primeiro)
        const aAberta = a.status_pendencia === "aberta" ? 0 : 1;
        const bAberta = b.status_pendencia === "aberta" ? 0 : 1;
        if (aAberta !== bAberta) return aAberta - bAberta;
        
        // Ordenação por data de entrada (mais antigas primeiro)
        return new Date(a.data_deteccao).getTime() - new Date(b.data_deteccao).getTime();
      }
      return 0;
    });
  }, [registros, searchTerm, statusFilter, segmentoFilter, medicoFilter, urgenciaFilter, sortField, sortDirection, activeMetricFilter, activeSegmentoFilter]);

  // Dados agrupados para visualização - usa dados do banco para contabilização correta
  const groupedData = useMemo(() => {
    if (viewMode !== 'grouped') return null;
    
    // Usar dados do banco quando disponível (contabiliza TODAS as pendências)
    if (groupedDataFromDb) {
      return groupedDataFromDb;
    }

    // Fallback para dados locais (limitado a 1000 registros)
    const byCliente: Record<string, {
      cliente: string;
      medicos: Record<string, { nome: string; count: number; registros: typeof filteredRegistros }>;
    }> = {};

    filteredRegistros.forEach(r => {
      const clienteNome = r.clientes?.nome_empresa || 'Sem cliente';
      const medicoNome = r.medicos?.nome_completo || 'Sem médico';
      
      if (!byCliente[clienteNome]) {
        byCliente[clienteNome] = { cliente: clienteNome, medicos: {} };
      }
      if (!byCliente[clienteNome].medicos[medicoNome]) {
        byCliente[clienteNome].medicos[medicoNome] = { nome: medicoNome, count: 0, registros: [] };
      }
      byCliente[clienteNome].medicos[medicoNome].count++;
      byCliente[clienteNome].medicos[medicoNome].registros.push(r);
    });

    return Object.values(byCliente)
      .map(c => ({
        ...c,
        medicosArray: Object.values(c.medicos).sort((a, b) => b.count - a.count),
        total: Object.values(c.medicos).reduce((acc, m) => acc + m.count, 0)
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRegistros, viewMode, groupedDataFromDb]);

  const statusColors: Record<string, string> = {
    aberta: "bg-gray-500",
    em_analise: "bg-yellow-500",
    encaminhada_medico: "bg-blue-500",
    aguardando_laudo: "bg-purple-500",
    resolvida: "bg-green-500",
  };

  const statusLabels: Record<string, string> = {
    aberta: "Aberta",
    em_analise: "Em Análise",
    encaminhada_medico: "Encaminhada ao Médico",
    aguardando_laudo: "Aguardando Laudo",
    resolvida: "Resolvida",
  };

  const urgenciaColors: Record<string, string> = {
    pronto_socorro: "bg-red-500",
    internados: "bg-yellow-500",
    oncologicos: "bg-blue-500",
  };

  const slaColors: Record<string, string> = {
    "Pronto Socorro": "bg-red-500",
    "Alta": "bg-red-500",
    "Internado": "bg-yellow-500",
    "Atendimento Ambulatorial": "bg-blue-500",
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter(null);
    setSegmentoFilter(null);
    setMedicoFilter(null);
    setUrgenciaFilter("all");
    setSortField(null);
    setSortDirection("asc");
    setActiveMetricFilter(null);
    setActiveSegmentoFilter(null);
    setViewMode("list");
  };

  const handleMetricFilterClick = (filterId: string) => {
    if (activeMetricFilter === filterId) {
      clearAllFilters();
      return;
    }

    setActiveMetricFilter(filterId);
    setActiveSegmentoFilter(null);
    setSegmentoFilter(null);
    setMedicoFilter(null);
    setStatusFilter(null);
    setSortField(null);
    setSortDirection("asc");

    setViewMode(filterId === "medico_pendencias" ? "grouped" : "list");
  };

  const handleSegmentoFilterClick = (segmento: string) => {
    if (activeSegmentoFilter === segmento) {
      clearAllFilters();
      return;
    }

    setActiveSegmentoFilter(segmento);
    setSegmentoFilter(segmento);
    setActiveMetricFilter(null);
    setMedicoFilter(null);
    setStatusFilter(null);
    setSortField(null);
    setSortDirection("asc");
    setViewMode("list");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <PendenciasMetrics 
        {...metrics} 
        activeFilter={activeMetricFilter}
        onFilterClick={handleMetricFilterClick}
      />

      <div className="flex gap-2 flex-wrap">
        {resumoSegmento.map((item) => {
          const isActive = activeSegmentoFilter === item.segmento;
          return (
            <Badge 
              key={item.segmento} 
              variant={isActive ? "default" : "outline"} 
              className={`px-4 py-2 cursor-pointer transition-all hover:scale-105 ${
                isActive ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => handleSegmentoFilterClick(item.segmento)}
            >
              <span className="font-bold">{item.segmento}:</span>
              <span className={`ml-2 ${isActive ? "text-white" : "text-gray-600"}`}>{item.abertas} abertas</span>
              <span className={`ml-2 ${isActive ? "text-white" : "text-green-600"}`}>{item.resolvidas} resolvidas</span>
            </Badge>
          );
        })}
        {(activeMetricFilter || activeSegmentoFilter || statusFilter || segmentoFilter || medicoFilter || searchTerm || urgenciaFilter !== "all") && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, médico ou exame..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <Label>Urgência</Label>
          <Select value={urgenciaFilter} onValueChange={setUrgenciaFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pronto">Pronto Socorro / Alta</SelectItem>
              <SelectItem value="internado">Internado</SelectItem>
              <SelectItem value="ambulatorial">Ambulatorial / Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setImportDialogOpen(true)} variant="outline">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Registro
          </Button>
        </div>
      </div>

      {/* Visualização Agrupada */}
      {viewMode === 'grouped' && groupedData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Visualização agrupada por {activeMetricFilter === 'medico_pendencias' ? 'médico' : 'cliente/médico'}
            <span className="font-medium text-foreground">
              ({groupedData.reduce((acc, c) => acc + c.total, 0)} pendências)
            </span>
          </div>
          {groupedData.map((cliente) => (
            <div key={cliente.cliente} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                <span className="font-semibold">{cliente.cliente}</span>
                <Badge variant="secondary">{cliente.total} pendências</Badge>
              </div>
              <div className="divide-y">
                {cliente.medicosArray.map((medico) => (
                  <div key={medico.nome} className="px-4 py-2 flex items-center justify-between hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setMedicoFilter(medico.nome);
                      setViewMode('list');
                    }}
                  >
                    <span className="text-sm">{medico.nome}</span>
                    <Badge variant="outline">{medico.count} exames</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela normal */}
      {viewMode === 'list' && (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="h-8">
              <TableHead className="py-1 text-xs">Cliente</TableHead>
              <TableHead className="py-1 text-xs">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                      Médico
                      {medicoFilter && <Filter className="h-3 w-3 text-primary" />}
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 bg-popover max-h-[300px] overflow-y-auto">
                    <DropdownMenuItem onClick={() => { setSortField('medico'); setSortDirection('asc'); }}>
                      {sortField === 'medico' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'medico' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortField('medico'); setSortDirection('desc'); }}>
                      {sortField === 'medico' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'medico' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setMedicoFilter(null)}>
                      {!medicoFilter && <Check className="h-4 w-4 mr-2" />}
                      <span className={!medicoFilter ? 'font-medium' : ''}>Todos</span>
                    </DropdownMenuItem>
                    {medicosWithCount.map((item) => (
                      <DropdownMenuItem key={item.nome} onClick={() => setMedicoFilter(medicoFilter === item.nome ? null : item.nome)}>
                        {medicoFilter === item.nome && <Check className="h-4 w-4 mr-2" />}
                        <span className={medicoFilter === item.nome ? 'font-medium truncate' : 'truncate'}>{item.nome}</span>
                        <span className="ml-auto text-muted-foreground text-xs">({item.count})</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                      Segmento
                      {segmentoFilter && <Filter className="h-3 w-3 text-primary" />}
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => { setSortField('segmento'); setSortDirection('asc'); }}>
                      {sortField === 'segmento' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'segmento' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortField('segmento'); setSortDirection('desc'); }}>
                      {sortField === 'segmento' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'segmento' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSegmentoFilter(null)}>
                      {!segmentoFilter && <Check className="h-4 w-4 mr-2" />}
                      <span className={!segmentoFilter ? 'font-medium' : ''}>Todos</span>
                    </DropdownMenuItem>
                    {segmentosWithCount.map((item) => (
                      <DropdownMenuItem key={item.segmento} onClick={() => setSegmentoFilter(segmentoFilter === item.segmento ? null : item.segmento)}>
                        {segmentoFilter === item.segmento && <Check className="h-4 w-4 mr-2" />}
                        <span className={segmentoFilter === item.segmento ? 'font-medium' : ''}>{item.segmento}</span>
                        <span className="ml-auto text-muted-foreground text-xs">({item.count})</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead className="py-1 text-xs">Urg.</TableHead>
              <TableHead className="py-1 text-xs">Descrição</TableHead>
              <TableHead className="py-1 text-xs text-center">Qtd.</TableHead>
              <TableHead className="py-1 text-xs">Data</TableHead>
              <TableHead>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold">
                      Status
                      {statusFilter && <Filter className="h-3 w-3 text-primary" />}
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-popover">
                    <DropdownMenuItem onClick={() => { setSortField('status'); setSortDirection('asc'); }}>
                      {sortField === 'status' && sortDirection === 'asc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'status' && sortDirection === 'asc' ? 'font-medium' : ''}>Ordenar A-Z</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortField('status'); setSortDirection('desc'); }}>
                      {sortField === 'status' && sortDirection === 'desc' && <Check className="h-4 w-4 mr-2" />}
                      <span className={sortField === 'status' && sortDirection === 'desc' ? 'font-medium' : ''}>Ordenar Z-A</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter(null)}>
                      {!statusFilter && <Check className="h-4 w-4 mr-2" />}
                      <span className={!statusFilter ? 'font-medium' : ''}>Todos</span>
                    </DropdownMenuItem>
                    {statusWithCount.map((item) => (
                      <DropdownMenuItem key={item.status} onClick={() => setStatusFilter(statusFilter === item.status ? null : item.status)}>
                        {statusFilter === item.status && <Check className="h-4 w-4 mr-2" />}
                        <span className={statusFilter === item.status ? 'font-medium' : ''}>{statusLabels[item.status] || item.status}</span>
                        <span className="ml-auto text-muted-foreground text-xs">({item.count})</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead className="py-1 text-xs">Validade</TableHead>
              <TableHead className="py-1 text-xs text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRegistros.map((registro) => {
              const validade = getValidade(registro);
              const isPrazoVencido =
                registro.status_pendencia !== "resolvida" &&
                new Date() > validade;
              const isResolvida = registro.status_pendencia === "resolvida";
              const tempoRestante = formatTempoRestante(validade, isResolvida);
              return (
                <TableRow
                  key={registro.id}
                  className={`cursor-pointer hover:bg-muted/50 ${
                    isPrazoVencido ? "bg-red-50" : ""
                  }`}
                  onClick={() => {
                    setSelectedPendenciaId(registro.id);
                    setDetailModalOpen(true);
                  }}
                >
                  <TableCell className="py-1 px-2 text-xs font-medium max-w-[120px] truncate">
                    {registro.clientes?.nome_empresa || "-"}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs max-w-[100px] truncate">{registro.medicos?.nome_completo || "-"}</TableCell>
                  <TableCell className="py-1 px-2">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{registro.segmento}</Badge>
                  </TableCell>
                  <TableCell className="py-1 px-2">
                    {(() => {
                      const sla = registro.sla?.toLowerCase() || registro.nivel_urgencia || "";
                      let label = "INT";
                      let colorClass = "bg-yellow-500";
                      
                      if (sla.includes("pronto") || sla.includes("alta")) {
                        label = "PS";
                        colorClass = "bg-red-500";
                      } else if (sla.includes("internado")) {
                        label = "INT";
                        colorClass = "bg-yellow-500";
                      } else if (sla.includes("ambulatorial") || sla.includes("baixa")) {
                        label = "AMB";
                        colorClass = "bg-blue-500";
                      }
                      
                      return (
                        <Badge className={`text-xs px-1.5 py-0 ${colorClass}`}>
                          {label}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs max-w-[150px] truncate">
                    {registro.descricao_inicial || "-"}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-center">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 font-semibold">
                      {registro.quantidade_pendente || 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">
                    {format(toLocalTime(registro.data_deteccao), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="py-1 px-2">
                    <Badge className={`text-xs px-1.5 py-0 ${statusColors[registro.status_pendencia]}`}>
                      {statusLabels[registro.status_pendencia]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 px-2">
                    <div className="text-xs">
                      <div className={`font-semibold ${isPrazoVencido ? "text-red-600" : isResolvida ? "text-green-600" : "text-foreground"}`}>
                        {tempoRestante}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {format(toLocalTime(validade), "dd/MM HH:mm")}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-1 px-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(registro);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Tem certeza que deseja remover este registro?")) {
                            deleteMutation.mutate(registro.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Dialog de Criação/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar" : "Novo"} Registro
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nível de Urgência *</Label>
                <Select
                  value={formData.nivel_urgencia}
                  onValueChange={handleNivelUrgenciaChange}
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pronto_socorro">
                      {NIVEL_URGENCIA_LABELS.pronto_socorro}
                    </SelectItem>
                    <SelectItem value="internados">
                      {NIVEL_URGENCIA_LABELS.internados}
                    </SelectItem>
                    <SelectItem value="oncologicos">
                      {NIVEL_URGENCIA_LABELS.oncologicos}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select
                  value={formData.cliente_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, cliente_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nome_empresa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Médico *</Label>
                <Select
                  value={formData.medico_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, medico_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {medicos.map((medico) => (
                      <SelectItem key={medico.id} value={medico.id}>
                        {medico.nome_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Segmento *</Label>
                <Select
                  value={formData.segmento}
                  onValueChange={(value) =>
                    setFormData({ ...formData, segmento: value as any })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RX">RX</SelectItem>
                    <SelectItem value="TC">TC</SelectItem>
                    <SelectItem value="US">US</SelectItem>
                    <SelectItem value="RM">RM</SelectItem>
                    <SelectItem value="MM">MM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data de Detecção * (formato: DD/MM/AAAA HH:mm ou use o seletor)</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="DD/MM/AAAA HH:mm"
                    value={format(new Date(formData.data_deteccao), "dd/MM/yyyy HH:mm")}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Tentar parsear o formato DD/MM/AAAA HH:mm
                      const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
                      if (match) {
                        const [, day, month, year, hour, minute] = match;
                        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
                        if (!isNaN(date.getTime())) {
                          handleDataDeteccaoChange(date.toISOString());
                        }
                      }
                    }}
                    onBlur={(e) => {
                      // Validar formato ao sair do campo
                      const value = e.target.value;
                      const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
                      if (!match) {
                        // Se formato inválido, restaurar valor anterior
                        e.target.value = format(new Date(formData.data_deteccao), "dd/MM/yyyy HH:mm");
                        toast({
                          title: "Formato inválido",
                          description: "Use o formato DD/MM/AAAA HH:mm (ex: 25/12/2024 14:30)",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="datetime-local"
                    value={formData.data_deteccao.slice(0, 16)}
                    onChange={(e) =>
                      handleDataDeteccaoChange(new Date(e.target.value).toISOString())
                    }
                    className="w-48"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Validade (SLA)</Label>
                <Input
                  type="datetime-local"
                  value={formData.prazo_limite_sla.slice(0, 16)}
                  disabled
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea
                value={formData.descricao_inicial}
                onChange={(e) =>
                  setFormData({ ...formData, descricao_inicial: e.target.value })
                }
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Quantidade Pendente *</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantidade_pendente}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    quantidade_pendente: parseInt(e.target.value),
                  })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Observações Internas</Label>
              <Textarea
                value={formData.observacoes_internas}
                onChange={(e) =>
                  setFormData({ ...formData, observacoes_internas: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Anexos</Label>
              <FileUpload
                value={formData.anexos}
                onChange={(urls) => setFormData({ ...formData, anexos: urls })}
                label="Anexos"
                description="Adicione prints, PDFs, documentos ou qualquer tipo de arquivo"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes */}
      <PendenciaDetailModal
        pendenciaId={selectedPendenciaId}
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedPendenciaId(null);
        }}
      />

      {/* Dialog de Importação */}
      <ImportarPendenciasDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias-atrasos"] });
        }}
      />
    </div>
  );
}