import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Calendar, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function RelacionamentoArea() {
  const { data: ultimosDisparos } = useQuery({
    queryKey: ['ultimos-disparos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('disparos_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      return data;
    },
  });

  const { data: proximasAcoes } = useQuery({
    queryKey: ['proximas-acoes-relacionamento'],
    queryFn: async () => {
      const { data } = await supabase
        .from('relacionamento_medico')
        .select('*, medicos(nome_completo)')
        .eq('status', 'aberta')
        .order('created_at', { ascending: false })
        .limit(3);
      return data;
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Últimos Disparos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ultimosDisparos?.map((disparo) => (
              <div key={disparo.id} className="flex items-start justify-between pb-3 border-b last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium">{disparo.especialidade}</p>
                  <p className="text-xs text-muted-foreground">
                    {disparo.total_destinatarios} destinatários
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(disparo.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Badge variant={disparo.enviados > 0 ? "default" : "secondary"}>
                  {disparo.enviados} enviados
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Próximas Ações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {proximasAcoes?.map((acao) => (
              <div key={acao.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                <AlertCircle className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{acao.tipo}</p>
                  <p className="text-xs text-muted-foreground truncate">{acao.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
