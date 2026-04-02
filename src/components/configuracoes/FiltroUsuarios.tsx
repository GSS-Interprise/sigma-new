import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";

interface FiltroUsuariosProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedStatus: string[];
  onStatusToggle: (status: string) => void;
  onClearFilters: () => void;
}

export function FiltroUsuarios({
  searchTerm,
  setSearchTerm,
  selectedStatus,
  onStatusToggle,
  onClearFilters,
}: FiltroUsuariosProps) {
  const statusOptions = ["ativo", "inativo", "suspenso"];
  const hasFilters = searchTerm || selectedStatus.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border rounded-lg bg-card">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        {statusOptions.map((status) => (
          <Badge
            key={status}
            variant={selectedStatus.includes(status) ? "default" : "outline"}
            className="cursor-pointer capitalize select-none"
            onClick={() => onStatusToggle(status)}
          >
            {status}
          </Badge>
        ))}
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 px-2">
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
