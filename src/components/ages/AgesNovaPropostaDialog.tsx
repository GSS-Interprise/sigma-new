import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, MapPin, Plus, Loader2 } from "lucide-react";

interface AgesNovaPropostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadNome?: string;
  unidadesVinculadas?: string[];
  propostaParaEditar?: any;
}

interface ContratoItem {
  id: string;
  item: string;
  valor_item: number;
  quantidade: number | null;
}

interface ItemValor {
  contrato_item_id: string;
  item_nome: string;
  valor_contrato: number;
  valor_profissional: number;
  quantidade: number;
  selecionado: boolean;
  isCustom?: boolean;
}

interface UnidadeOption {
  id: string;
  nome: string;
  codigo: string | null;
  cliente: {
    id: string;
    nome_empresa: string;
  } | null;
}

export function AgesNovaPropostaDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  unidadesVinculadas = [],
  propostaParaEditar,
}: AgesNovaPropostaDialogProps) {
  const queryClient = useQueryClient();
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("");
  const [itensValores, setItensValores] = useState<ItemValor[]>([]);
  const [novoItemNome, setNovoItemNome] = useState("");
  const [observacoes, setObservacoes] = useState<string>("");

  const isEditing = !!propostaParaEditar;

  // Busca unidades vinculadas ao lead (ages_unidades)
  const { data: unidades = [], isLoading: loadingUnidades } = useQuery({
    queryKey: ['ages-unidades-lead', unidadesVinculadas],
    queryFn: async () => {
      if (unidadesVinculadas.length === 0) return [];
      const { data, error } = await supabase
        .from('ages_unidades')
        .select(`
          id,
          nome,
          codigo,
          cliente:ages_clientes!ages_unidades_cliente_id_fkey(id, nome_empresa)
        `)
        .in('id', unidadesVinculadas)
        .order('nome');
      if (error) throw error;
      return data as UnidadeOption[];
    },
    enabled: open && unidadesVinculadas.length > 0,
  });

  // Busca contrato ativo pela unidade selecionada
  const { data: contratoUnidade, isLoading: loadingContrato } = useQuery({
    queryKey: ['ages-contrato-por-unidade', selectedUnidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_contratos')
        .select(`
          id,
          codigo_contrato,
          codigo_interno,
          objeto_contrato,
          status,
          ages_cliente:ages_clientes(id, nome_empresa)
        `)
        .eq('ages_unidade_id', selectedUnidadeId)
        .in('status', ['Ativo', 'ativo', 'Pre-Contrato'])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUnidadeId,
  });

  // Busca itens do contrato
  const { data: contratoItens = [], isLoading: loadingItens } = useQuery({
    queryKey: ['ages-contrato-itens', contratoUnidade?.id],
    queryFn: async () => {
      if (!contratoUnidade?.id) return [];
      const { data, error } = await supabase
        .from('ages_contrato_itens')
        .select('id, item, valor_item, quantidade')
        .eq('contrato_id', contratoUnidade.id)
        .order('item');
      if (error) throw error;
      return data as ContratoItem[];
    },
    enabled: !!contratoUnidade?.id,
  });

  // Atualiza itensValores quando contratoItens muda
  useEffect(() => {
    if (contratoItens.length > 0 && !isEditing) {
      setItensValores(contratoItens.map(item => ({
        contrato_item_id: item.id,
        item_nome: item.item,
        valor_contrato: item.valor_item,
        valor_profissional: 0,
        quantidade: item.quantidade || 1,
        selecionado: true,
        isCustom: false,
      })));
    }
  }, [contratoItens, isEditing]);

  // Reset quando unidade muda
  useEffect(() => {
    if (!isEditing) {
      setItensValores([]);
    }
  }, [selectedUnidadeId, isEditing]);

  // Initialize form when editing
  useEffect(() => {
    if (propostaParaEditar && open) {
      setSelectedUnidadeId(propostaParaEditar.unidade_id || "");
      setObservacoes(propostaParaEditar.observacoes || "");
    } else if (!propostaParaEditar && open) {
      resetForm();
    }
  }, [propostaParaEditar, open]);

  const resetForm = () => {
    setSelectedUnidadeId("");
    setItensValores([]);
    setNovoItemNome("");
    setObservacoes("");
  };

  const handleValorProfissionalChange = (index: number, valor: string) => {
    const newItens = [...itensValores];
    newItens[index].valor_profissional = parseFloat(valor) || 0;
    setItensValores(newItens);
  };

  const toggleItemSelecionado = (index: number) => {
    const newItens = [...itensValores];
    newItens[index].selecionado = !newItens[index].selecionado;
    setItensValores(newItens);
  };

  const handleAddCustomItem = () => {
    if (!novoItemNome.trim()) return;
    setItensValores([
      ...itensValores,
      {
        contrato_item_id: `custom-${Date.now()}`,
        item_nome: novoItemNome.trim(),
        valor_contrato: 0,
        valor_profissional: 0,
        quantidade: 1,
        selecionado: true,
        isCustom: true,
      },
    ]);
    setNovoItemNome("");
  };

  const itensSelecionados = itensValores.filter(i => i.selecionado);
  const valorTotalProfissional = itensSelecionados.reduce(
    (acc, item) => acc + (item.valor_profissional * item.quantidade), 
    0
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const selectedUnidade = unidades.find(u => u.id === selectedUnidadeId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUnidadeId) throw new Error("Selecione uma unidade");

      const payload = {
        lead_id: leadId,
        cliente_id: selectedUnidade?.cliente?.id || null,
        unidade_id: selectedUnidadeId,
        contrato_id: contratoUnidade?.id || null,
        valor: valorTotalProfissional || null,
        descricao: itensSelecionados.length > 0
          ? itensSelecionados.map(i => `${i.item_nome}: ${formatCurrency(i.valor_profissional)}`).join('; ')
          : null,
        observacoes: observacoes || null,
        status: "rascunho",
      };

      if (isEditing) {
        const { error } = await supabase
          .from('ages_propostas')
          .update(payload)
          .eq('id', propostaParaEditar.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ages_propostas')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Proposta atualizada!' : 'Proposta criada!');
      queryClient.invalidateQueries({ queryKey: ['ages-lead-propostas', leadId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar proposta');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEditing ? 'Editar Proposta' : 'Nova Proposta'}
            {leadNome && <span className="text-muted-foreground font-normal">para {leadNome}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Unidade */}
          <div className="space-y-2">
            <Label>Unidade *</Label>
            {loadingUnidades ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando unidades...
              </div>
            ) : unidades.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                Nenhuma unidade vinculada a este lead. Vincule unidades primeiro.
              </div>
            ) : (
              <Select value={selectedUnidadeId} onValueChange={setSelectedUnidadeId}>
                <SelectTrigger className="border-primary">
                  <SelectValue placeholder="Selecione uma unidade..." />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{u.nome}</span>
                        {u.cliente && (
                          <span className="text-muted-foreground">- {u.cliente.nome_empresa}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Card do Contrato */}
          {selectedUnidadeId && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
              {loadingContrato ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando contrato...
                </div>
              ) : contratoUnidade ? (
                <>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-semibold">
                      Contrato: {contratoUnidade.codigo_contrato || `#${contratoUnidade.codigo_interno}` || 'S/N'}
                    </span>
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {contratoUnidade.status}
                    </Badge>
                  </div>
                  {contratoUnidade.ages_cliente && (
                    <p className="text-sm text-muted-foreground uppercase">
                      {contratoUnidade.ages_cliente.nome_empresa}
                    </p>
                  )}
                  {contratoUnidade.objeto_contrato && (
                    <p className="text-sm text-muted-foreground">
                      {contratoUnidade.objeto_contrato}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Nenhum contrato ativo encontrado para esta unidade
                </div>
              )}
            </div>
          )}

          {/* Tabela de Itens */}
          {(itensValores.length > 0 || (contratoUnidade && !loadingItens)) && (
            <div className="space-y-3">
              <Label>Itens do Contrato e Valores do Profissional</Label>
              
              {loadingItens ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando itens...
                </div>
              ) : itensValores.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Item/Serviço</TableHead>
                        <TableHead className="text-right w-28">Vl. Contrato</TableHead>
                        <TableHead className="text-right w-28">Vl. Profissional</TableHead>
                        <TableHead className="text-center w-20">Qtd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensValores.map((item, index) => (
                        <TableRow 
                          key={item.contrato_item_id} 
                          className={!item.selecionado ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={item.selecionado}
                              onCheckedChange={() => toggleItemSelecionado(index)}
                              className="border-primary data-[state=checked]:bg-primary"
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.item_nome}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.isCustom ? '-' : formatCurrency(item.valor_contrato)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 text-right h-8"
                              value={item.valor_profissional || ""}
                              onChange={(e) => handleValorProfissionalChange(index, e.target.value)}
                              placeholder="0,00"
                              disabled={!item.selecionado}
                            />
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {item.quantidade}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-2">
                  Nenhum item cadastrado neste contrato
                </div>
              )}

              {/* Adicionar item customizado */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Itens Adicionais (Plantão, Hora, etc.)</Label>
                <div className="flex gap-2">
                  <Input
                    value={novoItemNome}
                    onChange={(e) => setNovoItemNome(e.target.value)}
                    placeholder="Ex: Plantão 12h, Hora extra, Sobreaviso..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomItem()}
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddCustomItem}
                    disabled={!novoItemNome.trim()}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </div>

              {/* Resumo */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {itensSelecionados.length} itens do contrato selecionados
                </span>
                <Badge variant="outline">
                  Total: {itensSelecionados.length} itens
                </Badge>
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações sobre a proposta..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending || !selectedUnidadeId}
            >
              {saveMutation.isPending ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar Proposta')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
