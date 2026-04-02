import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Cake,
  Activity
} from "lucide-react";
import { format, isWithinInterval, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export function HomeTab() {
  const { data: relacionamentos } = useQuery({
    queryKey: ['relacionamentos-home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('relacionamento_medico')
        .select(`
          *,
          cliente_vinculado:clientes(nome_fantasia),
          medico_vinculado:medicos(nome_completo)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-aniversarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo, data_nascimento')
        .not('data_nascimento', 'is', null)
        .order('data_nascimento', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Filtrar aniversariantes dos próximos 30 dias
  const proximosAniversarios = medicos?.filter((medico) => {
    if (!medico.data_nascimento) return false;
    const hoje = new Date();
    const dataAniversario = new Date(medico.data_nascimento);
    const aniversarioEsteAno = new Date(
      hoje.getFullYear(),
      dataAniversario.getMonth(),
      dataAniversario.getDate()
    );
    
    return isWithinInterval(aniversarioEsteAno, {
      start: hoje,
      end: addDays(hoje, 30)
    });
  }).slice(0, 5);

  const reclamacoesAbertas = relacionamentos?.filter(
    (r) => r.tipo_principal === 'Reclamação' && r.status === 'aberta'
  ) || [];

  const reclamacoesEmAndamento = relacionamentos?.filter(
    (r) => r.tipo_principal === 'Reclamação' && r.status === 'em_analise'
  ) || [];

  const acoesAbertas = relacionamentos?.filter(
    (r) => r.tipo_principal === 'Ação' && r.status === 'aberta'
  ) || [];

  const acoesEmAndamento = relacionamentos?.filter(
    (r) => r.tipo_principal === 'Ação' && r.status === 'em_analise'
  ) || [];

  const getGravidadeBadge = (gravidade: string | null) => {
    if (!gravidade) return null;
    const colors = {
      baixa: 'bg-blue-500/10 text-blue-500',
      media: 'bg-yellow-500/10 text-yellow-500',
      alta: 'bg-orange-500/10 text-orange-500',
      critica: 'bg-red-500/10 text-red-500',
    };
    return (
      <Badge className={colors[gravidade as keyof typeof colors] || ''}>
        {gravidade}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cards de métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reclamações Abertas</p>
              <h3 className="text-2xl font-bold">{reclamacoesAbertas.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reclamações em Andamento</p>
              <h3 className="text-2xl font-bold">{reclamacoesEmAndamento.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ações Abertas</p>
              <h3 className="text-2xl font-bold">{acoesAbertas.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ações em Andamento</p>
              <h3 className="text-2xl font-bold">{acoesEmAndamento.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Cake className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aniversários (30 dias)</p>
              <h3 className="text-2xl font-bold">{proximosAniversarios?.length || 0}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Listas detalhadas */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Reclamações Críticas */}
        {reclamacoesAbertas.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Reclamações Abertas
            </h3>
            <div className="space-y-3">
              {reclamacoesAbertas.slice(0, 5).map((rec) => (
                <div key={rec.id} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{rec.tipo}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {rec.medico_vinculado?.nome_completo || rec.cliente_vinculado?.nome_fantasia || 'Sem vínculo'}
                    </p>
                  </div>
                  {rec.gravidade && getGravidadeBadge(rec.gravidade)}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Próximos Aniversários */}
        {proximosAniversarios && proximosAniversarios.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Cake className="h-5 w-5 text-purple-500" />
              Próximos Aniversários
            </h3>
            <div className="space-y-3">
              {proximosAniversarios.map((medico) => {
                const dataAniversario = new Date(medico.data_nascimento!);
                const aniversarioEsteAno = new Date(
                  new Date().getFullYear(),
                  dataAniversario.getMonth(),
                  dataAniversario.getDate()
                );
                return (
                  <div key={medico.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{medico.nome_completo}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(aniversarioEsteAno, "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
