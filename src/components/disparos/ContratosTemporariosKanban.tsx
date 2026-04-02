import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { GripVertical, Building2, MapPin, Calendar, FileText, ExternalLink, DollarSign, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ContratoTemporarioDialog } from "./ContratoTemporarioDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { NovoCardCaptacaoDialog } from "./NovoCardCaptacaoDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type StatusKanban = "prospectar" | "analisando" | "em_andamento" | "completo" | "descarte";

interface ContratoData {
  id: string;
  codigo_contrato: string | null;
  codigo_interno: number | null;
  objeto_contrato: string | null;
  status_contrato: string | null;
  cliente_nome: string | null;
}

interface ContratoTemporario {
  id: string;
  licitacao_id: string;
  contrato_id: string | null;
  status: string;
  status_kanban: StatusKanban;
  overlay_json: Record<string, unknown>;
  servicos_json: unknown[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  consolidado_em: string | null;
  consolidado_por: string | null;
  licitacoes?: {
    numero_edital: string | null;
    objeto: string | null;
    orgao: string | null;
    municipio_uf: string | null;
    valor_estimado: number | null;
  };
  _contrato?: ContratoData | null;
}

const KANBAN_COLUMNS: { id: StatusKanban; label: string; color: string }[] = [
  { id: "prospectar", label: "Prospectar", color: "bg-blue-500" },
  { id: "analisando", label: "Analisando", color: "bg-yellow-500" },
  { id: "em_andamento", label: "Em Andamento", color: "bg-orange-500" },
  { id: "completo", label: "Completo", color: "bg-green-500" },
  { id: "descarte", label: "Descarte", color: "bg-red-500" },
];

export function ContratosTemporariosKanban() {
  const queryClient = useQueryClient();
  const [draggedCard, setDraggedCard] = useState<ContratoTemporario | null>(null);
  const [selectedContrato, setSelectedContrato] = useState<ContratoTemporario | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novoCardDialogOpen, setNovoCardDialogOpen] = useState(false);
  const { isAdmin, isLeader } = usePermissions();

  // Fetch all contratos temporários (rascunhos)
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-temporarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_rascunho")
        .select(`
          *,
          licitacoes (
            numero_edital,
            objeto,
            orgao,
            municipio_uf,
            valor_estimado
          )
        `)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Para consolidados, buscar dados reais do contrato (objeto_contrato em texto puro)
      const consolidadosIds = (data || [])
        .filter((r) => r.status === "consolidado" && r.contrato_id)
        .map((r) => r.contrato_id as string);

      let contratosMap: Record<string, ContratoData> = {};
      if (consolidadosIds.length > 0) {
        const { data: contratosData } = await supabase
          .from("contratos")
          .select("id, codigo_contrato, codigo_interno, objeto_contrato, status_contrato, clientes(nome_empresa)")
          .in("id", consolidadosIds);
        contratosMap = Object.fromEntries(
          (contratosData || []).map((c: any) => [
            c.id,
            {
              id: c.id,
              codigo_contrato: c.codigo_contrato,
              codigo_interno: c.codigo_interno,
              objeto_contrato: c.objeto_contrato,
              status_contrato: c.status_contrato,
              cliente_nome: c.clientes?.nome_empresa ?? null,
            },
          ])
        );
      }

      return (data || []).map((r) => ({
        ...r,
        _contrato: r.contrato_id ? (contratosMap[r.contrato_id] ?? null) : null,
      })) as ContratoTemporario[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("contratos-temp-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contrato_rascunho" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Update status kanban (drag & drop)
  const updateStatusKanban = useMutation({
    mutationFn: async ({ contratoId, newStatus }: { contratoId: string; newStatus: StatusKanban }) => {
      const { error } = await supabase
        .from("contrato_rascunho")
        .update({ status_kanban: newStatus })
        .eq("id", contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
    },
    onError: () => toast.error("Erro ao mover card"),
  });

  // Deletar contrato temporário (apenas admin)
  const deleteContratoTemporario = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase
        .from("contrato_rascunho")
        .delete()
        .eq("id", contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
      toast.success("Contrato temporário excluído com sucesso");
    },
    onError: () => toast.error("Erro ao excluir contrato temporário"),
  });

  const handleDragStart = (e: React.DragEvent, contrato: ContratoTemporario) => {
    setDraggedCard(contrato);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStatus: StatusKanban) => {
    e.preventDefault();
    if (draggedCard && draggedCard.status_kanban !== targetStatus) {
      updateStatusKanban.mutate({ contratoId: draggedCard.id, newStatus: targetStatus });
    }
    setDraggedCard(null);
  };

  const getContratosForColumn = (status: StatusKanban) => {
    return contratos.filter((c) => c.status_kanban === status);
  };

  const handleCardClick = (contrato: ContratoTemporario) => {
    setSelectedContrato(contrato);
    setDialogOpen(true);
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return null;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const renderCard = (contrato: ContratoTemporario) => {
    const overlay = contrato.overlay_json || {};
    const licitacao = contrato.licitacoes;
    const contratoReal = contrato._contrato;
    const isConsolidado = contrato.status === "consolidado" && contratoReal;
    
    // Verificar se é card manual (tem contrato_id mas não tem licitacao_id)
    const isManualCard = contrato.contrato_id && !contrato.licitacao_id;
    
    // Título: consolidado → código real do contrato; manual → overlay; licitação → edital
    let tituloCard: string;
    if (isConsolidado) {
      tituloCard = contratoReal.codigo_contrato
        ? `#${contratoReal.codigo_interno} - ${contratoReal.codigo_contrato}`
        : `#${contratoReal.codigo_interno}`;
    } else if (isManualCard) {
      const codigoInterno = overlay.codigo_interno as string | number | undefined;
      const codigoContrato = overlay.contrato_codigo as string | undefined;
      if (codigoInterno && codigoContrato) {
        tituloCard = `#${codigoInterno} - ${codigoContrato}`;
      } else if (codigoInterno) {
        tituloCard = `#${codigoInterno}`;
      } else if (codigoContrato) {
        tituloCard = codigoContrato;
      } else {
        tituloCard = "Contrato Manual";
      }
    } else {
      tituloCard = (overlay.numero_edital as string) || licitacao?.numero_edital || "S/N";
    }

    // Objeto: consolidado → texto puro do contrato real; senão → overlay (pode ter HTML)
    const objetoRaw = isConsolidado
      ? (contratoReal.objeto_contrato || "Sem objeto")
      : ((overlay.objeto as string) || licitacao?.objeto || "Sem objeto");
    const objetoIsHtml = !isConsolidado && /<[a-z][\s\S]*>/i.test(objetoRaw);
    // Texto puro para exibição resumida no card (strip HTML)
    const objetoTexto = objetoIsHtml
      ? objetoRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : objetoRaw;

    const orgao = isConsolidado
      ? (contratoReal.cliente_nome || (overlay.orgao as string) || licitacao?.orgao || "")
      : ((overlay.orgao as string) || licitacao?.orgao || (overlay.cliente as string));
    const uf = (overlay.uf as string) || licitacao?.municipio_uf;
    const valorEstimado = overlay.valor_estimado as number || licitacao?.valor_estimado;
    
    // Serviços definidos na licitação
    const servicos = Array.isArray(contrato.servicos_json) ? contrato.servicos_json as Array<{nome?: string; valor?: number}> : [];
    const totalServicos = servicos.reduce((acc: number, s) => acc + (s.valor || 0), 0);

    return (
      <Card
        key={contrato.id}
        draggable
        onDragStart={(e) => handleDragStart(e, contrato)}
        onClick={() => handleCardClick(contrato)}
        className="p-3 mb-2 cursor-grab active:cursor-grabbing bg-card hover:bg-accent/50 transition-colors border shadow-sm"
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium truncate">{String(tituloCard)}</p>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir contrato temporário?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O contrato temporário será excluído permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteContratoTemporario.mutate(contrato.id)}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(contrato);
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {objetoTexto}
            </p>
            
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="default" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {isManualCard ? "Manual" : "Licitação"}
              </Badge>
              {uf && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  {String(uf)}
                </Badge>
              )}
            </div>

            {orgao && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span className="truncate">{String(orgao)}</span>
              </div>
            )}

            {/* Serviços Definidos */}
            {servicos.length > 0 && (
              <div className="mt-2 p-2 bg-muted/50 rounded-md space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Serviços ({servicos.length}):</p>
                {servicos.slice(0, 2).map((servico: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="truncate max-w-[120px]">{servico.nome || `Serviço ${idx + 1}`}</span>
                    <span className="font-medium text-primary">{formatCurrency(servico.valor)}</span>
                  </div>
                ))}
                {servicos.length > 2 && (
                  <p className="text-xs text-muted-foreground">+{servicos.length - 2} mais...</p>
                )}
                <div className="flex justify-between text-xs font-semibold pt-1 border-t border-border mt-1">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(totalServicos)}</span>
                </div>
              </div>
            )}

            {/* Valor estimado (fallback se não tiver serviços) */}
            {servicos.length === 0 && valorEstimado && (
              <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(valorEstimado)}
              </div>
            )}

            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(contrato.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando contratos temporários...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-[calc(100vh-220px)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {contratos.length} contratos temporários
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {(isAdmin || isLeader) && (
            <Button onClick={() => setNovoCardDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Card de Captação
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Arraste para mover entre status. Clique para ver detalhes e consolidar.
          </p>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto flex-1 min-h-0 pb-2">
        {KANBAN_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex flex-col bg-muted/30 rounded-lg border flex-shrink-0 w-[calc(20%-12px)] min-w-[220px] h-full"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`${column.color} text-white px-3 py-2 rounded-t-lg flex-shrink-0`}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{column.label}</h3>
                <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                  {getContratosForColumn(column.id).length}
                </Badge>
              </div>
            </div>

            {/* Column Content */}
            <ScrollArea className="flex-1 min-h-0 p-2">
              <div className="space-y-2 pr-1">
                {getContratosForColumn(column.id).map((contrato) => renderCard(contrato))}
                
                {getContratosForColumn(column.id).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum contrato
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {/* Dialog para ver detalhes e consolidar */}
      <ContratoTemporarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contratoTemporario={selectedContrato}
      />

      {/* Dialog para novo card de captação */}
      <NovoCardCaptacaoDialog
        open={novoCardDialogOpen}
        onOpenChange={setNovoCardDialogOpen}
      />
    </div>
  );
}
