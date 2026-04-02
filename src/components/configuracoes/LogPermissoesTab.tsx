import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRoleLabel } from "@/lib/roleLabels";

export function LogPermissoesTab() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['permissoes-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('permissoes_log')
        .select(`
          *,
          profiles:user_id (
            nome_completo,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  if (isLoading) {
    return <div>Carregando histórico...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Histórico de Alterações de Permissões</h2>
        <p className="text-muted-foreground">
          Últimas 100 alterações realizadas no sistema de permissões
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Campo</TableHead>
              <TableHead>Valor Anterior</TableHead>
              <TableHead>Valor Novo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhuma alteração registrada
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{log.profiles?.nome_completo}</span>
                      <span className="text-xs text-muted-foreground">{log.profiles?.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.modulo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.acao}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getRoleLabel(log.perfil)}</Badge>
                  </TableCell>
                  <TableCell>{log.campo_modificado}</TableCell>
                  <TableCell>
                    {log.valor_anterior ? (
                      <Badge variant={log.valor_anterior === 'true' ? 'default' : 'destructive'}>
                        {log.valor_anterior === 'true' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.valor_novo === 'true' ? 'default' : 'destructive'}>
                      {log.valor_novo === 'true' ? 'Ativo' : 'Inativo'}
                    </Badge>
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
