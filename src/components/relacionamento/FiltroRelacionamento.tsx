import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface FiltroRelacionamentoProps {
  selectedTipos: string[];
  selectedStatus: string[];
  onTipoToggle: (tipo: string) => void;
  onStatusToggle: (status: string) => void;
  onClearFilters: () => void;
}

const TIPOS = ['Reclamação', 'Ação'];
const STATUS = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'em_analise', label: 'Em Análise' },
  { value: 'concluida', label: 'Concluída' },
];

export function FiltroRelacionamento({
  selectedTipos,
  selectedStatus,
  onTipoToggle,
  onStatusToggle,
  onClearFilters,
}: FiltroRelacionamentoProps) {
  const hasActiveFilters = selectedTipos.length > 0 || selectedStatus.length > 0;

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
          <label className="text-sm font-medium mb-2 block">Tipo</label>
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((tipo) => (
              <Badge
                key={tipo}
                variant={selectedTipos.includes(tipo) ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onTipoToggle(tipo)}
              >
                {tipo}
              </Badge>
            ))}
          </div>
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
      </div>
    </div>
  );
}
