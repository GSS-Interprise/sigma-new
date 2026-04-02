import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, DollarSign, CheckCircle, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

export function HomeTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["patrimonio-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patrimonio")
        .select("*");

      if (error) throw error;

      const totalItens = data.length;
      const valorTotal = data.reduce((sum, item) => sum + Number(item.valor_aquisicao || 0), 0);
      const ativos = data.filter(item => item.status === 'ativo').length;
      const inativos = data.filter(item => item.status !== 'ativo').length;

      // Distribuição por categoria
      const categoriaCount: Record<string, number> = {};
      data.forEach(item => {
        categoriaCount[item.categoria] = (categoriaCount[item.categoria] || 0) + 1;
      });

      const distribuicaoCategoria = Object.entries(categoriaCount).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));

      // Últimos 5 bens adicionados
      const ultimosBens = data
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      return {
        totalItens,
        valorTotal,
        ativos,
        inativos,
        distribuicaoCategoria,
        ultimosBens
      };
    }
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[120px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Itens</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalItens || 0}</div>
            <p className="text-xs text-muted-foreground">
              Bens cadastrados no sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              }).format(stats?.valorTotal || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Valor estimado do patrimônio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bens Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.ativos || 0}</div>
            <p className="text-xs text-muted-foreground">
              Em uso ou disponíveis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bens Inativos</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inativos || 0}</div>
            <p className="text-xs text-muted-foreground">
              Transferidos ou baixados
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Gráfico de distribuição por categoria */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.distribuicaoCategoria && stats.distribuicaoCategoria.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.distribuicaoCategoria}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.distribuicaoCategoria.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Nenhum bem cadastrado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos bens adicionados */}
        <Card>
          <CardHeader>
            <CardTitle>Últimos Bens Adicionados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.ultimosBens && stats.ultimosBens.length > 0 ? (
                stats.ultimosBens.map((bem) => (
                  <div key={bem.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="flex-1">
                      <p className="font-medium">{bem.nome}</p>
                      <p className="text-sm text-muted-foreground">{bem.codigo_bem}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(Number(bem.valor_aquisicao))}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">{bem.categoria}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Nenhum bem cadastrado ainda
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
