import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { formatarEspecialidade } from "@/lib/especialidades";

export type PendenciaEspecialidade = "sem_especialidade" | "falta_rqe";

interface FiltroMedicosProps {
  searchNome: string;
  selectedClientes: string[];
  selectedEspecialidades: string[];
  clientes: Array<{ id: string; nome_fantasia: string }>;
  especialidades: string[];
  onSearchChange: (value: string) => void;
  onClienteToggle: (clienteId: string) => void;
  onEspecialidadeToggle: (especialidade: string) => void;
  onClearFilters: () => void;
  pendencia?: PendenciaEspecialidade | null;
  contagemPendencias?: Record<PendenciaEspecialidade, number>;
  onPendenciaToggle?: (p: PendenciaEspecialidade) => void;
}

const PENDENCIAS: Array<{ id: PendenciaEspecialidade; rotulo: string }> = [
  { id: "falta_rqe", rotulo: "Falta RQE" },
  { id: "sem_especialidade", rotulo: "Sem especialidade" },
];

export function FiltroMedicos({
  searchNome,
  selectedClientes,
  selectedEspecialidades,
  clientes,
  especialidades,
  onSearchChange,
  onClienteToggle,
  onEspecialidadeToggle,
  onClearFilters,
  pendencia = null,
  contagemPendencias,
  onPendenciaToggle,
}: FiltroMedicosProps) {
  const [clientesOpen, setClientesOpen] = useState(false);
  const [especialidadesOpen, setEspecialidadesOpen] = useState(false);
  const hasActiveFilters = searchNome.length > 0 || selectedClientes.length > 0 || selectedEspecialidades.length > 0 || pendencia !== null;

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
          <label className="text-sm font-medium mb-2 block">Nome</label>
          <Input
            placeholder="Buscar por nome..."
            value={searchNome}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <Collapsible open={especialidadesOpen} onOpenChange={setEspecialidadesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium mb-2">
            Especialidade
            <ChevronDown className={`h-4 w-4 transition-transform ${especialidadesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {onPendenciaToggle && contagemPendencias && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs text-muted-foreground">Para completar:</span>
                {PENDENCIAS.map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className={`cursor-pointer border-dashed border-amber-400 text-amber-800 hover:opacity-80 dark:text-amber-300 ${
                      pendencia === p.id ? "bg-amber-100 dark:bg-amber-950/40 border-solid" : ""
                    }`}
                    onClick={() => onPendenciaToggle(p.id)}
                  >
                    {p.rotulo} ({contagemPendencias[p.id]})
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2 max-h-48 overflow-y-auto">
              {especialidades.map((especialidade) => (
                <Badge
                  key={especialidade}
                  variant={selectedEspecialidades.includes(especialidade) ? "default" : "outline"}
                  className="cursor-pointer hover:opacity-80"
                  onClick={() => onEspecialidadeToggle(especialidade)}
                >
                  {formatarEspecialidade(especialidade)}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={clientesOpen} onOpenChange={setClientesOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium mb-2">
            Cliente Vinculado
            <ChevronDown className={`h-4 w-4 transition-transform ${clientesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 pt-2">
              {clientes.map((cliente) => (
                <Badge
                  key={cliente.id}
                  variant={selectedClientes.includes(cliente.id) ? "default" : "outline"}
                  className="cursor-pointer hover:opacity-80"
                  onClick={() => onClienteToggle(cliente.id)}
                >
                  {cliente.nome_fantasia}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
