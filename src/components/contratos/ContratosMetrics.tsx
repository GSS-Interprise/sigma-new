import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  FileCheck2, 
  FileX2, 
  Clock, 
  AlertTriangle, 
  FileQuestion, 
  Paperclip 
} from "lucide-react";
import { addDays, isAfter, isBefore } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";

interface ContratosMetricsProps {
  contratos: any[];
  onFilterClick: (filter: string) => void;
  activeFilter: string | null;
}

export function ContratosMetrics({ contratos, onFilterClick, activeFilter }: ContratosMetricsProps) {
  const metrics = useMemo(() => {
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);

    // Função auxiliar para obter a data efetiva de término (considerando aditivos)
    const getDataEfetivaTermino = (contrato: any): Date | null => {
      // Se tem aditivos, usa a maior data_termino dos aditivos
      if (contrato.contrato_aditivos_tempo && contrato.contrato_aditivos_tempo.length > 0) {
        const ultimoAditivo = contrato.contrato_aditivos_tempo.reduce((max: any, aditivo: any) => {
          const dataAditivo = parseLocalDate(aditivo.data_termino);
          const dataMax = parseLocalDate(max.data_termino);
          if (!dataAditivo) return max;
          if (!dataMax) return aditivo;
          return dataAditivo > dataMax ? aditivo : max;
        });
        return parseLocalDate(ultimoAditivo.data_termino);
      }
      // Senão, usa data_termino ou data_fim do contrato
      return parseLocalDate(contrato.data_termino) || parseLocalDate(contrato.data_fim);
    };

    const ativos = contratos.filter(c => c.status_contrato === 'Ativo');
    const inativos = contratos.filter(c => c.status_contrato === 'Inativo' || c.status_contrato === 'Encerrado');
    
    // Contratos a vencer nos próximos 30 dias
    const aVencer = contratos.filter(c => {
      if (c.status_contrato !== 'Ativo') return false;
      const dataFim = getDataEfetivaTermino(c);
      if (!dataFim) return false;
      return isAfter(dataFim, hoje) && isBefore(dataFim, em30Dias);
    });

    // Contratos vencidos
    const vencidos = contratos.filter(c => {
      if (c.status_contrato !== 'Ativo') return false;
      const dataFim = getDataEfetivaTermino(c);
      if (!dataFim) return false;
      return isBefore(dataFim, hoje);
    });

    // Contratos com pendência
    const comPendencia = contratos.filter(c => 
      c.status_contrato === 'Pendente' || c.status_contrato === 'Aguardando' || c.assinado === 'Pendente'
    );

    // Contratos ativos sem anexo
    const semAnexo = ativos.filter(c => 
      !c.contrato_anexos || c.contrato_anexos.length === 0
    );

    return [
      {
        label: "Contratos Ativos",
        value: ativos.length,
        icon: FileCheck2,
        color: "text-green-600",
        bgColor: "bg-green-50",
        filterKey: "ativos",
      },
      {
        label: "Contratos Inativos",
        value: inativos.length,
        icon: FileX2,
        color: "text-gray-600",
        bgColor: "bg-gray-100",
        filterKey: "inativos",
      },
      {
        label: "A Vencer (30 dias)",
        value: aVencer.length,
        icon: Clock,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        filterKey: "a_vencer",
      },
      {
        label: "Contratos Vencidos",
        value: vencidos.length,
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        filterKey: "vencidos",
      },
      {
        label: "Com Pendência",
        value: comPendencia.length,
        icon: FileQuestion,
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        filterKey: "pendentes",
      },
      {
        label: "Sem Anexo",
        value: semAnexo.length,
        icon: Paperclip,
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        filterKey: "sem_anexo",
      },
    ];
  }, [contratos]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
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
