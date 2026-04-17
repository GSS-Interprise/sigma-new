import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface UsuarioMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function UsuarioMultiSelect({
  value,
  onChange,
  placeholder = "Marcar pessoas...",
  className,
}: UsuarioMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["profiles-multiselect"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo, email")
        .order("nome_completo", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  const selecionados = usuarios.filter((u) => value.includes(u.id));

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              {value.length > 0 ? `${value.length} pessoa(s) marcada(s)` : placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar pessoa..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Carregando..." : "Nenhuma pessoa encontrada."}
              </CommandEmpty>
              <CommandGroup>
                {usuarios.map((u) => {
                  const checked = value.includes(u.id);
                  const label = u.nome_completo || u.email || "Sem nome";
                  return (
                    <CommandItem
                      key={u.id}
                      value={`${label} ${u.email || ""}`}
                      onSelect={() => toggle(u.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          checked ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{label}</span>
                        {u.email && (
                          <span className="text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selecionados.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1">
              {u.nome_completo || u.email}
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20"
                aria-label="Remover"
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
