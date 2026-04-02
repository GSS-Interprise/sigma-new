import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicoOption {
  id: string;
  nome_completo: string;
  cpf: string | null;
  crm: string | null;
  phone_e164: string | null;
  telefone: string | null;
}

interface MedicoSearchSelectProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MedicoSearchSelect({
  selectedIds,
  onSelectionChange,
  placeholder = "Buscar médico por nome, CPF, CRM ou telefone...",
  className,
}: MedicoSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Debounce search query
  const debounceTimeout = useMemo(() => {
    return setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
  }, [searchQuery]);

  // Clear timeout on unmount
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceTimeout);
    setTimeout(() => {
      setDebouncedQuery(value);
    }, 400);
  }, [debounceTimeout]);

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['medico-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      const searchTerm = `%${debouncedQuery}%`;
      
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo, cpf, crm, phone_e164, telefone')
        .is('lead_id', null) // Apenas médicos sem lead_id
        .or(`nome_completo.ilike.${searchTerm},cpf.ilike.${searchTerm},crm.ilike.${searchTerm},phone_e164.ilike.${searchTerm},telefone.ilike.${searchTerm}`)
        .limit(20);

      if (error) throw error;
      return data as MedicoOption[];
    },
    enabled: debouncedQuery.length >= 2,
  });

  // Query to get selected medicos details
  const { data: selectedMedicos } = useQuery({
    queryKey: ['medico-selected', selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];

      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo, cpf, crm, phone_e164, telefone')
        .in('id', selectedIds);

      if (error) throw error;
      return data as MedicoOption[];
    },
    enabled: selectedIds.length > 0,
  });

  const handleSelect = (medico: MedicoOption) => {
    if (!selectedIds.includes(medico.id)) {
      onSelectionChange([...selectedIds, medico.id]);
    }
    setSearchQuery("");
    setDebouncedQuery("");
  };

  const handleRemove = (id: string) => {
    onSelectionChange(selectedIds.filter(sid => sid !== id));
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  const formatCpf = (cpf: string | null) => {
    if (!cpf) return null;
    // Show last 4 digits
    return `***${cpf.slice(-4)}`;
  };

  const formatOption = (medico: MedicoOption) => {
    const parts = [medico.nome_completo];
    if (medico.crm) parts.push(`CRM: ${medico.crm}`);
    if (medico.cpf) parts.push(`CPF: ${formatCpf(medico.cpf)}`);
    return parts.join(' — ');
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10"
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        />
        
        {/* Search Results Dropdown */}
        {isOpen && debouncedQuery.length >= 2 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-hidden">
            <ScrollArea className="max-h-60">
              {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  Buscando...
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="p-1">
                  {searchResults.map((medico) => {
                    const isSelected = selectedIds.includes(medico.id);
                    return (
                      <button
                        key={medico.id}
                        onClick={() => handleSelect(medico)}
                        disabled={isSelected}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors",
                          isSelected && "opacity-50 cursor-not-allowed bg-muted"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{formatOption(medico)}</span>
                          {isSelected && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                              Selecionado
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground ml-6 truncate">
                          ID: {medico.id.slice(0, 8)}...
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  Nenhum resultado encontrado
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Selected Medicos */}
      {selectedIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedIds.length} médico{selectedIds.length > 1 ? 's' : ''} selecionado{selectedIds.length > 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              Limpar todos
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedMedicos?.map((medico) => (
              <Badge
                key={medico.id}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                <span className="max-w-[200px] truncate">
                  {medico.nome_completo}
                </span>
                {medico.crm && (
                  <span className="text-xs text-muted-foreground">
                    ({medico.crm})
                  </span>
                )}
                <button
                  onClick={() => handleRemove(medico.id)}
                  className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
