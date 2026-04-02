import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface FiltroContratosProps {
  searchTerm: string;
  selectedStatus: string[];
  onSearchChange: (value: string) => void;
  onStatusToggle: (status: string) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: 'Pre-Contrato', label: 'Pré-Contrato' },
  { value: 'Assinado', label: 'Assinado' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Aguardando', label: 'Aguardando' },
];

export function FiltroContratos({
  searchTerm,
  selectedStatus,
  onSearchChange,
  onStatusToggle,
  onClearFilters,
}: FiltroContratosProps) {
  const hasActiveFilters = searchTerm !== "" || selectedStatus.length > 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, cliente ou médico..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      
      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((status) => (
          <Badge
            key={status.value}
            variant={selectedStatus.includes(status.value) ? "default" : "outline"}
            className="cursor-pointer hover:opacity-80"
            onClick={() => onStatusToggle(status.value)}
          >
            {status.label}
          </Badge>
        ))}
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
