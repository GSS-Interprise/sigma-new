import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, User } from "lucide-react";
import { EscalaIntegrada } from "@/hooks/useEscalasData";

interface EscalasCalendarioViewProps {
  escalas: EscalaIntegrada[];
  mes: number;
  ano: number;
}

export function EscalasCalendarioView({ escalas, mes, ano }: EscalasCalendarioViewProps) {
  const diasDoMes = useMemo(() => {
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);
    const dias: Date[] = [];
    
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      dias.push(new Date(ano, mes - 1, d));
    }
    
    return dias;
  }, [mes, ano]);

  const escalasPorDia = useMemo(() => {
    const mapa = new Map<string, EscalaIntegrada[]>();
    
    for (const escala of escalas) {
      const dataKey = escala.data_escala;
      if (!mapa.has(dataKey)) {
        mapa.set(dataKey, []);
      }
      mapa.get(dataKey)?.push(escala);
    }
    
    return mapa;
  }, [escalas]);

  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();

  const formatarHora = (hora: string) => {
    return hora?.substring(0, 5) || "--:--";
  };

  return (
    <div className="space-y-4">
      {/* Header do Calendário */}
      <div className="grid grid-cols-7 gap-2 text-center">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => (
          <div key={dia} className="font-semibold text-sm text-muted-foreground py-2">
            {dia}
          </div>
        ))}
      </div>

      {/* Grid do Calendário */}
      <div className="grid grid-cols-7 gap-2">
        {/* Espaços vazios antes do primeiro dia */}
        {Array.from({ length: primeiroDiaSemana }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[120px]" />
        ))}

        {/* Dias do mês */}
        {diasDoMes.map((dia) => {
          const dataKey = dia.toISOString().split("T")[0];
          const escalasDoDia = escalasPorDia.get(dataKey) || [];
          const temIncompletos = escalasDoDia.some(e => e.dados_incompletos);
          const isHoje = new Date().toDateString() === dia.toDateString();

          return (
            <Card 
              key={dataKey} 
              className={`min-h-[120px] ${isHoje ? "ring-2 ring-primary" : ""} ${temIncompletos ? "border-destructive/50" : ""}`}
            >
              <CardHeader className="p-2 pb-1">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${isHoje ? "text-primary" : ""}`}>
                    {dia.getDate()}
                  </span>
                  {escalasDoDia.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {escalasDoDia.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-2 pt-0 space-y-1 max-h-[200px] overflow-y-auto">
                {escalasDoDia.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem plantões</p>
                ) : (
                  escalasDoDia.slice(0, 5).map((escala) => (
                    <div 
                      key={escala.id} 
                      className={`text-xs p-1.5 rounded border ${escala.dados_incompletos ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"}`}
                    >
                      <div className="flex items-center gap-1">
                        {escala.dados_incompletos && (
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                        )}
                        <span className="font-medium truncate">{escala.profissional_nome}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatarHora(escala.hora_inicio)} - {formatarHora(escala.hora_fim)}</span>
                      </div>
                      <div className="text-muted-foreground truncate" title={escala.local_nome || escala.unidade || "Local não informado"}>
                        {escala.local_nome || escala.unidade || "Local não informado"}
                      </div>
                      <div className="text-muted-foreground truncate text-[10px]">
                        {escala.setor_nome || escala.setor}
                      </div>
                    </div>
                  ))
                )}
                {escalasDoDia.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{escalasDoDia.length - 5} mais
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
