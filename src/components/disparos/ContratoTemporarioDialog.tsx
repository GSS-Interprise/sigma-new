import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FileText,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Plus,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConsolidarContratoDialog } from "@/components/contratos/ConsolidarContratoDialog";
import { CaptacaoPropostaDialog } from "./CaptacaoPropostaDialog";

interface ContratoTemporario {
  id: string;
  licitacao_id: string | null;
  contrato_id: string | null;
  status: string;
  status_kanban: string;
  overlay_json: Record<string, unknown>;
  servicos_json: unknown[];
  created_at: string;
  updated_at: string;
  consolidado_em: string | null;
  consolidado_por: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoTemporario: ContratoTemporario | null;
}

export function ContratoTemporarioDialog({ open, onOpenChange, contratoTemporario }: Props) {
  const queryClient = useQueryClient();
  const [consolidarOpen, setConsolidarOpen] = useState(false);

  const [criarPropostaOpen, setCriarPropostaOpen] = useState(false);

  // Fetch itens do contrato vinculado (para cards manuais)
  const { data: contratoItens = [], isLoading: loadingItens } = useQuery({
    queryKey: ["contrato-itens-captacao", contratoTemporario?.contrato_id],
    queryFn: async () => {
      if (!contratoTemporario?.contrato_id) return [];
      const { data, error } = await supabase
        .from("contrato_itens")
        .select("id, item, valor_item, quantidade")
        .eq("contrato_id", contratoTemporario.contrato_id)
        .order("item");
      if (error) throw error;
      return data;
    },
    enabled: !!contratoTemporario?.contrato_id,
  });

  // Fetch licitação completa
  const { data: licitacao } = useQuery({
    queryKey: ["licitacao-temp", contratoTemporario?.licitacao_id],
    queryFn: async () => {
      if (!contratoTemporario?.licitacao_id) return null;
      const { data, error } = await supabase
        .from("licitacoes")
        .select("*")
        .eq("id", contratoTemporario.licitacao_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!contratoTemporario?.licitacao_id,
  });

  if (!contratoTemporario) return null;

  const overlay = contratoTemporario.overlay_json || {};
  const servicos = Array.isArray(contratoTemporario.servicos_json)
    ? contratoTemporario.servicos_json
    : [];
  
  // Detectar se é criação manual (contrato_id existe mas licitacao_id é null)
  const isManualCreation = !contratoTemporario.licitacao_id && contratoTemporario.contrato_id;
  // Já consolidado se tem consolidado_em OU se é criação manual (contrato já existe)
  const isAlreadyConsolidated = !!contratoTemporario.consolidado_em || isManualCreation;

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };


  const handleConsolidado = (contratoId: string) => {
    setConsolidarOpen(false);
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: ["contratos-temporarios"] });
    toast.success("Contrato consolidado com sucesso!");
  };

  const statusKanbanLabel: Record<string, string> = {
    prospectar: "Prospectar",
    analisando: "Analisando",
    em_andamento: "Em Andamento",
    completo: "Completo",
    descarte: "Descarte",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {isManualCreation ? "Card de Captação" : "Contrato Temporário"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {statusKanbanLabel[contratoTemporario.status_kanban] || contratoTemporario.status_kanban}
                </Badge>
                {isManualCreation && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    Vinculado a contrato existente
                  </Badge>
                )}
                {contratoTemporario.consolidado_em && (
                  <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Consolidado
                  </Badge>
                )}
              </div>

              {/* Dados da Licitação ou Contrato */}
              <Card className="p-4 space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {isManualCreation ? "Dados do Contrato" : "Dados da Licitação"}
                </h4>
                <Separator />
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {isManualCreation ? (
                    <>
                      <div>
                        <p className="text-muted-foreground">ID Interno</p>
                        <p className="font-medium">#{String(overlay.codigo_interno || "N/A")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Código do Contrato</p>
                        <p className="font-medium">{String(overlay.contrato_codigo || "N/A")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> Cliente
                        </p>
                        <p className="font-medium">{String(overlay.cliente || "N/A")}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Objeto</p>
                        <p className="font-medium">{String(overlay.objeto || "N/A")}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-muted-foreground">Número do Edital</p>
                        <p className="font-medium">{String(overlay.numero_edital || licitacao?.numero_edital || "N/A")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tipo/Subtipo</p>
                        <p className="font-medium">{String(overlay.tipo_modalidade || (licitacao as any)?.tipo_modalidade || "")} {overlay.subtipo_modalidade || (licitacao as any)?.subtipo_modalidade ? `/ ${String(overlay.subtipo_modalidade || (licitacao as any)?.subtipo_modalidade)}` : ""}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Objeto</p>
                        {(() => {
                          const raw = String(overlay.objeto || licitacao?.objeto || "N/A");
                          const isHtml = /<[a-z][\s\S]*>/i.test(raw);
                          if (isHtml) {
                            return (
                              <div
                                className="font-medium prose prose-sm max-w-none text-foreground [&_.ql-advanced-banner]:rounded [&_.ql-advanced-banner]:p-2 [&_.ql-advanced-banner]:my-1 [&_.ql-advanced-banner[data-advanced-banner-color='yellow-strong']]:bg-yellow-100 [&_.ql-advanced-banner[data-advanced-banner-color='red-strong']]:bg-red-100 [&_.ql-advanced-banner[data-advanced-banner-color='orange-strong']]:bg-orange-100 [&_.ql-advanced-banner[data-advanced-banner-color='blue-strong']]:bg-blue-100"
                                dangerouslySetInnerHTML={{ __html: raw }}
                              />
                            );
                          }
                          return <p className="font-medium">{raw}</p>;
                        })()}
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> Órgão
                        </p>
                        <p className="font-medium">{String(overlay.orgao || licitacao?.orgao || "N/A")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> UF
                        </p>
                        <p className="font-medium">{String(overlay.uf || licitacao?.municipio_uf || "N/A")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> Valor Estimado
                        </p>
                        <p className="font-medium text-primary">
                          {formatCurrency(overlay.valor_estimado as number || licitacao?.valor_estimado)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Data Arrematação
                        </p>
                        <p className="font-medium">
                          {overlay.data_arrematacao
                            ? format(new Date(String(overlay.data_arrematacao)), "dd/MM/yyyy", { locale: ptBR })
                            : "N/A"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Serviços */}
              {servicos.length > 0 && (
                <Card className="p-4 space-y-3">
                  <h4 className="font-semibold">Serviços Definidos</h4>
                  <Separator />
                  <div className="space-y-2">
                    {servicos.map((servico: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span>{servico.nome || `Serviço ${index + 1}`}</span>
                        <span className="font-medium">{formatCurrency(servico.valor)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Serviços do Contrato - apenas para cards manuais */}
              {isManualCreation && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Serviços do Contrato ({contratoItens.length})
                    </h4>
                    <Button size="sm" onClick={() => setCriarPropostaOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Criar Proposta
                    </Button>
                  </div>
                  <Separator />
                  {loadingItens ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : contratoItens.length > 0 ? (
                    <div className="space-y-2">
                      {contratoItens.map((item: any) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-2 bg-muted rounded"
                        >
                          <span className="text-sm">{item.item}</span>
                          <span className="font-medium text-primary">{formatCurrency(item.valor_item)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum serviço cadastrado neste contrato
                    </p>
                  )}
                </Card>
              )}

              {/* Informações de Criação */}
              <div className="text-xs text-muted-foreground">
                <p>Criado em: {format(new Date(contratoTemporario.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                {contratoTemporario.consolidado_em && (
                  <p>
                    Consolidado em:{" "}
                    {format(new Date(contratoTemporario.consolidado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {!isAlreadyConsolidated && (
              <Button onClick={() => setConsolidarOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Consolidar Contrato
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Consolidação */}
      <ConsolidarContratoDialog
        open={consolidarOpen}
        onOpenChange={setConsolidarOpen}
        rascunhoId={contratoTemporario?.id}
        overlay={overlay}
        onSuccess={handleConsolidado}
      />

      {/* Dialog de Proposta para Captação */}
      {isManualCreation && contratoTemporario.contrato_id && (
        <CaptacaoPropostaDialog
          open={criarPropostaOpen}
          onOpenChange={setCriarPropostaOpen}
          contratoId={contratoTemporario.contrato_id}
          contratoNome={String(overlay.cliente || "")}
        />
      )}
    </>
  );
}
