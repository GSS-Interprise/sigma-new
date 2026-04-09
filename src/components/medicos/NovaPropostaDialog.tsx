import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Building2, FileText, DollarSign, MapPin, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface PropostaParaEditar {
  id: string;
  unidade_id?: string | null;
  contrato_id?: string | null;
  observacoes?: string | null;
  valor?: number | null;
}

interface NovaPropostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadNome?: string;
  unidadesVinculadas?: string[];
  propostaParaEditar?: PropostaParaEditar | null;
}

interface ContratoItem {
  id: string;
  item: string;
  valor_item: number;
  quantidade: number | null;
}

interface ItemValor {
  contrato_item_id: string | null;
  item_nome: string;
  valor_contrato: number;
  valor_medico: number;
  quantidade: number;
  selecionado: boolean;
  is_custom?: boolean;
}

export function NovaPropostaDialog({ open, onOpenChange, leadId, leadNome, unidadesVinculadas, propostaParaEditar }: NovaPropostaDialogProps) {
  const queryClient = useQueryClient();
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("");
  const [itensValores, setItensValores] = useState<ItemValor[]>([]);
  const [itensCustom, setItensCustom] = useState<ItemValor[]>([]);
  const [novoItemNome, setNovoItemNome] = useState("");
  const [observacoes, setObservacoes] = useState("");
  
  const isEditing = !!propostaParaEditar;

  // Load existing proposta data when editing
  useEffect(() => {
    if (open && propostaParaEditar) {
      if (propostaParaEditar.unidade_id) {
        setSelectedUnidadeId(propostaParaEditar.unidade_id);
      }
      setObservacoes(propostaParaEditar.observacoes || "");
    }
  }, [open, propostaParaEditar]);

  // Load existing proposta itens when editing
  const { data: propostaItensExistentes } = useQuery({
    queryKey: ['proposta-itens-editar', propostaParaEditar?.id],
    queryFn: async () => {
      if (!propostaParaEditar?.id) return [];
      const { data, error } = await supabase
        .from('proposta_itens')
        .select('*')
        .eq('proposta_id', propostaParaEditar.id);
      if (error) throw error;
      return data;
    },
    enabled: open && !!propostaParaEditar?.id,
  });
  // Fetch unidades vinculadas ao lead com seus contratos
  const { data: unidades, isLoading: loadingUnidades } = useQuery({
    queryKey: ['unidades-vinculadas-lead', unidadesVinculadas],
    queryFn: async () => {
      if (!unidadesVinculadas || unidadesVinculadas.length === 0) return [];
      
      const { data, error } = await supabase
        .from('unidades')
        .select(`
          id,
          nome,
          codigo,
          cliente_id,
          cliente:clientes!unidades_cliente_id_fkey(id, nome_empresa)
        `)
        .in('id', unidadesVinculadas);
      
      if (error) throw error;
      return data;
    },
    enabled: open && !!unidadesVinculadas && unidadesVinculadas.length > 0,
  });

  // Fetch contrato vinculado à unidade selecionada
  const { data: contratoUnidade, isLoading: loadingContrato } = useQuery({
    queryKey: ['contrato-por-unidade', selectedUnidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          id,
          codigo_contrato,
          objeto_contrato,
          status_contrato,
          unidade_id,
          cliente_id,
          cliente:clientes!contratos_cliente_id_fkey(id, nome_empresa),
          unidade:unidades!contratos_unidade_id_fkey(id, nome)
        `)
        .eq('unidade_id', selectedUnidadeId)
        .in('status_contrato', ['Ativo', 'Pre-Contrato', 'Ativo (Em Renovação)'])
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUnidadeId,
  });

  // Fetch itens do contrato
  const { data: contratoItens, isLoading: loadingItens } = useQuery({
    queryKey: ['contrato-itens', contratoUnidade?.id],
    queryFn: async () => {
      if (!contratoUnidade?.id) return [];
      
      const { data, error } = await supabase
        .from('contrato_itens')
        .select('id, item, valor_item, quantidade')
        .eq('contrato_id', contratoUnidade.id)
        .order('item');
      
      if (error) throw error;
      return data as ContratoItem[];
    },
    enabled: !!contratoUnidade?.id,
  });

  // Quando carrega os itens do contrato, popula os valores
  useEffect(() => {
    if (contratoItens && contratoItens.length > 0) {
      // Se estamos editando e já temos os itens da proposta, usa os valores existentes
      const itensExistentesMap = new Map(
        (propostaItensExistentes || []).map((pi: any) => [pi.contrato_item_id, pi])
      );
      
      setItensValores(contratoItens.map(item => {
        const existente = itensExistentesMap.get(item.id);
        return {
          contrato_item_id: item.id,
          item_nome: item.item,
          valor_contrato: item.valor_item,
          valor_medico: existente?.valor_medico ?? 0,
          quantidade: item.quantidade || 1,
          selecionado: !isEditing || !!existente,
          is_custom: false,
        };
      }));
    } else {
      setItensValores([]);
    }
  }, [contratoItens, propostaItensExistentes, isEditing]);

  // Carrega itens existentes que não fazem parte do contrato atual (customizados OU clonados de outra proposta)
  useEffect(() => {
    if (isEditing && propostaItensExistentes && propostaItensExistentes.length > 0) {
      // IDs dos itens do contrato atual para excluir da lista de "custom"
      const contratoItemIds = new Set((contratoItens || []).map((ci: ContratoItem) => ci.id));
      
      // Todos os itens que NÃO têm contrato_item_id correspondente ao contrato atual
      // (isso inclui itens sem contrato_item_id E itens clonados de outras propostas)
      const itensNaoDoContrato = propostaItensExistentes
        .filter((pi: any) => !pi.contrato_item_id || !contratoItemIds.has(pi.contrato_item_id))
        .map((pi: any) => ({
          contrato_item_id: null, // Remove o contrato_item_id para evitar conflitos
          item_nome: pi.item_nome,
          valor_contrato: pi.valor_contrato || 0,
          valor_medico: pi.valor_medico || 0,
          quantidade: pi.quantidade || 1,
          selecionado: true,
          is_custom: true,
        }));
      setItensCustom(itensNaoDoContrato);
    }
  }, [propostaItensExistentes, contratoItens, isEditing]);

  // Unidade selecionada
  const unidadeSelecionada = unidades?.find(u => u.id === selectedUnidadeId);

  // Mutation para criar/atualizar proposta
  const savePropostaMutation = useMutation({
    mutationFn: async () => {
      // Para criar, precisa de unidade e contrato. Para editar, permite apenas itens customizados
      if (!isEditing && (!selectedUnidadeId || !contratoUnidade)) {
        throw new Error("Selecione uma unidade com contrato vinculado");
      }

      const itensSelecionadosContrato = itensValores.filter(item => item.selecionado);
      const todosItensSelecionados = [...itensSelecionadosContrato, ...itensCustom];

      if (isEditing && propostaParaEditar) {
        // UPDATE existing proposta
        const { error: updateError } = await supabase
          .from('proposta')
          .update({
            contrato_id: contratoUnidade?.id || propostaParaEditar.contrato_id,
            unidade_id: selectedUnidadeId || propostaParaEditar.unidade_id,
            observacoes: observacoes || null,
            descricao: `Proposta para ${leadNome || 'Lead'} - ${unidadeSelecionada?.nome || 'Unidade'} - Contrato ${contratoUnidade?.codigo_contrato || 'S/N'}`,
          })
          .eq('id', propostaParaEditar.id);

        if (updateError) throw updateError;

        // Delete existing itens and recreate
        await supabase
          .from('proposta_itens')
          .delete()
          .eq('proposta_id', propostaParaEditar.id);

        if (todosItensSelecionados.length > 0) {
          const itensParaInserir = todosItensSelecionados.map(item => ({
            proposta_id: propostaParaEditar.id,
            contrato_item_id: item.contrato_item_id,
            item_nome: item.item_nome,
            valor_contrato: item.valor_contrato,
            valor_medico: item.valor_medico,
            quantidade: item.quantidade,
          }));

          const { error: itensError } = await supabase
            .from('proposta_itens')
            .insert(itensParaInserir);

          if (itensError) throw itensError;
        }

        return { id: propostaParaEditar.id };
      } else {
        // CREATE new proposta - propostas criadas no prontuário são sempre personalizadas
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        
        // Calcular numero_proposta
        const { data: maxProposta } = await supabase
          .from('proposta')
          .select('numero_proposta')
          .eq('lead_id', leadId)
          .order('numero_proposta', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextNumero = (maxProposta?.numero_proposta || 0) + 1;
        
        const { data: proposta, error: propostaError } = await supabase
          .from('proposta')
          .insert({
            lead_id: leadId,
            contrato_id: contratoUnidade.id,
            unidade_id: selectedUnidadeId,
            tipo: 'personalizada', // Propostas do prontuário são personalizadas (não para disparo)
            status: 'personalizada',
            valor: 0,
            nome: `Proposta personalizada - ${leadNome || 'Lead'}`,
            observacoes: observacoes || null,
            descricao: `Proposta personalizada para ${leadNome || 'Lead'} - ${unidadeSelecionada?.nome || 'Unidade'} - Contrato ${contratoUnidade.codigo_contrato || 'S/N'}`,
            criado_por: currentUser?.id || null,
            criado_por_nome: currentUser?.user_metadata?.nome_completo || currentUser?.email || null,
            numero_proposta: nextNumero,
          })
          .select()
          .single();

        if (propostaError) throw propostaError;

        if (todosItensSelecionados.length > 0) {
          const itensParaInserir = todosItensSelecionados.map(item => ({
            proposta_id: proposta.id,
            contrato_item_id: item.contrato_item_id,
            item_nome: item.item_nome,
            valor_contrato: item.valor_contrato,
            valor_medico: item.valor_medico,
            quantidade: item.quantidade,
          }));

          const { error: itensError } = await supabase
            .from('proposta_itens')
            .insert(itensParaInserir);

          if (itensError) throw itensError;
        }

        return proposta;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Proposta atualizada!" : "Proposta criada!");
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['propostas-itens'] });
      handleClose();
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar proposta: " + error.message);
    },
  });

  const handleClose = () => {
    setSelectedUnidadeId("");
    setItensValores([]);
    setItensCustom([]);
    setNovoItemNome("");
    setObservacoes("");
    onOpenChange(false);
  };

  const toggleItemSelecionado = (index: number) => {
    setItensValores(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selecionado: !updated[index].selecionado };
      return updated;
    });
  };

  const toggleTodosItens = (selecionado: boolean) => {
    setItensValores(prev => prev.map(item => ({ ...item, selecionado })));
  };

  const adicionarItemCustom = () => {
    if (!novoItemNome.trim()) return;
    
    const novoItem: ItemValor = {
      contrato_item_id: null,
      item_nome: novoItemNome.trim(),
      valor_contrato: 0,
      valor_medico: 0,
      quantidade: 1,
      selecionado: true,
      is_custom: true,
    };
    
    setItensCustom(prev => [...prev, novoItem]);
    setNovoItemNome("");
  };

  const updateValorMedico = (index: number, valor: number) => {
    setItensValores(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], valor_medico: valor };
      return updated;
    });
  };

  const updateValorMedicoCustom = (index: number, valor: number) => {
    setItensCustom(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], valor_medico: valor };
      return updated;
    });
  };

  const updateValorContratoCustom = (index: number, valor: number) => {
    setItensCustom(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], valor_contrato: valor };
      return updated;
    });
  };

  const removerItemCustom = (index: number) => {
    setItensCustom(prev => prev.filter((_, i) => i !== index));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const itensSelecionados = itensValores.filter(item => item.selecionado);
  const totalItens = itensSelecionados.length + itensCustom.length;
  const todosItensSelecionadosCheck = itensValores.length > 0 && itensValores.every(item => item.selecionado);

  const semUnidades = !unidadesVinculadas || unidadesVinculadas.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEditing ? 'Editar' : 'Nova'} Proposta {leadNome && `para ${leadNome}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Aviso se não tem unidades vinculadas */}
          {semUnidades && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-600">Nenhuma unidade vinculada</p>
                <p className="text-sm text-muted-foreground">
                  Este lead não possui unidades vinculadas. Vincule unidades na aba "Dados" antes de criar uma proposta.
                </p>
              </div>
            </div>
          )}

          {/* Select de Unidade */}
          {!semUnidades && (
            <div className="space-y-2">
              <Label>Unidade *</Label>
              <Select value={selectedUnidadeId} onValueChange={setSelectedUnidadeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma unidade..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingUnidades ? (
                    <div className="p-2 text-center text-muted-foreground">Carregando...</div>
                  ) : unidades?.length === 0 ? (
                    <div className="p-2 text-center text-muted-foreground">Nenhuma unidade encontrada</div>
                  ) : (
                    unidades?.map((unidade: any) => (
                      <SelectItem key={unidade.id} value={unidade.id}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{unidade.nome}</span>
                          {unidade.cliente?.nome_empresa && (
                            <>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-sm text-muted-foreground">{unidade.cliente.nome_empresa}</span>
                            </>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info do Contrato vinculado à Unidade */}
          {selectedUnidadeId && (
            <div className="space-y-2">
              {loadingContrato ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : contratoUnidade ? (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      Contrato: {contratoUnidade.codigo_contrato || 'S/N'}
                    </span>
                    <Badge variant="outline">{contratoUnidade.status_contrato}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {contratoUnidade.cliente?.nome_empresa}
                  </p>
                  {contratoUnidade.objeto_contrato && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {contratoUnidade.objeto_contrato}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Sem contrato ativo</p>
                    <p className="text-sm text-muted-foreground">
                      Esta unidade não possui contrato ativo vinculado.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabela de Itens */}
          {contratoUnidade && (
            <div className="space-y-2">
              <Label>Itens do Contrato e Valores do Médico</Label>
              {loadingItens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : itensValores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Este contrato não possui itens cadastrados.</p>
                  <p className="text-sm">Cadastre itens no contrato primeiro.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={todosItensSelecionadosCheck}
                            onCheckedChange={(checked) => toggleTodosItens(!!checked)}
                          />
                        </TableHead>
                        <TableHead>Item/Serviço</TableHead>
                        <TableHead className="text-right w-28">Vl. Contrato</TableHead>
                        <TableHead className="text-right w-32">Vl. Médico</TableHead>
                        <TableHead className="text-center w-16">Qtd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensValores.map((item, index) => (
                        <TableRow key={item.contrato_item_id || `item-${index}`} className={!item.selecionado ? "opacity-50" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={item.selecionado}
                              onCheckedChange={() => toggleItemSelecionado(index)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.item_nome}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(item.valor_contrato)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.valor_medico || ''}
                              onChange={(e) => updateValorMedico(index, parseFloat(e.target.value) || 0)}
                              className="h-8 w-24 text-right"
                              placeholder="0,00"
                              disabled={!item.selecionado}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {item.quantidade}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Itens Customizados/Existentes - Visível sempre que há unidade selecionada ou editando */}
          {(selectedUnidadeId || isEditing) && (
            <div className="space-y-3">
              <Label>{isEditing && itensCustom.length > 0 ? 'Itens da Proposta (Adicionais + Serviços Vinculados)' : 'Itens Adicionais (Plantão, Hora, etc.)'}</Label>
              
              <div className="flex gap-2">
                <Input
                  value={novoItemNome}
                  onChange={(e) => setNovoItemNome(e.target.value)}
                  placeholder="Ex: Plantão 12h, Hora extra, Sobreaviso..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && adicionarItemCustom()}
                />
                <Button type="button" onClick={adicionarItemCustom} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              {itensCustom.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEditing ? 'Item' : 'Item Adicional'}</TableHead>
                        <TableHead className="text-right w-28">Vl. Fixo</TableHead>
                        <TableHead className="text-right w-28">Vl. Médico</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensCustom.map((item, index) => (
                        <TableRow key={`custom-${index}`}>
                          <TableCell className="font-medium">{item.item_nome}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.valor_contrato || ''}
                              onChange={(e) => updateValorContratoCustom(index, parseFloat(e.target.value) || 0)}
                              className="h-8 w-24 text-right"
                              placeholder="0,00"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.valor_medico || ''}
                              onChange={(e) => updateValorMedicoCustom(index, parseFloat(e.target.value) || 0)}
                              className="h-8 w-24 text-right"
                              placeholder="0,00"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removerItemCustom(index)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Resumo */}
          {(itensValores.length > 0 || itensCustom.length > 0) && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                {itensSelecionados.length} itens do contrato selecionados
              </span>
              {itensCustom.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  + {itensCustom.length} itens adicionais
                </span>
              )}
              <Badge variant="outline" className="ml-auto">
                Total: {totalItens} itens
              </Badge>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={() => savePropostaMutation.mutate()}
            disabled={savePropostaMutation.isPending || semUnidades || (!isEditing && !contratoUnidade)}
          >
            {savePropostaMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? 'Salvando...' : 'Criando...'}
              </>
            ) : (
              isEditing ? "Salvar" : "Criar Proposta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}