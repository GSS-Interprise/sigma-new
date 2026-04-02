import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Renovacao {
  id: string;
  data_vigencia: Date;
  percentual_reajuste: number;
  valor: number;
}

interface AbaRenovacaoContratoAgesProps {
  renovacoes: Renovacao[];
  onRenovacoesChange: (renovacoes: Renovacao[]) => void;
  isViewMode?: boolean;
}

export function AbaRenovacaoContratoAges({ renovacoes, onRenovacoesChange, isViewMode = false }: AbaRenovacaoContratoAgesProps) {
  const [novaRenovacao, setNovaRenovacao] = useState<{
    data_vigencia: Date | undefined;
    percentual_reajuste: number;
    valor: number;
  }>({
    data_vigencia: undefined,
    percentual_reajuste: 0,
    valor: 0,
  });

  const adicionarRenovacao = () => {
    if (!novaRenovacao.data_vigencia || novaRenovacao.valor <= 0) {
      return;
    }

    const renovacaoComId: Renovacao = {
      id: crypto.randomUUID(),
      data_vigencia: novaRenovacao.data_vigencia,
      percentual_reajuste: novaRenovacao.percentual_reajuste,
      valor: novaRenovacao.valor,
    };

    onRenovacoesChange([...renovacoes, renovacaoComId]);
    setNovaRenovacao({
      data_vigencia: undefined,
      percentual_reajuste: 0,
      valor: 0,
    });
  };

  const removerRenovacao = (id: string) => {
    onRenovacoesChange(renovacoes.filter((ren) => ren.id !== id));
  };

  const parseLocalDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renovações do Contrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de renovações existentes */}
        {renovacoes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Renovações Registradas</h4>
            {renovacoes.map((renovacao) => (
              <div
                key={renovacao.id}
                className="flex items-center justify-between p-3 border rounded-md bg-muted/50"
              >
                <div className="flex-1 space-y-1">
                  <p className="font-medium">
                    Vigência: {format(renovacao.data_vigencia, "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Reajuste: {renovacao.percentual_reajuste}%</span>
                    <span>
                      Valor:{" "}
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(renovacao.valor)}
                    </span>
                  </div>
                </div>
                {!isViewMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removerRenovacao(renovacao.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formulário para adicionar nova renovação */}
        {!isViewMode && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Adicionar Nova Renovação</h4>
            
            <div className="space-y-3">
              <div>
                <Label>Data de Vigência</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 pl-3 text-left font-normal",
                          !novaRenovacao.data_vigencia && "text-muted-foreground"
                        )}
                      >
                        {novaRenovacao.data_vigencia ? (
                          format(novaRenovacao.data_vigencia, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span>Selecione a data</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={novaRenovacao.data_vigencia}
                        onSelect={(date) =>
                          setNovaRenovacao({ ...novaRenovacao, data_vigencia: date })
                        }
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  type="date"
                  value={
                    novaRenovacao.data_vigencia
                      ? format(novaRenovacao.data_vigencia, "yyyy-MM-dd")
                      : ""
                  }
                  onChange={(e) => {
                    const parsedDate = parseLocalDate(e.target.value);
                    setNovaRenovacao({
                      ...novaRenovacao,
                      data_vigencia: parsedDate || undefined,
                    });
                  }}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Percentual de Reajuste (%)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  max="100"
                  value={novaRenovacao.percentual_reajuste || ""}
                  onChange={(e) =>
                    setNovaRenovacao({
                      ...novaRenovacao,
                      percentual_reajuste: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div>
                <Label>Valor</Label>
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
                    value={novaRenovacao.valor || ""}
                    onChange={(e) =>
                      setNovaRenovacao({
                        ...novaRenovacao,
                        valor: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={adicionarRenovacao}
                className="w-full"
                disabled={!novaRenovacao.data_vigencia || novaRenovacao.valor <= 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Renovação
              </Button>
            </div>
          </div>
        )}

        {renovacoes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma renovação registrada. {!isViewMode && "Use o formulário acima para adicionar renovações."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
