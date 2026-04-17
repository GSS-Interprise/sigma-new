import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export interface SearchableMultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: SearchableMultiSelectOption[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  maxBadges?: number;
}

export function SearchableMultiSelect({
  options,
  values,
  onChange,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nada encontrado.",
  className,
  maxBadges = 2,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(values);
  const selectedOpts = options.filter((o) => selectedSet.has(o.value));

  const toggle = (val: string) => {
    if (selectedSet.has(val)) onChange(values.filter((v) => v !== val));
    else onChange([...values, val]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal min-h-10 h-auto py-1.5",
            selectedOpts.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
            {selectedOpts.length === 0 ? (
              <span>{placeholder}</span>
            ) : selectedOpts.length <= maxBadges ? (
              selectedOpts.map((o) => (
                <Badge
                  key={o.value}
                  variant="secondary"
                  className="gap-1 max-w-full"
                >
                  <span className="truncate">{o.label}</span>
                  <X
                    className="h-3 w-3 shrink-0 opacity-70 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
                  />
                </Badge>
              ))
            ) : (
              <Badge variant="secondary">{selectedOpts.length} selecionados</Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedOpts.length > 0 && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => toggle(opt.value)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
