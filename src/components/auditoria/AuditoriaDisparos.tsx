import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, Mail, MessageSquare } from "lucide-react";

export function AuditoriaDisparos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ['disparos-log-auditoria', searchTerm],
    queryFn: async () => {
      const { data } = await supabase
        .from('disparos_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (!searchTerm) return data || [];
      
      return (data || []).filter((log: any) => 
        log.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.especialidade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.tipo_disparo?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    },
  });

  const handleExport = () => {
    if (!logs) return;
    
    const csv = [
      ['Data/Hora', 'Usuário', 'Tipo', 'Especialidade', 'Estado', 'Total', 'Enviados', 'Falhas'],
      ...logs.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        log.usuario_nome,
        log.tipo_disparo || '-',
        log.especialidade,
        log.estado || '-',
        log.total_destinatarios,
        log.enviados,
        log.falhas,
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-disparos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, especialidade ou tipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={handleExport} disabled={!logs || logs.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Enviados</TableHead>
              <TableHead className="text-right">Falhas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">Carregando...</TableCell>
              </TableRow>
            ) : logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{log.usuario_nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="flex items-center gap-1 w-fit">
                      {log.tipo_disparo === 'email' ? (
                        <Mail className="h-3 w-3" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      {log.tipo_disparo || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.especialidade}</TableCell>
                  <TableCell>
                    {log.estado && <Badge variant="secondary">{log.estado}</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {log.total_destinatarios}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="default">{log.enviados}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {log.falhas > 0 ? (
                      <Badge variant="destructive">{log.falhas}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
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
