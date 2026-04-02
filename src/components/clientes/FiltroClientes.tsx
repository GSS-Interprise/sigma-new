import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface FiltroClientesProps {
  searchNome: string;
  selectedStatus: string[];
  selectedUf: string[];
  onSearchChange: (value: string) => void;
  onStatusToggle: (status: string) => void;
  onUfToggle: (uf: string) => void;
  onClearFilters: () => void;
}

const STATUS = [
  { value: 'Ativo', label: 'Ativo' },
  { value: 'Inativo', label: 'Inativo' },
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

export function FiltroClientes({
  searchNome,
  selectedStatus,
  selectedUf,
  onSearchChange,
  onStatusToggle,
  onUfToggle,
  onClearFilters,
}: FiltroClientesProps) {
  const hasActiveFilters = searchNome.length > 0 || selectedStatus.length > 0 || selectedUf.length > 0;

  return (
    <div className="space-y-4 mb-6 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filtros</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-2 block">Nome Fantasia</label>
          <Input
            placeholder="Buscar por nome fantasia..."
            value={searchNome}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS.map((status) => (
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
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Estado (UF)</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {UFS.map((uf) => (
              <Badge
                key={uf}
                variant={selectedUf.includes(uf) ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onUfToggle(uf)}
              >
                {uf}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
