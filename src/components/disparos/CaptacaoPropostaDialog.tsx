import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, FileText, DollarSign, Plus, Trash2, MessageSquare, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface CaptacaoPropostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  contratoNome?: string;
  onSuccess?: () => void;
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

export function CaptacaoPropostaDialog({
  open,
  onOpenChange,
  contratoId,
  contratoNome,
  onSuccess,
}: CaptacaoPropostaDialogProps) {
  const queryClient = useQueryClient();
  const [itensValores, setItensValores] = useState<ItemValor[]>([]);
  const [itensCustom, setItensCustom] = useState<ItemValor[]>([]);
  const [novoItemNome, setNovoItemNome] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [nomeDestino, setNomeDestino] = useState("");
  const [tipoDisparo, setTipoDisparo] = useState<"zap" | "email">("zap");

  // Fetch itens do contrato
  const { data: contratoItens, isLoading: loadingItens } = useQuery({
    queryKey: ["captacao-contrato-itens", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_itens")
        .select("id, item, valor_item, quantidade")
        .eq("contrato_id", contratoId)
        .order("item");
      if (error) throw error;
      return data as ContratoItem[];
    },
    enabled: open && !!contratoId,
  });

  // Popula itens quando carrega
  useEffect(() => {
    if (contratoItens && contratoItens.length > 0) {
      setItensValores(
        contratoItens.map((item) => ({
          contrato_item_id: item.id,
          item_nome: item.item,
          valor_contrato: item.valor_item,
          valor_medico: 0,
          quantidade: item.quantidade || 1,
          selecionado: true,
          is_custom: false,
        }))
      );
    } else {
      setItensValores([]);
    }
  }, [contratoItens]);

  // Mutation para criar proposta
  const savePropostaMutation = useMutation({
    mutationFn: async () => {
      const itensSelecionados = itensValores.filter((item) => item.selecionado);
      const todosItens = [...itensSelecionados, ...itensCustom];

      if (todosItens.length === 0) {
        throw new Error("Selecione pelo menos um item");
      }

      // Criar proposta vinculada ao contrato
      const { data: proposta, error: propostaError } = await supabase
        .from("proposta")
        .insert({
          contrato_id: contratoId,
          status: "geral",
          valor: 0,
          observacoes: observacoes || null,
          descricao: `Proposta de Captação - ${nomeDestino || contratoNome || "Contrato"}`,
          tipo_disparo: tipoDisparo,
        })
        .select()
        .single();

      if (propostaError) throw propostaError;

      // Inserir itens da proposta
      const itensParaInserir = todosItens.map((item) => ({
        proposta_id: proposta.id,
        contrato_item_id: item.contrato_item_id,
        item_nome: item.item_nome,
        valor_contrato: item.valor_contrato,
        valor_medico: item.valor_medico,
        quantidade: item.quantidade,
      }));

      const { error: itensError } = await supabase
        .from("proposta_itens")
        .insert(itensParaInserir);

      if (itensError) throw itensError;

      return proposta;
    },
    onSuccess: () => {
      toast.success("Proposta criada!");
      // Invalidate both possible query keys to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["captacao-propostas", contratoId] });
      queryClient.invalidateQueries({ queryKey: ["contratos-captacao-propostas"] });
      queryClient.invalidateQueries({ queryKey: ["proposta-itens"] });
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error("Erro ao criar proposta: " + error.message);
    },
  });

  const handleClose = () => {
    setItensValores([]);
    setItensCustom([]);
    setNovoItemNome("");
    setObservacoes("");
    setNomeDestino("");
    setTipoDisparo("zap");
    onOpenChange(false);
  };

  const toggleItemSelecionado = (index: number) => {
    setItensValores((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selecionado: !updated[index].selecionado };
      return updated;
    });
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

    setItensCustom((prev) => [...prev, novoItem]);
    setNovoItemNome("");
  };

  const updateValorMedico = (index: number, valor: number) => {
    setItensValores((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], valor_medico: valor };
      return updated;
    });
  };

  const updateValorMedicoCustom = (index: number, valor: number) => {
    setItensCustom((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], valor_medico: valor };
      return updated;
    });
  };

  const removerItemCustom = (index: number) => {
    setItensCustom((prev) => prev.filter((_, i) => i !== index));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const itensSelecionados = itensValores.filter((item) => item.selecionado);
  const totalItens = itensSelecionados.length + itensCustom.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nova Proposta de Captação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tipo de Disparo */}
          <div className="space-y-2">
            <Label>Tipo de Disparo</Label>
            <Select value={tipoDisparo} onValueChange={(value: "zap" | "email") => setTipoDisparo(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zap">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    <span>WhatsApp</span>
                  </div>
                </SelectItem>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span>E-mail</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nome/Destino da proposta */}
          <div className="space-y-2">
            <Label>Nome do Destinatário / Descrição</Label>
            <Input
              placeholder="Ex: Dr. João Silva, Hospital X..."
              value={nomeDestino}
              onChange={(e) => setNomeDestino(e.target.value)}
            />
          </div>

          {/* Tabela de Itens do Contrato */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Itens do Contrato e Valores
            </Label>
            {loadingItens ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : itensValores.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Valor Contrato</TableHead>
                      <TableHead className="text-right">Valor Médico</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensValores.map((item, index) => (
                      <TableRow key={index}>
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
                            className="w-32 text-right ml-auto"
                            value={item.valor_medico || ""}
                            onChange={(e) =>
                              updateValorMedico(index, parseFloat(e.target.value) || 0)
                            }
                            disabled={!item.selecionado}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum item cadastrado neste contrato
              </p>
            )}
          </div>

          {/* Itens customizados */}
          <div className="space-y-2">
            <Label>Adicionar Item Personalizado</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do item..."
                value={novoItemNome}
                onChange={(e) => setNovoItemNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionarItemCustom()}
              />
              <Button type="button" onClick={adicionarItemCustom} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {itensCustom.length > 0 && (
              <div className="space-y-2 mt-2">
                {itensCustom.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <span className="flex-1 text-sm">{item.item_nome}</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-32 text-right"
                      placeholder="Valor"
                      value={item.valor_medico || ""}
                      onChange={(e) =>
                        updateValorMedicoCustom(index, parseFloat(e.target.value) || 0)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removerItemCustom(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumo */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm">
              <strong>{totalItens}</strong> {totalItens === 1 ? "item selecionado" : "itens selecionados"}
            </p>
          </div>

          {/* Mensagem que será enviada */}
          <div className="space-y-2">
            <Label>Mensagem que será enviada</Label>
            <Textarea
              placeholder="Mensagem que será enviada ao médico..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
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
            disabled={savePropostaMutation.isPending || totalItens === 0}
          >
            {savePropostaMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Criar Proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
