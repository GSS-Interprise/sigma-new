import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Check, 
  ChevronsUpDown, 
  Building2, 
  Trophy, 
  AlertTriangle,
  Plus,
  Trash2,
  Package,
  Users,
  Star,
  X,
  Building
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LicitacaoResultadoItensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacaoId: string;
  novoStatus: string;
  licitacaoTitulo?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ItemLicitacao {
  id?: string;
  nome: string;
  tipo: string;
  descricao?: string;
  valor_referencia?: number;
  quantidade?: number;
  unidade_medida?: string;
  concorrentes: ConcorrenteItem[];
}

interface ConcorrenteItem {
  id?: string;
  empresa_id?: string;
  empresa_nome: string;
  empresa_cnpj?: string;
  valor_ofertado: number;
  posicao: number;
  situacao: 'habilitada' | 'inabilitada' | 'desclassificada';
  motivo_situacao?: string;
  is_gss: boolean;
  is_vencedor: boolean;
  observacoes?: string;
}

const TIPO_ITEM_OPTIONS = [
  { value: 'consulta', label: 'Consulta' },
  { value: 'exame', label: 'Exame' },
  { value: 'servico', label: 'Serviço Médico' },
  { value: 'plantao', label: 'Plantão' },
  { value: 'teleconsulta', label: 'Teleconsulta' },
  { value: 'outro', label: 'Outro' },
];

const SITUACAO_OPTIONS = [
  { value: 'habilitada', label: 'Habilitada', color: 'bg-green-500' },
  { value: 'inabilitada', label: 'Inabilitada', color: 'bg-orange-500' },
  { value: 'desclassificada', label: 'Desclassificada', color: 'bg-red-500' },
];

const STATUS_LABELS: Record<string, string> = {
  arrematados: 'Ganha',
  nao_ganhamos: 'Não Ganhamos',
  descarte_edital: 'Perdida/Encerrada',
};

export function LicitacaoResultadoItensDialog({
  open,
  onOpenChange,
  licitacaoId,
  novoStatus,
  licitacaoTitulo,
  onConfirm,
  onCancel,
}: LicitacaoResultadoItensDialogProps) {
  const queryClient = useQueryClient();
  const [itens, setItens] = useState<ItemLicitacao[]>([]);
  const [observacoesGerais, setObservacoesGerais] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Buscar empresas concorrentes existentes
  const { data: empresasConcorrentes = [] } = useQuery({
    queryKey: ['empresas-concorrentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas_concorrentes')
        .select('id, nome, cnpj')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  // Buscar itens existentes para esta licitação
  const { data: itensExistentes } = useQuery({
    queryKey: ['licitacao-itens', licitacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitacao_itens')
        .select(`
          *,
          licitacao_item_concorrentes(*)
        `)
        .eq('licitacao_id', licitacaoId)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!licitacaoId,
  });

  // Preencher com dados existentes
  useEffect(() => {
    if (itensExistentes && itensExistentes.length > 0) {
      const itensFormatados: ItemLicitacao[] = itensExistentes.map((item: any) => ({
        id: item.id,
        nome: item.nome,
        tipo: item.tipo,
        descricao: item.descricao || '',
        valor_referencia: item.valor_referencia,
        quantidade: item.quantidade || 1,
        unidade_medida: item.unidade_medida || '',
        concorrentes: (item.licitacao_item_concorrentes || []).map((c: any) => ({
          id: c.id,
          empresa_id: c.empresa_id,
          empresa_nome: c.empresa_nome,
          empresa_cnpj: c.empresa_cnpj || '',
          valor_ofertado: c.valor_ofertado,
          posicao: c.posicao,
          situacao: c.situacao,
          motivo_situacao: c.motivo_situacao || '',
          is_gss: c.is_gss,
          is_vencedor: c.is_vencedor,
          observacoes: c.observacoes || '',
        })),
      }));
      setItens(itensFormatados);
    }
  }, [itensExistentes]);

  // Resetar form quando abrir sem dados existentes
  useEffect(() => {
    if (open && (!itensExistentes || itensExistentes.length === 0)) {
      setItens([]);
      setObservacoesGerais("");
    }
  }, [open, itensExistentes]);

  const addItem = () => {
    setItens([...itens, {
      nome: '',
      tipo: 'servico',
      concorrentes: [{
        empresa_nome: '',
        valor_ofertado: 0,
        posicao: 1,
        situacao: 'habilitada',
        is_gss: false,
        is_vencedor: false,
      }],
    }]);
  };

  const removeItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemLicitacao, value: any) => {
    const newItens = [...itens];
    (newItens[index] as any)[field] = value;
    setItens(newItens);
  };

  const addConcorrente = (itemIndex: number) => {
    const newItens = [...itens];
    const nextPos = newItens[itemIndex].concorrentes.length + 1;
    newItens[itemIndex].concorrentes.push({
      empresa_nome: '',
      valor_ofertado: 0,
      posicao: nextPos,
      situacao: 'habilitada',
      is_gss: false,
      is_vencedor: false,
    });
    setItens(newItens);
  };

  const removeConcorrente = (itemIndex: number, concIndex: number) => {
    const newItens = [...itens];
    newItens[itemIndex].concorrentes = newItens[itemIndex].concorrentes.filter((_, i) => i !== concIndex);
    // Recalcular posições
    newItens[itemIndex].concorrentes.forEach((c, i) => {
      c.posicao = i + 1;
    });
    setItens(newItens);
  };

  const updateConcorrente = (itemIndex: number, concIndex: number, field: keyof ConcorrenteItem, value: any) => {
    const newItens = [...itens];
    (newItens[itemIndex].concorrentes[concIndex] as any)[field] = value;
    
    // Se marcou como vencedor, desmarcar os outros
    if (field === 'is_vencedor' && value === true) {
      newItens[itemIndex].concorrentes.forEach((c, i) => {
        if (i !== concIndex) c.is_vencedor = false;
      });
    }
    
    setItens(newItens);
  };

  const selectEmpresa = (itemIndex: number, concIndex: number, empresa: { id: string; nome: string; cnpj?: string }) => {
    const newItens = [...itens];
    newItens[itemIndex].concorrentes[concIndex].empresa_id = empresa.id;
    newItens[itemIndex].concorrentes[concIndex].empresa_nome = empresa.nome;
    newItens[itemIndex].concorrentes[concIndex].empresa_cnpj = empresa.cnpj || '';
    // Verificar se é GSS
    newItens[itemIndex].concorrentes[concIndex].is_gss = 
      empresa.nome.toLowerCase().includes('gss') || 
      empresa.nome.toLowerCase().includes('grupo serviços');
    setItens(newItens);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleValorChange = (itemIndex: number, concIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numValue = rawValue ? parseFloat(rawValue) / 100 : 0;
    updateConcorrente(itemIndex, concIndex, 'valor_ofertado', numValue);
  };

  const isFormValid = () => {
    return itens.length > 0 && itens.every(item => 
      item.nome.trim() !== '' && 
      item.concorrentes.length > 0 &&
      item.concorrentes.every(c => c.empresa_nome.trim() !== '' && c.valor_ofertado >= 0)
    );
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setIsSubmitting(true);

    try {
      // Para cada item, salvar no banco
      for (const item of itens) {
        let itemId = item.id;

        if (itemId) {
          // Atualizar item existente
          const { error: updateError } = await supabase
            .from('licitacao_itens')
            .update({
              nome: item.nome,
              tipo: item.tipo,
              descricao: item.descricao,
              valor_referencia: item.valor_referencia,
              quantidade: item.quantidade,
              unidade_medida: item.unidade_medida,
            })
            .eq('id', itemId);
          
          if (updateError) throw updateError;

          // Deletar concorrentes antigos
          await supabase
            .from('licitacao_item_concorrentes')
            .delete()
            .eq('item_id', itemId);
        } else {
          // Criar novo item
          const { data: newItem, error: insertError } = await supabase
            .from('licitacao_itens')
            .insert({
              licitacao_id: licitacaoId,
              nome: item.nome,
              tipo: item.tipo,
              descricao: item.descricao,
              valor_referencia: item.valor_referencia,
              quantidade: item.quantidade,
              unidade_medida: item.unidade_medida,
            })
            .select()
            .single();
          
          if (insertError) throw insertError;
          itemId = newItem.id;
        }

        // Inserir concorrentes
        for (const conc of item.concorrentes) {
          // Se empresa não existe no cadastro, criar
          let empresaId = conc.empresa_id;
          if (!empresaId && conc.empresa_nome.trim()) {
            const { data: novaEmpresa, error: empresaError } = await supabase
              .from('empresas_concorrentes')
              .insert({ nome: conc.empresa_nome.trim(), cnpj: conc.empresa_cnpj || null })
              .select()
              .single();
            
            if (!empresaError && novaEmpresa) {
              empresaId = novaEmpresa.id;
            }
          }

          const { error: concError } = await supabase
            .from('licitacao_item_concorrentes')
            .insert({
              item_id: itemId,
              empresa_id: empresaId,
              empresa_nome: conc.empresa_nome,
              empresa_cnpj: conc.empresa_cnpj,
              valor_ofertado: conc.valor_ofertado,
              posicao: conc.posicao,
              situacao: conc.situacao,
              motivo_situacao: conc.motivo_situacao,
              is_gss: conc.is_gss,
              is_vencedor: conc.is_vencedor,
              observacoes: conc.observacoes,
            });
          
          if (concError) throw concError;
        }
      }

      // Atualizar resultado geral da licitação (tabela existente)
      const gssResults = itens.flatMap(i => i.concorrentes.filter(c => c.is_gss));
      const gssVencedor = gssResults.some(c => c.is_vencedor);
      
      // Determinar classificação e valores
      let classificacaoGss: 'primeiro_lugar' | 'segundo_lugar' | 'desclassificada' | 'nao_habilitada' = 'segundo_lugar';
      let valorTotal = 0;
      
      if (gssVencedor) {
        classificacaoGss = 'primeiro_lugar';
      } else if (gssResults.some(c => c.situacao === 'desclassificada')) {
        classificacaoGss = 'desclassificada';
      } else if (gssResults.some(c => c.situacao === 'inabilitada')) {
        classificacaoGss = 'nao_habilitada';
      }

      // Valor total dos vencedores
      itens.forEach(item => {
        const vencedor = item.concorrentes.find(c => c.is_vencedor);
        if (vencedor) valorTotal += vencedor.valor_ofertado * (item.quantidade || 1);
      });

      // Buscar vencedor geral (pode ser GSS ou não)
      const vencedorGeral = itens.flatMap(i => i.concorrentes).find(c => c.is_vencedor);
      
      // Upsert no licitacao_resultados
      const { error: resultadoError } = await supabase
        .from('licitacao_resultados')
        .upsert({
          licitacao_id: licitacaoId,
          empresa_vencedora_nome: vencedorGeral?.empresa_nome || 'N/A',
          empresa_vencedora_id: vencedorGeral?.empresa_id,
          valor_homologado: valorTotal,
          classificacao_gss: classificacaoGss,
          observacoes_estrategicas: observacoesGerais || null,
        }, { onConflict: 'licitacao_id' });
      
      if (resultadoError) throw resultadoError;

      queryClient.invalidateQueries({ queryKey: ['licitacao-itens'] });
      queryClient.invalidateQueries({ queryKey: ['licitacao-resultado'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });

      toast.success("Resultado da licitação registrado com sucesso!");
      onConfirm();
    } catch (error) {
      console.error('Erro ao salvar resultado:', error);
      toast.error('Erro ao salvar resultado da licitação');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Resultado da Licitação - Inteligência Competitiva
          </DialogTitle>
          <DialogDescription>
            {licitacaoTitulo && (
              <span className="font-medium text-foreground">{licitacaoTitulo}</span>
            )}
            <br />
            Registre os itens e concorrentes para alterar o status para{" "}
            <span className="font-semibold text-primary">
              {STATUS_LABELS[novoStatus] || novoStatus}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-4">
            {/* Botão Adicionar Item */}
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Itens da Licitação ({itens.length})
              </h3>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Item
              </Button>
            </div>

            {itens.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhum item cadastrado. Clique em "Adicionar Item" para começar.
                </p>
              </div>
            )}

            <Accordion type="multiple" className="space-y-2">
              {itens.map((item, itemIndex) => (
                <AccordionItem 
                  key={itemIndex} 
                  value={`item-${itemIndex}`}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <Badge variant="outline">{TIPO_ITEM_OPTIONS.find(t => t.value === item.tipo)?.label || item.tipo}</Badge>
                      <span className="font-medium truncate">
                        {item.nome || 'Novo Item'}
                      </span>
                      <Badge variant="secondary" className="ml-auto mr-2">
                        <Users className="h-3 w-3 mr-1" />
                        {item.concorrentes.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {/* Dados do Item */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <Label className="text-xs">Nome do Item *</Label>
                          <Input
                            value={item.nome}
                            onChange={(e) => updateItem(itemIndex, 'nome', e.target.value)}
                            placeholder="Ex: Consultas Cardiologia"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Tipo *</Label>
                          <Select 
                            value={item.tipo} 
                            onValueChange={(v) => updateItem(itemIndex, 'tipo', v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIPO_ITEM_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Valor Referência (R$)</Label>
                          <Input
                            type="text"
                            value={item.valor_referencia ? formatCurrency(item.valor_referencia) : ''}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/\D/g, '');
                              updateItem(itemIndex, 'valor_referencia', rawValue ? parseFloat(rawValue) / 100 : undefined);
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            value={item.quantidade || 1}
                            onChange={(e) => updateItem(itemIndex, 'quantidade', parseInt(e.target.value) || 1)}
                            min={1}
                          />
                        </div>
                      </div>

                      {/* Concorrentes */}
                      <div className="border-t pt-3">
                        <div className="flex justify-between items-center mb-2">
                          <Label className="text-xs font-semibold flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            Concorrentes
                          </Label>
                          <Button variant="ghost" size="sm" onClick={() => addConcorrente(itemIndex)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {item.concorrentes.map((conc, concIndex) => (
                            <div 
                              key={concIndex} 
                              className={cn(
                                "grid grid-cols-12 gap-2 p-2 rounded-md border",
                                conc.is_gss && "bg-primary/5 border-primary/30",
                                conc.is_vencedor && "ring-2 ring-yellow-500"
                              )}
                            >
                              {/* Posição */}
                              <div className="col-span-1">
                                <Label className="text-xs">Pos.</Label>
                                <Input
                                  type="number"
                                  value={conc.posicao}
                                  onChange={(e) => updateConcorrente(itemIndex, concIndex, 'posicao', parseInt(e.target.value) || 1)}
                                  className="text-center h-8"
                                  min={1}
                                />
                              </div>

                              {/* Empresa */}
                              <div className="col-span-3">
                                <Label className="text-xs">Empresa *</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      className="w-full justify-between h-8 text-xs font-normal"
                                    >
                                      <span className="truncate">
                                        {conc.empresa_nome || "Selecionar..."}
                                      </span>
                                      <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[300px] p-0" align="start">
                                    <Command>
                                      <CommandInput
                                        placeholder="Buscar ou criar..."
                                        value={conc.empresa_nome}
                                        onValueChange={(v) => updateConcorrente(itemIndex, concIndex, 'empresa_nome', v)}
                                      />
                                      <CommandList>
                                        <CommandEmpty>
                                          {conc.empresa_nome.trim() ? (
                                            <div className="p-2 text-xs">
                                              <span className="text-muted-foreground">Nova: </span>
                                              <span className="font-medium">{conc.empresa_nome}</span>
                                            </div>
                                          ) : "Digite o nome"}
                                        </CommandEmpty>
                                        <CommandGroup heading="Cadastradas">
                                          {empresasConcorrentes
                                            .filter(e => e.nome.toLowerCase().includes(conc.empresa_nome.toLowerCase()))
                                            .slice(0, 10)
                                            .map((emp) => (
                                              <CommandItem
                                                key={emp.id}
                                                value={emp.nome}
                                                onSelect={() => selectEmpresa(itemIndex, concIndex, emp)}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-3 w-3",
                                                    conc.empresa_id === emp.id ? "opacity-100" : "opacity-0"
                                                  )}
                                                />
                                                <span className="truncate">{emp.nome}</span>
                                              </CommandItem>
                                            ))}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>

                              {/* Valor */}
                              <div className="col-span-2">
                                <Label className="text-xs">Valor (R$) *</Label>
                                <Input
                                  type="text"
                                  value={formatCurrency(conc.valor_ofertado)}
                                  onChange={(e) => handleValorChange(itemIndex, concIndex, e)}
                                  className="h-8 text-xs"
                                  placeholder="0,00"
                                />
                              </div>

                              {/* Situação */}
                              <div className="col-span-2">
                                <Label className="text-xs">Situação</Label>
                                <Select 
                                  value={conc.situacao} 
                                  onValueChange={(v) => updateConcorrente(itemIndex, concIndex, 'situacao', v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SITUACAO_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        <div className="flex items-center gap-2">
                                          <div className={cn("w-2 h-2 rounded-full", opt.color)} />
                                          {opt.label}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Flags */}
                              <div className="col-span-3 flex items-end gap-2">
                                <div className="flex items-center gap-1">
                                  <Checkbox
                                    id={`gss-${itemIndex}-${concIndex}`}
                                    checked={conc.is_gss}
                                    onCheckedChange={(checked) => 
                                      updateConcorrente(itemIndex, concIndex, 'is_gss', !!checked)
                                    }
                                  />
                                  <Label htmlFor={`gss-${itemIndex}-${concIndex}`} className="text-xs cursor-pointer">
                                    GSS
                                  </Label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox
                                    id={`venc-${itemIndex}-${concIndex}`}
                                    checked={conc.is_vencedor}
                                    onCheckedChange={(checked) => 
                                      updateConcorrente(itemIndex, concIndex, 'is_vencedor', !!checked)
                                    }
                                  />
                                  <Label htmlFor={`venc-${itemIndex}-${concIndex}`} className="text-xs cursor-pointer flex items-center gap-1">
                                    <Star className="h-3 w-3 text-yellow-500" />
                                    Vencedor
                                  </Label>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-auto"
                                  onClick={() => removeConcorrente(itemIndex, concIndex)}
                                  disabled={item.concorrentes.length <= 1}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Remover Item */}
                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeItem(itemIndex)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remover Item
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Observações Gerais */}
            {itens.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <Label>Observações Estratégicas</Label>
                <Textarea
                  value={observacoesGerais}
                  onChange={(e) => setObservacoesGerais(e.target.value)}
                  placeholder="Insights sobre a disputa, pontos de melhoria, informações sobre concorrentes..."
                  rows={3}
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid() || isSubmitting}>
            {isSubmitting ? "Salvando..." : "Confirmar e Alterar Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
