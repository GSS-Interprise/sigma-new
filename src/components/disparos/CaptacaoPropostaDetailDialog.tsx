import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Package, DollarSign, Pencil, Save, X, Plus, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

interface PropostaItem {
  id: string;
  item_nome: string;
  valor_contrato: number | null;
  valor_medico: number;
  quantidade: number | null;
}

interface EditableItem {
  id: string;
  item_nome: string;
  valor_contrato: number | null;
  valor_medico: number;
  quantidade: number;
  isNew?: boolean;
  toDelete?: boolean;
}

interface CaptacaoPropostaDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propostaId: string;
  propostaNome?: string;
  onSuccess?: () => void;
}

export function CaptacaoPropostaDetailDialog({
  open,
  onOpenChange,
  propostaId,
  propostaNome,
  onSuccess,
}: CaptacaoPropostaDetailDialogProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editObservacoes, setEditObservacoes] = useState<string>("");
  const [editDescricao, setEditDescricao] = useState<string>("");
  const [editItens, setEditItens] = useState<EditableItem[]>([]);
  const [novoItemNome, setNovoItemNome] = useState("");

  // Buscar detalhes da proposta
  const { data: proposta, isLoading: loadingProposta } = useQuery({
    queryKey: ["proposta-detail", propostaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("*, contrato:contratos(codigo_contrato, codigo_interno, cliente:clientes(nome_empresa))")
        .eq("id", propostaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!propostaId,
  });

  // Buscar itens da proposta
  const { data: itens = [], isLoading: loadingItens } = useQuery({
    queryKey: ["proposta-itens", propostaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta_itens")
        .select("id, item_nome, valor_contrato, valor_medico, quantidade")
        .eq("proposta_id", propostaId)
        .order("item_nome");
      if (error) throw error;
      return data as PropostaItem[];
    },
    enabled: open && !!propostaId,
  });

  // Fallback: buscar itens do contrato quando proposta não tem itens próprios
  const { data: contratoItens = [] } = useQuery({
    queryKey: ["contrato-itens-fallback", proposta?.contrato_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_itens")
        .select("id, item, valor_item, quantidade")
        .eq("contrato_id", proposta!.contrato_id)
        .order("item");
      if (error) throw error;
      return (data || []).map(ci => ({
        id: ci.id,
        item_nome: ci.item,
        valor_contrato: ci.valor_item,
        valor_medico: 0,
        quantidade: ci.quantidade || 1,
      })) as PropostaItem[];
    },
    enabled: open && !!proposta?.contrato_id && itens.length === 0 && !loadingItens,
  });

  // Mutation para salvar alterações
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Atualizar proposta
      const { error: propostaError } = await supabase
        .from("proposta")
        .update({
          status: editStatus,
          observacoes: editObservacoes || null,
          descricao: editDescricao || null,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", propostaId);

      if (propostaError) throw propostaError;

      // Atualizar texto_ia nas campanhas vinculadas a esta proposta
      if (editObservacoes) {
        const { error: campanhaError } = await supabase
          .from("disparos_campanhas")
          .update({ texto_ia: editObservacoes })
          .eq("proposta_id", propostaId);
        
        if (campanhaError) {
          console.error("Erro ao atualizar campanhas:", campanhaError);
        }
      }

      // Deletar itens marcados
      const itensParaDeletar = editItens.filter(i => i.toDelete && !i.isNew);
      for (const item of itensParaDeletar) {
        const { error } = await supabase
          .from("proposta_itens")
          .delete()
          .eq("id", item.id);
        if (error) throw error;
      }

      // Atualizar itens existentes
      const itensParaAtualizar = editItens.filter(i => !i.isNew && !i.toDelete);
      for (const item of itensParaAtualizar) {
        const { error } = await supabase
          .from("proposta_itens")
          .update({
            item_nome: item.item_nome,
            valor_contrato: item.valor_contrato,
            valor_medico: item.valor_medico,
            quantidade: item.quantidade,
          })
          .eq("id", item.id);
        if (error) throw error;
      }

      // Inserir novos itens
      const itensNovos = editItens.filter(i => i.isNew && !i.toDelete);
      if (itensNovos.length > 0) {
        const { error } = await supabase
          .from("proposta_itens")
          .insert(itensNovos.map(item => ({
            proposta_id: propostaId,
            item_nome: item.item_nome,
            valor_contrato: item.valor_contrato,
            valor_medico: item.valor_medico,
            quantidade: item.quantidade,
          })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Proposta atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["proposta-detail", propostaId] });
      queryClient.invalidateQueries({ queryKey: ["proposta-itens", propostaId] });
      queryClient.invalidateQueries({ queryKey: ["captacao-propostas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["propostas-mensagens"] });
      setIsEditing(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error("Erro ao salvar proposta: " + error.message);
    },
  });

  const startEditing = () => {
    setEditStatus(proposta?.status || "geral");
    setEditObservacoes(proposta?.observacoes || "");
    setEditDescricao(proposta?.descricao || "");
    // Se não tem itens na proposta mas tem do contrato, marcar como novos para serem inseridos
    if (itens.length === 0 && contratoItens.length > 0) {
      setEditItens(contratoItens.map(i => ({ ...i, id: `new-${Date.now()}-${Math.random()}`, quantidade: i.quantidade || 1, isNew: true })));
    } else {
      setEditItens(itens.map(i => ({ ...i, quantidade: i.quantidade || 1 })));
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setNovoItemNome("");
  };

  const addNewItem = () => {
    if (!novoItemNome.trim()) return;
    setEditItens([...editItens, {
      id: `new-${Date.now()}`,
      item_nome: novoItemNome.trim(),
      valor_contrato: null,
      valor_medico: 0,
      quantidade: 1,
      isNew: true,
    }]);
    setNovoItemNome("");
  };

  const updateItem = (id: string, field: keyof EditableItem, value: string | number | null) => {
    setEditItens(editItens.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const toggleDeleteItem = (id: string) => {
    setEditItens(editItens.map(item =>
      item.id === id ? { ...item, toDelete: !item.toDelete } : item
    ));
  };

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
    geral: { label: "Geral", variant: "outline", className: "bg-green-50 text-green-700 border-green-200" },
    rascunho: { label: "Rascunho", variant: "outline" },
    ativa: { label: "Ativa", variant: "default" },
    enviada: { label: "Enviada", variant: "secondary" },
    aceita: { label: "Aceita", variant: "default" },
    recusada: { label: "Recusada", variant: "destructive" },
    personalizada: { label: "Personalizada", variant: "outline", className: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  const config = statusConfig[proposta?.status || "geral"] || statusConfig.geral;

  const effectiveItens = itens.length > 0 ? itens : contratoItens;
  const displayItens = isEditing ? editItens.filter(i => !i.toDelete) : effectiveItens;
  const totalContrato = displayItens.reduce((acc, item) => acc + (item.valor_contrato || 0) * (item.quantidade || 1), 0);
  const totalMedico = displayItens.reduce((acc, item) => acc + item.valor_medico * (item.quantidade || 1), 0);
  const usingFallback = itens.length === 0 && contratoItens.length > 0;

  const isLoading = loadingProposta || loadingItens;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cancelEditing(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {propostaNome || `Proposta ${propostaId.slice(0, 8)}`}
            </DialogTitle>
            {isAdmin && !isEditing && !isLoading && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="space-y-6">
              {/* Info da proposta */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Contrato: #{proposta?.contrato?.codigo_interno} - {proposta?.contrato?.codigo_contrato || "S/C"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {proposta?.contrato?.cliente?.nome_empresa || "Cliente não vinculado"}
                  </p>
                  {isEditing ? (
                    <Input
                      className="mt-2"
                      placeholder="Descrição da proposta"
                      value={editDescricao}
                      onChange={(e) => setEditDescricao(e.target.value)}
                    />
                  ) : (
                    proposta?.descricao && (
                      <p className="text-sm text-muted-foreground mt-1">{proposta.descricao}</p>
                    )
                  )}
                </div>
                {isEditing ? (
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geral">Geral</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="enviada">Enviada</SelectItem>
                      <SelectItem value="aceita">Aceita</SelectItem>
                      <SelectItem value="recusada">Recusada</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
                )}
              </div>

              <Separator />

              {/* Itens da proposta */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-1">
                  <Package className="h-4 w-4" />
                  {usingFallback && !isEditing ? 'Itens do Contrato' : 'Itens da Proposta'} ({displayItens.length})
                </h3>
                {usingFallback && !isEditing && (
                  <p className="text-xs text-muted-foreground mb-3">Exibindo itens do contrato vinculado. Edite para salvar na proposta.</p>
                )}

                {isEditing && (
                  <div className="flex gap-2 mb-3">
                    <Input
                      placeholder="Nome do novo item..."
                      value={novoItemNome}
                      onChange={(e) => setNovoItemNome(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNewItem()}
                    />
                    <Button size="sm" onClick={addNewItem} disabled={!novoItemNome.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {displayItens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item na proposta.</p>
                ) : (
                  <div className="space-y-2">
                    {(isEditing ? editItens.filter(i => !i.toDelete) : itens).map((item) => (
                      <Card key={item.id} className="p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={item.item_nome}
                                onChange={(e) => updateItem(item.id, "item_nome", e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleDeleteItem(item.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Vl. Contrato</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.valor_contrato ?? ""}
                                  onChange={(e) => updateItem(item.id, "valor_contrato", e.target.value ? parseFloat(e.target.value) : null)}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Vl. Médico</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.valor_medico}
                                  onChange={(e) => updateItem(item.id, "valor_medico", parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Qtde</label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantidade}
                                  onChange={(e) => updateItem(item.id, "quantidade", parseInt(e.target.value) || 1)}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <span className="text-sm font-medium">{item.item_nome}</span>
                              {(item.quantidade || 1) > 1 && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  x{item.quantidade}
                                </span>
                              )}
                            </div>
                            <div className="text-right space-y-1">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Contrato:</span>
                                <span className="font-medium">
                                  {item.valor_contrato?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-primary font-semibold">
                                  Médico: {item.valor_medico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Totais */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4" />
                  Resumo de Valores
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Contrato</p>
                    <p className="text-lg font-semibold">
                      {totalContrato.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Médico</p>
                    <p className="text-lg font-semibold text-primary">
                      {totalMedico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                </div>
                {totalContrato > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">Margem</p>
                    <p className="text-sm font-medium">
                      {(totalContrato - totalMedico).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({((1 - totalMedico / totalContrato) * 100).toFixed(1)}%)
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Mensagem */}
              {isEditing ? (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Mensagem que será enviada</h3>
                    <Textarea
                      rows={3}
                      placeholder="Observações / mensagem..."
                      value={editObservacoes}
                      onChange={(e) => setEditObservacoes(e.target.value)}
                    />
                  </div>
                </>
              ) : proposta?.observacoes ? (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Mensagem que será enviada</h3>
                    <p className="text-sm text-muted-foreground">{proposta.observacoes}</p>
                  </div>
                </>
              ) : null}

              {/* Data de criação */}
              <div className="text-xs text-muted-foreground text-right">
                Criado em: {new Date(proposta?.criado_em).toLocaleDateString("pt-BR", { 
                  day: "2-digit", 
                  month: "2-digit", 
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>
            </div>
          </ScrollArea>
        )}

        {isEditing && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelEditing} disabled={saveMutation.isPending}>
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
