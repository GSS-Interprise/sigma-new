import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Search, AlertTriangle, FileSpreadsheet } from "lucide-react";
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
import { ImageUpload } from "./ImageUpload";
import { format, formatDistanceToNow, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toLocalTime } from "@/lib/dateUtils";
import { PendenciaDetailModal } from "./PendenciaDetailModal";
import { PendenciasMetrics } from "./PendenciasMetrics";
import { ImportarPendenciasDialog } from "./ImportarPendenciasDialog";

interface PendenciaForm {
  cliente_id: string;
  medico_id: string;
  segmento: "RX" | "TC" | "US" | "RM" | "MM";
  data_deteccao: string;
  data_referencia: string;
  quantidade_pendente: number;
  descricao_inicial: string;
  status_pendencia: string;
  prazo_limite_sla: string;
  observacoes_internas: string;
  anexos: string[];
}

export function AbaControlePendencias() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPendenciaId, setSelectedPendenciaId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentoFilter, setSegmentoFilter] = useState<string>("all");

  const [formData, setFormData] = useState<PendenciaForm>({
    cliente_id: "",
    medico_id: "",
    segmento: "RX" as const,
    data_deteccao: new Date().toISOString(),
    data_referencia: new Date().toISOString().split('T')[0],
    quantidade_pendente: 1,
    descricao_inicial: "",
    status_pendencia: "aberta",
    prazo_limite_sla: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    observacoes_internas: "",
    anexos: [],
  });

  // Buscar pendências com paginação para ultrapassar limite de 1000
  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ["radiologia-pendencias"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const allRecords: any[] = [];
      
      // Primeiro, contar total
      const { count, error: countError } = await supabase
        .from("radiologia_pendencias")
        .select("id", { count: "exact", head: true });
      
      if (countError) throw countError;
      
      const totalRecords = count || 0;
      
      if (totalRecords === 0) return [];
      
      // Buscar em lotes paginados
      let offset = 0;
      while (offset < totalRecords) {
        const { data, error } = await supabase
          .from("radiologia_pendencias")
          .select(`
            *,
            clientes:cliente_id (nome_empresa),
            medicos!medico_id (nome_completo, email),
            medico_atribuido:medicos!medico_atribuido_id (nome_completo, email)
          `)
          .order("data_deteccao", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (data) allRecords.push(...data);
        
        offset += PAGE_SIZE;
      }
      
      return allRecords;
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

  // Mutation para criar/atualizar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .single();

      if (editingId) {
        const { error } = await supabase
          .from("radiologia_pendencias")
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);

        if (error) throw error;

        // Registrar no histórico
        await supabase.from("radiologia_pendencias_historico").insert({
          pendencia_id: editingId,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || "Usuário",
          acao: "pendencia_atualizada",
          detalhes: "Pendência atualizada",
        });
      } else {
        const { data: newPendencia, error } = await supabase
          .from("radiologia_pendencias")
          .insert([formData])
          .select()
          .single();

        if (error) throw error;

        // Registrar no histórico
        await supabase.from("radiologia_pendencias_historico").insert({
          pendencia_id: newPendencia.id,
          usuario_id: user?.id,
          usuario_nome: profile?.nome_completo || "Usuário",
          acao: "pendencia_criada",
          detalhes: "Pendência criada",
        });

        // Notificar médico automaticamente
        if (newPendencia.medico_id) {
          const medico = medicos.find((m) => m.id === newPendencia.medico_id);
          const cliente = clientes.find((c) => c.id === newPendencia.cliente_id);

          if (medico && cliente) {
            await supabase.functions.invoke("notify-radiologia-pendencia", {
              body: {
                pendenciaId: newPendencia.id,
                medicoEmail: medico.email,
                medicoNome: medico.nome_completo,
                clienteNome: cliente.nome_empresa,
                segmento: newPendencia.segmento,
                quantidadePendente: newPendencia.quantidade_pendente,
                descricaoInicial: newPendencia.descricao_inicial,
                prazoLimiteSla: newPendencia.prazo_limite_sla,
              },
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias"] });
      resetForm();
      setDialogOpen(false);
      toast({ title: `Pendência ${editingId ? "atualizada" : "criada"} com sucesso!` });
    },
    onError: (error) => {
      toast({
        title: `Erro ao ${editingId ? "atualizar" : "criar"} pendência`,
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
      queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias"] });
      toast({ title: "Pendência removida com sucesso!" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover pendência",
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
      data_deteccao: new Date().toISOString(),
      data_referencia: new Date().toISOString().split('T')[0],
      quantidade_pendente: 1,
      descricao_inicial: "",
      status_pendencia: "aberta",
      prazo_limite_sla: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      observacoes_internas: "",
      anexos: [],
    });
    setEditingId(null);
  };

  const handleEdit = (pendencia: any) => {
    setFormData({
      cliente_id: pendencia.cliente_id,
      medico_id: pendencia.medico_id,
      segmento: pendencia.segmento as "RX" | "TC" | "US" | "RM" | "MM",
      data_deteccao: pendencia.data_deteccao,
      data_referencia: pendencia.data_referencia || new Date(pendencia.data_deteccao).toISOString().split('T')[0],
      quantidade_pendente: pendencia.quantidade_pendente,
      descricao_inicial: pendencia.descricao_inicial || "",
      status_pendencia: pendencia.status_pendencia,
      prazo_limite_sla: pendencia.prazo_limite_sla,
      observacoes_internas: pendencia.observacoes_internas || "",
      anexos: pendencia.anexos || [],
    });
    setEditingId(pendencia.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  // Métricas calculadas
  const metrics = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const totalPendenciasAbertas = pendencias.filter(
      (p) => p.status_pendencia === "aberta"
    ).length;

    const totalResolvidas = pendencias.filter(
      (p) => p.status_pendencia === "resolvida"
    ).length;

    const pendenciasResolvidasHoje = pendencias.filter(
      (p) =>
        p.data_resolucao &&
        new Date(p.data_resolucao) >= hoje &&
        p.status_pendencia === "resolvida"
    ).length;

    const pendenciasVencidas = pendencias.filter(
      (p) =>
        p.status_pendencia !== "resolvida" &&
        new Date() > new Date(p.prazo_limite_sla)
    ).length;

    // Calcular tempo médio de resolução (data_deteccao → data_final)
    // data_deteccao = data de entrada/solicitação do exame
    // data_final = data de finalização do exame
    const pendenciasResolvidas = pendencias.filter(
      (p) => p.status_pendencia === "resolvida" && p.data_final && p.data_deteccao
    );

    let tempoMedioResolucao = "N/A";
    if (pendenciasResolvidas.length > 0) {
      const totalHoras = pendenciasResolvidas.reduce((acc, p) => {
        return acc + differenceInHours(new Date(p.data_final!), new Date(p.data_deteccao));
      }, 0);
      const mediaHoras = totalHoras / pendenciasResolvidas.length;
      const dias = Math.floor(mediaHoras / 24);
      const horas = Math.round(mediaHoras % 24);
      tempoMedioResolucao = dias > 0 ? `${dias}d ${horas}h` : `${horas}h`;
    }

    // Médico com mais pendências
    const medicosPendencias: Record<string, { nome: string; quantidade: number }> = {};
    pendencias
      .filter((p) => p.status_pendencia !== "resolvida")
      .forEach((p) => {
        const medicoId = p.medico_id;
        if (!medicosPendencias[medicoId]) {
          medicosPendencias[medicoId] = {
            nome: p.medicos.nome_completo,
            quantidade: 0,
          };
        }
        medicosPendencias[medicoId].quantidade++;
      });

    const medicoMaisPendencias =
      Object.values(medicosPendencias).sort((a, b) => b.quantidade - a.quantidade)[0] || null;

    return {
      totalPendenciasAbertas,
      totalResolvidas,
      pendenciasResolvidasHoje,
      pendenciasVencidas,
      tempoMedioResolucao,
      medicoMaisPendencias,
    };
  }, [pendencias]);

  // Resumo por segmento
  const resumoSegmento = useMemo(() => {
    const segmentos = ["RX", "TC", "US", "RM", "MM"];
    return segmentos.map((seg) => {
      const total = pendencias.filter((p) => p.segmento === seg).length;
      const abertas = pendencias.filter(
        (p) => p.segmento === seg && p.status_pendencia === "aberta"
      ).length;
      const resolvidas = pendencias.filter(
        (p) => p.segmento === seg && p.status_pendencia === "resolvida"
      ).length;
      const emAnalise = pendencias.filter(
        (p) => p.segmento === seg && p.status_pendencia === "em_analise"
      ).length;
      return { segmento: seg, total, abertas, resolvidas, emAnalise };
    });
  }, [pendencias]);

  // Filtros
  const filteredPendencias = useMemo(() => {
    return pendencias.filter((p) => {
      const matchSearch =
        p.clientes.nome_empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.medicos.nome_completo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status_pendencia === statusFilter;
      const matchSegmento = segmentoFilter === "all" || p.segmento === segmentoFilter;
      return matchSearch && matchStatus && matchSegmento;
    });
  }, [pendencias, searchTerm, statusFilter, segmentoFilter]);

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
      {/* Métricas */}
      <PendenciasMetrics {...metrics} />

      {/* Resumo por Segmento */}
      <div className="flex gap-2 flex-wrap">
        {resumoSegmento.map((item) => (
          <Badge key={item.segmento} variant="outline" className="px-4 py-2">
            <span className="font-bold">{item.segmento}:</span>
            <span className="ml-2 text-gray-600">{item.abertas} abertas</span>
            <span className="ml-2 text-green-600">{item.resolvidas} resolvidas</span>
            <span className="ml-2 text-yellow-600">{item.emAnalise} em análise</span>
          </Badge>
        ))}
      </div>

      {/* Filtros e Ações */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou médico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="encaminhada_medico">Encaminhada ao Médico</SelectItem>
              <SelectItem value="aguardando_laudo">Aguardando Laudo</SelectItem>
              <SelectItem value="resolvida">Resolvida</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-32">
          <Label>Segmento</Label>
          <Select value={segmentoFilter} onValueChange={setSegmentoFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="RX">RX</SelectItem>
              <SelectItem value="TC">TC</SelectItem>
              <SelectItem value="US">US</SelectItem>
              <SelectItem value="RM">RM</SelectItem>
              <SelectItem value="MM">MM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Pendência
        </Button>
        <Button onClick={() => setImportDialogOpen(true)} variant="outline">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Importar Excel
        </Button>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Acesso</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Exame</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Médico Presc.</TableHead>
              <TableHead>Tempo Decorrido</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPendencias.map((pendencia) => {
              const isPrazoVencido =
                pendencia.status_pendencia !== "resolvida" &&
                new Date() > toLocalTime(pendencia.prazo_limite_sla);
              const tempoAberto = pendencia.data_resolucao
                ? formatDistanceToNow(toLocalTime(pendencia.data_deteccao), {
                    locale: ptBR,
                    addSuffix: false,
                  })
                : formatDistanceToNow(toLocalTime(pendencia.data_deteccao), {
                    locale: ptBR,
                    addSuffix: true,
                  });

              return (
                <TableRow
                  key={pendencia.id}
                  className={`cursor-pointer hover:bg-muted/50 ${
                    isPrazoVencido ? "bg-red-50" : ""
                  }`}
                  onClick={() => {
                    setSelectedPendenciaId(pendencia.id);
                    setDetailModalOpen(true);
                  }}
                >
                  <TableCell className="font-medium">
                    {(pendencia as any).acesso || '-'}
                  </TableCell>
                  <TableCell>
                    {(pendencia as any).nome_paciente || '-'}
                  </TableCell>
                  <TableCell>
                    {(pendencia as any).descricao_exame || '-'}
                  </TableCell>
                  <TableCell>
                    {(pendencia as any).prioridade ? (
                      <Badge variant={(pendencia as any).prioridade === 'ALTA' ? 'destructive' : 'secondary'}>
                        {(pendencia as any).prioridade}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[pendencia.status_pendencia]}>
                      {statusLabels[pendencia.status_pendencia]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {(pendencia as any).medico_prescritor || '-'}
                  </TableCell>
                  <TableCell>
                    {(pendencia as any).tempo_decorrido || tempoAberto}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(pendencia as any).data_exame && (pendencia as any).hora_exame ? (
                      <div>
                        <div>{format(new Date((pendencia as any).data_exame), "dd/MM/yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{(pendencia as any).hora_exame}</div>
                      </div>
                    ) : (
                      format(toLocalTime(pendencia.data_deteccao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(pendencia);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              "Tem certeza que deseja remover esta pendência? Esta ação não pode ser desfeita."
                            )
                          ) {
                            deleteMutation.mutate(pendencia.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de Criação/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Pendência" : "Nova Pendência"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
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
              <div>
                <Label>Médico Responsável *</Label>
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Segmento *</Label>
                <Select
                  value={formData.segmento}
                  onValueChange={(value) =>
                    setFormData({ ...formData, segmento: value as "RX" | "TC" | "US" | "RM" | "MM" })
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
              <div>
                <Label>Quantidade Pendente *</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantidade_pendente}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantidade_pendente: parseInt(e.target.value) || 1,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label>Status *</Label>
                <Select
                  value={formData.status_pendencia}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status_pendencia: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="encaminhada_medico">
                      Encaminhada ao Médico
                    </SelectItem>
                    <SelectItem value="aguardando_laudo">
                      Aguardando Laudo
                    </SelectItem>
                    <SelectItem value="resolvida">Resolvida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Detecção *</Label>
                <Input
                  type="datetime-local"
                  value={formData.data_deteccao.slice(0, 16)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      data_deteccao: new Date(e.target.value).toISOString(),
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label>Prazo Limite (SLA) *</Label>
                <Input
                  type="datetime-local"
                  value={formData.prazo_limite_sla.slice(0, 16)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prazo_limite_sla: new Date(e.target.value).toISOString(),
                    })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <Label>Descrição Inicial</Label>
              <Textarea
                value={formData.descricao_inicial}
                onChange={(e) =>
                  setFormData({ ...formData, descricao_inicial: e.target.value })
                }
                rows={3}
                placeholder="Descreva o motivo da pendência..."
              />
            </div>

            <div>
              <Label>Observações Internas</Label>
              <Textarea
                value={formData.observacoes_internas}
                onChange={(e) =>
                  setFormData({ ...formData, observacoes_internas: e.target.value })
                }
                rows={2}
                placeholder="Observações para uso interno da equipe..."
              />
            </div>

            <div>
              <Label>Anexos</Label>
              <ImageUpload
                value={formData.anexos}
                onChange={(value) => setFormData({ ...formData, anexos: value })}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setDialogOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
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
          queryClient.invalidateQueries({ queryKey: ["radiologia-pendencias"] });
        }}
      />
    </div>
  );
}
