import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, Activity, Users, TrendingUp } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function AuditoriaOverview() {
  const { user } = useAuth();
  const { isAdmin, isLeader } = usePermissions();

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-setor', user?.id],
    enabled: !!user?.id && isLeader,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('setor_id, setores(nome)')
        .eq('id', user!.id)
        .single();
      return data;
    },
  });
  const { data: stats } = useQuery({
    queryKey: ['auditoria-stats'],
    queryFn: async () => {
      const last7Days = subDays(new Date(), 7).toISOString();
      
      const [permissoes, documentos, radiologia, disparos] = await Promise.all([
        supabase.from('permissoes_log').select('*', { count: 'exact', head: true }).gte('created_at', last7Days),
        supabase.from('medico_documentos_log').select('*', { count: 'exact', head: true }).gte('created_at', last7Days),
        supabase.from('radiologia_pendencias_historico').select('*', { count: 'exact', head: true }).gte('created_at', last7Days),
        supabase.from('disparos_log').select('*', { count: 'exact', head: true }).gte('created_at', last7Days),
      ]);

      return {
        permissoes: permissoes.count || 0,
        documentos: documentos.count || 0,
        radiologia: radiologia.count || 0,
        disparos: disparos.count || 0,
        total: (permissoes.count || 0) + (documentos.count || 0) + (radiologia.count || 0) + (disparos.count || 0),
      };
    },
  });

  const { data: activityData } = useQuery({
    queryKey: ['auditoria-activity-chart'],
    queryFn: async () => {
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: format(date, 'dd/MM', { locale: ptBR }),
          fullDate: format(date, 'yyyy-MM-dd'),
        };
      });

      const results = await Promise.all(
        last7Days.map(async ({ date, fullDate }) => {
          const nextDay = format(new Date(fullDate + 'T00:00:00'), 'yyyy-MM-dd');
          
          const [permissoes, documentos, radiologia] = await Promise.all([
            supabase.from('permissoes_log').select('*', { count: 'exact', head: true })
              .gte('created_at', fullDate).lt('created_at', nextDay),
            supabase.from('medico_documentos_log').select('*', { count: 'exact', head: true })
              .gte('created_at', fullDate).lt('created_at', nextDay),
            supabase.from('radiologia_pendencias_historico').select('*', { count: 'exact', head: true })
              .gte('created_at', fullDate).lt('created_at', nextDay),
          ]);

          return {
            date,
            Permissões: permissoes.count || 0,
            Documentos: documentos.count || 0,
            Radiologia: radiologia.count || 0,
          };
        })
      );

      return results;
    },
  });

  const { data: topUsers } = useQuery({
    queryKey: ['auditoria-top-users'],
    queryFn: async () => {
      const last7Days = subDays(new Date(), 7).toISOString();
      
      const { data: logs } = await supabase
        .from('medico_documentos_log')
        .select('usuario_nome, usuario_id')
        .gte('created_at', last7Days);

      const userCounts = (logs || []).reduce((acc: Record<string, { name: string; count: number }>, log) => {
        const key = log.usuario_nome;
        if (!acc[key]) {
          acc[key] = { name: log.usuario_nome, count: 0 };
        }
        acc[key].count++;
        return acc;
      }, {});

      return Object.values(userCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  return (
    <div className="space-y-6">
      {isLeader && userProfile?.setores && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Visualizando dados do setor: <strong>{userProfile.setores.nome}</strong>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Ações</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permissões</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.permissoes || 0}</div>
            <p className="text-xs text-muted-foreground">Alterações</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.documentos || 0}</div>
            <p className="text-xs text-muted-foreground">Uploads/Ações</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Radiologia</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.radiologia || 0}</div>
            <p className="text-xs text-muted-foreground">Pendências</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disparos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.disparos || 0}</div>
            <p className="text-xs text-muted-foreground">Enviados</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Atividades */}
      <Card>
        <CardHeader>
          <CardTitle>Atividade dos Últimos 7 Dias</CardTitle>
          <CardDescription>Distribuição de ações por tipo</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Permissões" fill="hsl(var(--primary))" />
              <Bar dataKey="Documentos" fill="hsl(var(--secondary))" />
              <Bar dataKey="Radiologia" fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Usuários Mais Ativos */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários Mais Ativos</CardTitle>
          <CardDescription>Top 5 usuários com mais ações registradas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topUsers?.map((user, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{user.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{user.count} ações</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
