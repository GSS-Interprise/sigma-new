import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, FileText, Plus, Package, Eye, Trash2 } from "lucide-react";
import { CaptacaoPropostaDialog } from "./CaptacaoPropostaDialog";
import { CaptacaoPropostaDetailDialog } from "./CaptacaoPropostaDetailDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
interface ContratoComServicos {
  id: string;
  codigo_contrato: string | null;
  codigo_interno: number | null;
  objeto_contrato: string | null;
  status_contrato: string | null;
  cliente: {
    nome_empresa: string;
  } | null;
  itens: {
    id: string;
    item: string;
    valor_item: number | null;
    quantidade: number | null;
  }[];
  propostas: {
    id: string;
    id_proposta: string | null;
    descricao: string | null;
    observacoes: string | null;
    status: string;
    criado_em: string;
  }[];
}

export function CaptacaoPropostasTab() {
  const [busca, setBusca] = useState("");
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoComServicos | null>(null);
  const [criarPropostaOpen, setCriarPropostaOpen] = useState(false);
  const [propostaSelecionada, setPropostaSelecionada] = useState<{ id: string; nome: string } | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();

  const deleteMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      // Primeiro deletar itens da proposta
      await supabase.from("proposta_itens").delete().eq("proposta_id", propostaId);
      // Depois deletar a proposta
      const { error } = await supabase.from("proposta").delete().eq("id", propostaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-captacao-propostas"] });
      toast.success("Proposta excluída com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir proposta");
    },
  });

  const handleDeleteProposta = (e: React.MouseEvent, propostaId: string) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta proposta?")) {
      deleteMutation.mutate(propostaId);
    }
  };

  // Buscar contratos que estão no kanban de captação (contrato_rascunho com contrato_id)
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-captacao-propostas"],
    queryFn: async () => {
      // Buscar rascunhos que têm contrato_id (manuais)
      const { data: rascunhos, error: rascunhosError } = await supabase
        .from("contrato_rascunho")
        .select("contrato_id")
        .not("contrato_id", "is", null)
        .neq("status", "cancelado");

      if (rascunhosError) throw rascunhosError;

      const contratoIds = rascunhos?.map(r => r.contrato_id).filter(Boolean) as string[];
      
      if (contratoIds.length === 0) return [];

      // Buscar contratos com seus itens e propostas
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos")
        .select(`
          id,
          codigo_contrato,
          codigo_interno,
          objeto_contrato,
          status_contrato,
          cliente:clientes(nome_empresa)
        `)
        .in("id", contratoIds)
        .order("codigo_interno", { ascending: false });

      if (contratosError) throw contratosError;

      // Para cada contrato, buscar itens e propostas
      const contratosComDados = await Promise.all(
        (contratosData || []).map(async (contrato) => {
          const [itensResult, propostasResult] = await Promise.all([
            supabase
              .from("contrato_itens")
              .select("id, item, valor_item, quantidade")
              .eq("contrato_id", contrato.id),
            supabase
              .from("proposta")
              .select("id, id_proposta, descricao, observacoes, status, criado_em")
              .eq("contrato_id", contrato.id)
              .order("criado_em", { ascending: false })
          ]);

          return {
            ...contrato,
            itens: itensResult.data || [],
            propostas: propostasResult.data || []
          };
        })
      );

      return contratosComDados as ContratoComServicos[];
    },
  });

  // Manter contratoSelecionado sincronizado com os dados mais recentes
  useEffect(() => {
    if (contratoSelecionado && contratos.length > 0) {
      const atualizado = contratos.find(c => c.id === contratoSelecionado.id);
      if (atualizado) {
        setContratoSelecionado(atualizado);
      }
    }
  }, [contratos]);

  const contratosFiltrados = contratos.filter(c => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      c.codigo_contrato?.toLowerCase().includes(termo) ||
      c.codigo_interno?.toString().includes(termo) ||
      c.cliente?.nome_empresa?.toLowerCase().includes(termo) ||
      c.objeto_contrato?.toLowerCase().includes(termo)
    );
  });

  const statusPropostaConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
    geral: { label: "Geral", variant: "outline", className: "bg-green-50 text-green-700 border-green-200" },
    rascunho: { label: "Rascunho", variant: "outline" },
    ativa: { label: "Ativa", variant: "default" },
    enviada: { label: "Enviada", variant: "secondary" },
    aceita: { label: "Aceita", variant: "default" },
    recusada: { label: "Recusada", variant: "destructive" },
    personalizada: { label: "Personalizada", variant: "outline", className: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  return (
    <div className="space-y-4">
      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código, cliente ou objeto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lista de contratos */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : contratosFiltrados.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {busca ? "Nenhum contrato encontrado." : "Nenhum contrato disponível para captação."}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Adicione contratos ao Kanban de Captação para criar propostas.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {contratosFiltrados.map((contrato) => (
            <Card
              key={contrato.id}
              className="p-4 hover:bg-accent/50 cursor-pointer transition-colors hover:shadow-md"
              onClick={() => setContratoSelecionado(contrato)}
            >
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      #{contrato.codigo_interno}
                    </span>
                    <Badge variant="outline" className="text-xs">{contrato.status_contrato}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contrato.codigo_contrato || "S/C"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium line-clamp-2">
                    {contrato.cliente?.nome_empresa || "Cliente não vinculado"}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {contrato.objeto_contrato || "Sem objeto"}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{contrato.itens.length}</p>
                    <p className="text-xs text-muted-foreground">Serviços</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{contrato.propostas.length}</p>
                    <p className="text-xs text-muted-foreground">Propostas</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de detalhes do contrato */}
      <Dialog open={!!contratoSelecionado} onOpenChange={(open) => !open && setContratoSelecionado(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              #{contratoSelecionado?.codigo_interno} - {contratoSelecionado?.codigo_contrato || "S/C"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-6">
              {/* Info do contrato */}
              <div>
                <p className="text-sm font-medium">{contratoSelecionado?.cliente?.nome_empresa}</p>
                <p className="text-sm text-muted-foreground">{contratoSelecionado?.objeto_contrato}</p>
              </div>

              <Separator />

              {/* Serviços do contrato */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4" />
                  Serviços do Contrato ({contratoSelecionado?.itens.length || 0})
                </h3>
                {contratoSelecionado?.itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>
                ) : (
                  <div className="space-y-2">
                    {contratoSelecionado?.itens.map((item) => (
                      <Card key={item.id} className="p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">{item.item}</span>
                          <div className="text-right">
                            <span className="text-sm font-medium">
                              {item.valor_item?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-"}
                            </span>
                            {item.quantidade && (
                              <span className="text-xs text-muted-foreground ml-2">
                                x{item.quantidade}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Propostas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Propostas ({contratoSelecionado?.propostas.length || 0})
                  </h3>
                  <Button size="sm" onClick={() => setCriarPropostaOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Nova Proposta
                  </Button>
                </div>
                {contratoSelecionado?.propostas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma proposta criada.</p>
                ) : (() => {
                  const propostasGeral = contratoSelecionado?.propostas.filter(p => p.status === 'geral') || [];
                  const propostasPersonalizada = contratoSelecionado?.propostas.filter(p => p.status !== 'geral') || [];

                  const renderPropostaList = (lista: typeof propostasGeral) => {
                    if (lista.length === 0) {
                      return <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma proposta nesta categoria.</p>;
                    }
                    return (
                      <div className="space-y-2">
                        {lista.map((proposta) => {
                          const config = statusPropostaConfig[proposta.status] || statusPropostaConfig.geral;
                          const descricaoLimpa = proposta.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") || "";
                          const propostaNome = proposta.id_proposta || 
                            (descricaoLimpa 
                              ? `${descricaoLimpa} - ${proposta.id.slice(0, 8)}`
                              : `Proposta ${proposta.id.slice(0, 8)}`);
                          return (
                            <Card 
                              key={proposta.id} 
                              className="p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                              onClick={() => setPropostaSelecionada({ id: proposta.id, nome: propostaNome })}
                            >
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium">{propostaNome}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(proposta.criado_em).toLocaleDateString("pt-BR")}
                                    </span>
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => handleDeleteProposta(e, proposta.id)}
                                        disabled={deleteMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {proposta.observacoes && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 p-2 rounded">
                                    {proposta.observacoes}
                                  </p>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  };

                  return (
                    <Tabs defaultValue="geral" className="w-full">
                      <TabsList className="w-full">
                        <TabsTrigger value="geral" className="flex-1">
                          Geral ({propostasGeral.length})
                        </TabsTrigger>
                        <TabsTrigger value="personalizada" className="flex-1">
                          Personalizadas ({propostasPersonalizada.length})
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="geral">
                        {renderPropostaList(propostasGeral)}
                      </TabsContent>
                      <TabsContent value="personalizada">
                        {renderPropostaList(propostasPersonalizada)}
                      </TabsContent>
                    </Tabs>
                  );
                })()}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Dialog de criar proposta */}
      {contratoSelecionado && (
        <CaptacaoPropostaDialog
          open={criarPropostaOpen}
          onOpenChange={setCriarPropostaOpen}
          contratoId={contratoSelecionado.id}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["contratos-captacao-propostas"] });
            setCriarPropostaOpen(false);
          }}
        />
      )}

      {/* Dialog de detalhes da proposta */}
      {propostaSelecionada && (
        <CaptacaoPropostaDetailDialog
          open={!!propostaSelecionada}
          onOpenChange={(open) => !open && setPropostaSelecionada(null)}
          propostaId={propostaSelecionada.id}
          propostaNome={propostaSelecionada.nome}
        />
      )}
    </div>
  );
}