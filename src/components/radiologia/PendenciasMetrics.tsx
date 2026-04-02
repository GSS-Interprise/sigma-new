import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckSquare, Clock, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendenciasMetricsProps {
  totalPendenciasAbertas: number;
  totalResolvidas: number;
  pendenciasVencidas: number;
  tempoMedioResolucao: string;
  medicoMaisPendencias: { nome: string; quantidade: number } | null;
  activeFilter?: string | null;
  onFilterClick?: (filter: string) => void;
}

export function PendenciasMetrics({
  totalPendenciasAbertas,
  totalResolvidas,
  pendenciasVencidas,
  tempoMedioResolucao,
  medicoMaisPendencias,
  activeFilter,
  onFilterClick,
}: PendenciasMetricsProps) {
  const metrics = [
    {
      id: "abertas",
      label: "Total Pendências Abertas",
      value: totalPendenciasAbertas,
      icon: AlertCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      clickable: true,
    },
    {
      id: "resolvidas",
      label: "Total Resolvidas",
      value: totalResolvidas,
      icon: CheckSquare,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      clickable: false, // Não temos resolvidas na lista
    },
    {
      id: "sla_vencido",
      label: "SLA Vencido",
      value: pendenciasVencidas,
      icon: Clock,
      color: "text-red-600",
      bgColor: "bg-red-50",
      clickable: true,
    },
    {
      id: "tempo_medio",
      label: "Tempo Médio Resolução",
      value: tempoMedioResolucao,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      clickable: false,
    },
    {
      id: "medico_pendencias",
      label: "Médico + Pendências",
      value: medicoMaisPendencias
        ? `${medicoMaisPendencias.nome.split(" ")[0]} (${medicoMaisPendencias.quantidade})`
        : "N/A",
      icon: User,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      clickable: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const isActive = activeFilter === metric.id;
        const isClickable = metric.clickable && onFilterClick;
        
        return (
          <Card 
            key={metric.id} 
            className={cn(
              "transition-all",
              isClickable && "cursor-pointer hover:shadow-md hover:scale-[1.02]",
              isActive && "ring-2 ring-primary shadow-lg"
            )}
            onClick={() => isClickable && onFilterClick(metric.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                </div>
                <div className={`p-3 rounded-full ${metric.bgColor}`}>
                  <Icon className={`h-6 w-6 ${metric.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
