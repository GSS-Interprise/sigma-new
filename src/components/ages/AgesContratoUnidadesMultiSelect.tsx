import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnidadeOption {
  id: string;
  nome: string;
}

interface AgesContratoUnidadesMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  unidades: UnidadeOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AgesContratoUnidadesMultiSelect({ 
  value, 
  onChange, 
  unidades,
  disabled = false,
  placeholder = "Selecionar unidades...",
  className
}: AgesContratoUnidadesMultiSelectProps) {
  const [open, setOpen] = useState(false);

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
            disabled={disabled}
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
              <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
              <CommandGroup>
                {unidades.map((unidade) => (
                  <CommandItem
                    key={unidade.id}
                    value={unidade.nome}
                    onSelect={() => handleSelect(unidade.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(unidade.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>{unidade.nome}</span>
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
              onClick={() => !disabled && handleSelect(unidade.id)}
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
