import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  BuildingIcon, 
  FileCheck2, 
  FileX2, 
  Clock 
} from "lucide-react";
import { addDays, isAfter, isBefore, parseISO } from "date-fns";

interface ClientesMetricsProps {
  clientes: any[];
  contratos: any[];
  onFilterClick: (filter: string) => void;
  activeFilter: string | null;
}

export function ClientesMetrics({ clientes, contratos, onFilterClick, activeFilter }: ClientesMetricsProps) {
  const metrics = useMemo(() => {
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);

    // Clientes ativos
    const ativos = clientes.filter(c => 
      c.status_cliente === 'Ativo' || c.status_cliente === null
    );
    
    // Clientes inativos
    const inativos = clientes.filter(c => 
      c.status_cliente === 'Inativo'
    );

    // IDs de clientes com contrato vigente (status_contrato = 'Ativo')
    const clientesComContratoVigente = new Set(
      contratos
        .filter(c => c.status_contrato === 'Ativo')
        .map(c => c.cliente_id)
        .filter(Boolean)
    );

    // Clientes com contrato vigente
    const comContratoVigente = clientes.filter(c => 
      clientesComContratoVigente.has(c.id)
    );

    // Clientes sem contrato
    const semContrato = clientes.filter(c => 
      !clientesComContratoVigente.has(c.id)
    );

    // IDs de clientes com contratos a vencer
    const clientesContratoAVencer = new Set(
      contratos
        .filter(c => {
          if (c.status_contrato !== 'Ativo' || !c.data_termino) return false;
          const dataFim = parseISO(c.data_termino);
          return isAfter(dataFim, hoje) && isBefore(dataFim, em30Dias);
        })
        .map(c => c.cliente_id)
        .filter(Boolean)
    );

    const comContratoAVencer = clientes.filter(c => 
      clientesContratoAVencer.has(c.id)
    );

    return [
      {
        label: "Clientes Ativos",
        value: ativos.length,
        icon: Building2,
        color: "text-green-600",
        bgColor: "bg-green-50",
        filterKey: "ativos",
      },
      {
        label: "Clientes Inativos",
        value: inativos.length,
        icon: BuildingIcon,
        color: "text-gray-600",
        bgColor: "bg-gray-100",
        filterKey: "inativos",
      },
      {
        label: "Com Contrato Vigente",
        value: comContratoVigente.length,
        icon: FileCheck2,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        filterKey: "com_contrato",
      },
      {
        label: "Sem Contrato",
        value: semContrato.length,
        icon: FileX2,
        color: "text-red-600",
        bgColor: "bg-red-50",
        filterKey: "sem_contrato",
      },
      {
        label: "Contratos a Vencer",
        value: comContratoAVencer.length,
        icon: Clock,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        filterKey: "contrato_a_vencer",
      },
    ];
  }, [clientes, contratos]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const isActive = activeFilter === metric.filterKey;
        return (
          <Card 
            key={metric.filterKey} 
            className={`hover:shadow-md transition-all cursor-pointer ${
              isActive ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => onFilterClick(isActive ? '' : metric.filterKey)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                </div>
                <div className={`p-2 rounded-full ${metric.bgColor}`}>
                  <Icon className={`h-5 w-5 ${metric.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
