import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgesUnidadeMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

interface UnidadeOption {
  id: string;
  nome: string;
  codigo: string | null;
  cidade: string | null;
  uf: string | null;
  cliente: {
    id: string;
    nome_empresa: string;
  } | null;
}

export function AgesUnidadeMultiSelect({ 
  value, 
  onChange, 
  placeholder = "Selecionar unidades...",
  className
}: AgesUnidadeMultiSelectProps) {
  const [open, setOpen] = useState(false);

  // Busca unidades da tabela AGES com contratos disponíveis (não Inativo/Suspenso)
  const { data: unidades = [], isLoading } = useQuery({
    queryKey: ['ages-unidades-disponiveis-multiselect'],
    queryFn: async () => {
      // Primeiro buscar todas as unidades AGES
      const { data: unidadesData, error: unidadesError } = await supabase
        .from('ages_unidades')
        .select(`
          id,
          nome,
          codigo,
          cidade,
          uf,
          cliente:ages_clientes!ages_unidades_cliente_id_fkey(id, nome_empresa)
        `)
        .order('nome');
      
      if (unidadesError) throw unidadesError;
      if (!unidadesData) return [];

      // Buscar contratos AGES para verificar status (usa novo campo ages_unidades_ids e retrocompatibilidade com ages_unidade_id)
      const { data: contratosData } = await supabase
        .from('ages_contratos')
        .select('ages_unidade_id, ages_unidades_ids, status');

      // Filtrar unidades que tenham pelo menos um contrato que NÃO seja Inativo/Suspenso
      const unidadesDisponiveis = unidadesData.filter(unidade => {
        // Verificar em ages_unidades_ids (array) ou ages_unidade_id (retrocompatibilidade)
        const contratosUnidade = contratosData?.filter(c => {
          const unidadesDoContrato = c.ages_unidades_ids || (c.ages_unidade_id ? [c.ages_unidade_id] : []);
          return unidadesDoContrato.includes(unidade.id);
        }) || [];
        
        // Se não tem contratos, deixar disponível (pode ser nova unidade)
        if (contratosUnidade.length === 0) return true;
        
        // Verificar se tem algum contrato que NÃO seja Inativo/Suspenso
        return contratosUnidade.some(
          c => c.status && !['Inativo', 'Suspenso'].includes(c.status)
        );
      });

      return unidadesDisponiveis as UnidadeOption[];
    },
  });

  const handleSelect = (unidadeId: string) => {
    const newValue = value.includes(unidadeId)
      ? value.filter(id => id !== unidadeId)
      : [...value, unidadeId];
    onChange(newValue);
  };

  const selectedUnidades = unidades.filter(u => value.includes(u.id));

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-10"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              {selectedUnidades.length > 0 ? (
                <span className="text-sm">
                  {selectedUnidades.length} unidade(s) selecionada(s)
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar unidade..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? 'Carregando...' : 'Nenhuma unidade encontrada.'}
              </CommandEmpty>
              <CommandGroup>
                {unidades.map((unidade) => (
                  <CommandItem
                    key={unidade.id}
                    value={`${unidade.nome} ${unidade.cliente?.nome_empresa}`}
                    onSelect={() => handleSelect(unidade.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(unidade.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {unidade.codigo ? `${unidade.codigo} - ` : ''}{unidade.nome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {unidade.cliente?.nome_empresa}
                        {unidade.uf && ` • ${unidade.uf}`}
                        {unidade.cidade && ` - ${unidade.cidade}`}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected badges */}
      {selectedUnidades.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUnidades.map((unidade) => (
            <Badge
              key={unidade.id}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleSelect(unidade.id)}
            >
              {unidade.nome}
              <span className="ml-1">×</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
