import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

interface Contrato {
  id: string;
  cliente_id: string;
  nome_fantasia: string;
  unidade_nome: string;
  unidade_codigo?: string;
}

interface ClienteMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  contratos: Contrato[];
  disabled?: boolean;
}

export function ClienteMultiSelect({
  value = [],
  onChange,
  contratos = [],
  disabled = false,
}: ClienteMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (contratoId: string) => {
    if (value.includes(contratoId)) {
      onChange(value.filter((item) => item !== contratoId));
    } else {
      onChange([...value, contratoId]);
    }
  };

  const handleRemove = (contratoId: string) => {
    onChange(value.filter((item) => item !== contratoId));
  };

  const getContratoLabel = (contrato: Contrato) => {
    if (contrato.unidade_nome) {
      const unidadeLabel = contrato.unidade_codigo 
        ? `${contrato.unidade_codigo} - ${contrato.unidade_nome}`
        : contrato.unidade_nome;
      return `${contrato.nome_fantasia} - ${unidadeLabel}`;
    }
    return contrato.nome_fantasia;
  };

  const selectedContratos = contratos.filter((c) => value.includes(c.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate">
              {value.length === 0
                ? "Selecione contrato(s)..."
                : `${value.length} contrato(s) selecionado(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Buscar contrato..." />
            <CommandList>
              <CommandEmpty>Nenhum contrato encontrado.</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {contratos.map((contrato) => (
                  <CommandItem
                    key={contrato.id}
                    value={getContratoLabel(contrato)}
                    onSelect={() => handleSelect(contrato.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(contrato.id)
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {getContratoLabel(contrato)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedContratos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedContratos.map((contrato) => (
            <Badge
              key={contrato.id}
              variant="secondary"
              className="gap-1"
            >
              {getContratoLabel(contrato)}
              <button
                type="button"
                onClick={() => handleRemove(contrato.id)}
                disabled={disabled}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
