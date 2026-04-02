import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";

interface ItemContrato {
  id: string;
  item: string;
  valor_item: number;
  quantidade?: number;
}

interface AbaItensContratoAgesProps {
  itens: ItemContrato[];
  onItensChange: (itens: ItemContrato[]) => void;
  isViewMode?: boolean;
}

export function AbaItensContratoAges({ itens, onItensChange, isViewMode = false }: AbaItensContratoAgesProps) {
  const [novoItem, setNovoItem] = useState({ item: "", valor_item: 0, quantidade: 1 });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [itemEditado, setItemEditado] = useState<ItemContrato | null>(null);

  const adicionarItem = () => {
    if (!novoItem.item || novoItem.valor_item <= 0 || novoItem.quantidade <= 0) {
      return;
    }

    const itemComId: ItemContrato = {
      id: crypto.randomUUID(),
      item: novoItem.item,
      valor_item: novoItem.valor_item,
      quantidade: novoItem.quantidade,
    };

    onItensChange([...itens, itemComId]);
    setNovoItem({ item: "", valor_item: 0, quantidade: 1 });
  };

  const removerItem = (id: string) => {
    onItensChange(itens.filter((item) => item.id !== id));
  };

  const iniciarEdicao = (item: ItemContrato) => {
    setEditandoId(item.id);
    setItemEditado({ ...item });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setItemEditado(null);
  };

  const salvarEdicao = () => {
    if (!itemEditado || !itemEditado.item || itemEditado.valor_item <= 0 || (itemEditado.quantidade || 1) <= 0) {
      return;
    }
    
    onItensChange(itens.map(item => 
      item.id === editandoId ? itemEditado : item
    ));
    cancelarEdicao();
  };

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => total + (item.valor_item * (item.quantidade || 1)), 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Descrição dos Itens do Contrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de itens existentes */}
        {itens.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Itens Adicionados</h4>
            {itens.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 border rounded-md bg-muted/50"
              >
                {editandoId === item.id && itemEditado ? (
                  <>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Descrição do Item"
                        value={itemEditado.item}
                        onChange={(e) => setItemEditado({ ...itemEditado, item: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder="Quantidade"
                          min="1"
                          value={itemEditado.quantidade || ""}
                          onChange={(e) => setItemEditado({ 
                            ...itemEditado, 
                            quantidade: e.target.value ? parseInt(e.target.value) : undefined 
                          })}
                        />
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            R$
                          </span>
                          <Input
                            type="number"
                            placeholder="Valor"
                            step="0.01"
                            min="0"
                            className="pl-10"
                            value={itemEditado.valor_item || ""}
                            onChange={(e) => setItemEditado({ 
                              ...itemEditado, 
                              valor_item: parseFloat(e.target.value) || 0 
                            })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={salvarEdicao}
                        disabled={!itemEditado.item || itemEditado.valor_item <= 0}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelarEdicao}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="font-medium">{item.item}</p>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Qtd: {item.quantidade || 1}</span>
                        <span>Valor unitário: {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(item.valor_item)}</span>
                        <span className="font-semibold text-foreground">Total: {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(item.valor_item * (item.quantidade || 1))}</span>
                      </div>
                    </div>
                    {!isViewMode && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => iniciarEdicao(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removerItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            <div className="pt-2 border-t">
              <div className="flex justify-between items-center font-semibold">
                <span>Valor Total:</span>
                <span className="text-lg">
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(calcularValorTotal())}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Formulário para adicionar novo item */}
        {!isViewMode && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Adicionar Novo Item</h4>
            
            <div className="space-y-3">
              <div>
                <Label>Descrição do Item</Label>
                <Input
                  placeholder="Ex: Plantão 12h, Consulta, etc."
                  value={novoItem.item}
                  onChange={(e) => setNovoItem({ ...novoItem, item: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    min="1"
                    value={novoItem.quantidade || ""}
                    onChange={(e) =>
                      setNovoItem({
                        ...novoItem,
                        quantidade: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Valor Unitário</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      R$
                    </span>
                    <Input
                      type="number"
                      placeholder="0,00"
                      step="0.01"
                      min="0"
                      className="pl-10"
                      value={novoItem.valor_item || ""}
                      onChange={(e) =>
                        setNovoItem({
                          ...novoItem,
                          valor_item: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={adicionarItem}
                className="w-full"
                disabled={!novoItem.item || novoItem.valor_item <= 0 || novoItem.quantidade <= 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Item
              </Button>
            </div>
          </div>
        )}

        {itens.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum item adicionado ainda. {!isViewMode && "Use o formulário acima para adicionar itens."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
