import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Unidade {
  id: string;
  nome: string;
  codigo: string | null;
  cliente_id: string;
  cliente_nome: string;
}

interface UnidadeMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function UnidadeMultiSelect({
  value = [],
  onChange,
  disabled = false,
}: UnidadeMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const { data: unidades, isLoading } = useQuery({
    queryKey: ['unidades-disponiveis-novos-vinculos'],
    queryFn: async () => {
      // Buscar todas as unidades com seus clientes
      const { data: unidadesData, error: unidadesError } = await supabase
        .from('unidades')
        .select(`
          id,
          nome,
          codigo,
          cliente_id,
          clientes(nome_fantasia)
        `)
        .order('nome');
      
      if (unidadesError) throw unidadesError;
      if (!unidadesData) return [];

      // Buscar contratos para verificar status
      const { data: contratosData } = await supabase
        .from('contratos')
        .select('unidade_id, status_contrato');

      // Filtrar unidades que têm pelo menos um contrato não-Inativo/Suspenso
      const unidadesDisponiveis: Unidade[] = [];
      
      unidadesData.forEach(unidade => {
        const contratosUnidade = contratosData?.filter(c => c.unidade_id === unidade.id) || [];
        const hasActiveContract = contratosUnidade.some(
          c => c.status_contrato && !['Inativo', 'Suspenso'].includes(c.status_contrato)
        );
        
        if (hasActiveContract) {
          unidadesDisponiveis.push({
            id: unidade.id,
            nome: unidade.nome,
            codigo: unidade.codigo,
            cliente_id: unidade.cliente_id,
            cliente_nome: unidade.clientes?.nome_fantasia || '',
          });
        }
      });
      
      // Ordenar por nome do cliente
      return unidadesDisponiveis.sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome));
    },
  });

  const handleSelect = (unidadeId: string) => {
    const newValue = value.includes(unidadeId)
      ? value.filter((id) => id !== unidadeId)
      : [...value, unidadeId];
    onChange(newValue);
  };

  const handleRemove = (unidadeId: string) => {
    onChange(value.filter((id) => id !== unidadeId));
  };

  const getUnidadeLabel = (unidade: Unidade) => {
    const codigoStr = unidade.codigo ? `${unidade.codigo} - ` : '';
    return `${unidade.cliente_nome} - ${codigoStr}${unidade.nome}`;
  };

  const selectedUnidades = unidades?.filter((u) => value.includes(u.id)) || [];

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || isLoading}
          >
            <span className="truncate">
              {isLoading
                ? "Carregando..."
                : value.length === 0
                ? "Selecione as unidades"
                : `${value.length} unidade(s) selecionada(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar unidade..." />
            <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {unidades?.map((unidade) => (
                <CommandItem
                  key={unidade.id}
                  onSelect={() => handleSelect(unidade.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(unidade.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {getUnidadeLabel(unidade)}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedUnidades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUnidades.map((unidade) => (
            <Badge
              key={unidade.id}
              variant="secondary"
              className="gap-1"
            >
              {getUnidadeLabel(unidade)}
              <button
                type="button"
                className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRemove(unidade.id);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleRemove(unidade.id)}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
