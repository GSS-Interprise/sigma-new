import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";

export function HistoricoTab() {
  const { data: historico, isLoading } = useQuery({
    queryKey: ['historico-acessos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('historico_acessos')
        .select(`
          *,
          profile:profiles(nome_completo, email)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const handleExport = () => {
    // Implementar exportação
    alert('Exportação será implementada');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Histórico de Acessos</h2>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">Carregando...</TableCell>
              </TableRow>
            ) : historico && historico.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum registro de acesso encontrado
                </TableCell>
              </TableRow>
            ) : (
              historico?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.profile?.nome_completo || 'Usuário desconhecido'}</TableCell>
                  <TableCell>{item.acao}</TableCell>
                  <TableCell>
                    {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {item.detalhes ? JSON.stringify(item.detalhes) : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
