import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarOff } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

export function MedicosAusentesCard() {
  const { data: ausencias } = useQuery({
    queryKey: ['medicos-ausentes'],
    queryFn: async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('medico_ausencias')
        .select(`
          *,
          medico:medicos!medico_ausencias_medico_id_fkey(nome_completo)
        `)
        .gte('data_fim', hoje)
        .order('data_inicio')
        .limit(5);
      
      if (error) throw error;
      return data;
    },
  });

  const getContador = (dataInicio: string, dataFim: string) => {
    const hoje = new Date();
    const inicio = parseISO(dataInicio);
    const fim = parseISO(dataFim);

    if (hoje < inicio) {
      const dias = differenceInDays(inicio, hoje);
      return {
        tipo: 'inicio',
        dias,
        label: `Começa em ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
      };
    } else {
      const dias = differenceInDays(fim, hoje);
      return {
        tipo: 'fim',
        dias,
        label: `${dias === 0 ? 'Termina hoje' : `Termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}`,
      };
    }
  };

  if (!ausencias || ausencias.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          Médicos Ausentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ausencias.map((ausencia) => {
            const contador = getContador(ausencia.data_inicio, ausencia.data_fim);
            return (
              <div
                key={ausencia.id}
                className="flex items-start justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1">
                  <p className="font-medium">{ausencia.medico?.nome_completo}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(ausencia.data_inicio), 'dd/MM/yyyy', { locale: ptBR })} até{' '}
                    {format(parseISO(ausencia.data_fim), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <Badge variant={contador.tipo === 'inicio' ? 'outline' : 'secondary'}>
                  {contador.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}