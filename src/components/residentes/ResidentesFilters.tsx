import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { X, ChevronsUpDown, Check, SlidersHorizontal } from "lucide-react";
import { UF_LIST, ESPECIALIDADES_RESIDENCIA } from "./constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResidentesFiltersProps {
  periodoTipo: string;
  periodoValor: string;
  uf: string;
  especialidade: string;
  loading?: boolean;
  onPeriodoTipoChange: (v: string) => void;
  onPeriodoValorChange: (v: string) => void;
  onUfChange: (v: string) => void;
  onEspecialidadeChange: (v: string) => void;
  onClearFilters: () => void;
  onSearch?: () => void;
}

export function ResidentesFilters({
  periodoTipo, periodoValor, uf, especialidade, loading,
  onPeriodoTipoChange, onPeriodoValorChange, onUfChange, onEspecialidadeChange, onClearFilters, onSearch
}: ResidentesFiltersProps) {
  const [espOpen, setEspOpen] = useState(false);
  const hasFilters = uf !== "todos" || especialidade !== "todas" || periodoValor !== "1";

  const activeCount = [
    uf !== "todos",
    especialidade !== "todas",
    periodoValor !== "1"
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="text-xs font-medium uppercase tracking-wider">Filtros</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </div>

      <div className="h-4 w-px bg-border/60" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Últimos</span>
        <Select value={periodoValor} onValueChange={onPeriodoValorChange}>
          <SelectTrigger className="w-[70px] h-7 text-xs rounded-lg border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
              <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">meses</span>
      </div>

      <div className="h-4 w-px bg-border/60" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">UF</span>
        <Select value={uf} onValueChange={onUfChange}>
          <SelectTrigger className="w-[90px] h-7 text-xs rounded-lg border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {UF_LIST.map(u => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-4 w-px bg-border/60" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Especialidade</span>
        <Popover open={espOpen} onOpenChange={setEspOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={espOpen}
              className="w-[240px] h-7 justify-between text-xs font-normal rounded-lg border-border/50"
            >
              <span className="truncate">
                {especialidade === "todas" ? "Todas" : especialidade}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-40" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Pesquisar especialidade..." className="h-9" />
              <CommandList>
                <CommandEmpty>Nenhuma especialidade encontrada.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="todas"
                    onSelect={() => { onEspecialidadeChange("todas"); setEspOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", especialidade === "todas" ? "opacity-100" : "opacity-0")} />
                    Todas
                  </CommandItem>
                  {ESPECIALIDADES_RESIDENCIA.map(e => (
                    <CommandItem
                      key={e}
                      value={e}
                      onSelect={() => { onEspecialidadeChange(e); setEspOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", especialidade === e ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{e}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="h-4 w-px bg-border/60" />

      <Button
        size="sm"
        onClick={onSearch}
        disabled={loading}
        className="h-7 gap-1.5 text-xs rounded-lg px-3"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        Buscar
      </Button>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive rounded-lg px-2"
        >
          <X className="h-3 w-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}
