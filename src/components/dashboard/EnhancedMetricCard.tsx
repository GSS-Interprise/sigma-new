import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EnhancedMetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  colorClass: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  hoverData?: any[];
}

export function EnhancedMetricCard({ title, value, icon: Icon, colorClass, trend, hoverData }: EnhancedMetricCardProps) {
  const getBackgroundClass = () => {
    if (colorClass.includes('accent')) return 'bg-accent/10';
    if (colorClass.includes('warning')) return 'bg-warning/10';
    if (colorClass.includes('destructive')) return 'bg-destructive/10';
    if (colorClass.includes('info')) return 'bg-[hsl(var(--info))]/10';
    return 'bg-primary/10';
  };

  const getIconClass = () => {
    if (colorClass.includes('accent')) return 'text-accent';
    if (colorClass.includes('warning')) return 'text-warning';
    if (colorClass.includes('destructive')) return 'text-destructive';
    if (colorClass.includes('info')) return 'text-[hsl(var(--info))]';
    return 'text-primary';
  };

  const iconContent = (
    <div className={cn(
      "h-16 w-16 rounded-xl flex items-center justify-center transition-all",
      getBackgroundClass()
    )}>
      <Icon className={cn("h-8 w-8", getIconClass())} />
    </div>
  );

  return (
    <Card className={cn(
      "p-6 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-l-4 h-full",
      colorClass
    )}>
      <div className="flex items-center justify-between h-full">
        <div className="flex-1">
          <p className="text-sm font-semibold text-muted-foreground mb-3">{title}</p>
          <h3 className="text-4xl font-bold text-foreground">{value}</h3>
          {trend && (
            <p className={cn(
              "text-sm mt-2 font-semibold flex items-center gap-1",
              trend.positive ? "text-accent" : "text-destructive"
            )}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        {hoverData && hoverData.length > 0 ? (
          <HoverCard>
            <HoverCardTrigger asChild>
              {iconContent}
            </HoverCardTrigger>
            <HoverCardContent className="w-80" align="end">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm mb-3">Contratos a vencer:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {hoverData.map((contrato: any) => (
                    <div key={contrato.id} className="p-2 border rounded-md bg-muted/50">
                      <p className="font-medium text-sm">
                        {contrato.cliente?.nome_fantasia || contrato.medico?.nome_completo || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vencimento: {contrato.data_fim ? format(new Date(contrato.data_fim), "dd/MM/yyyy", { locale: ptBR }) : 'N/A'}
                      </p>
                      {contrato.codigo_interno && (
                        <p className="text-xs text-muted-foreground">
                          Código: {contrato.codigo_interno}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (
          iconContent
        )}
      </div>
    </Card>
  );
}
