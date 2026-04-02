import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, FileText, Link as LinkIcon } from "lucide-react";

export function AuditoriaDocumentos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ['documentos-log-auditoria', searchTerm],
    queryFn: async () => {
      const { data } = await supabase
        .from('medico_documentos_log')
        .select(`
          *,
          medicos (nome_completo)
        `)
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (!searchTerm) return data || [];
      
      return (data || []).filter((log: any) => 
        log.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.acao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.medicos?.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    },
  });

  const handleExport = () => {
    if (!logs) return;
    
    const csv = [
      ['Data/Hora', 'Usuário', 'Ação', 'Médico', 'Detalhes'],
      ...logs.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        log.usuario_nome,
        log.acao,
        log.medicos?.nome_completo || '-',
        log.detalhes || '-',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-documentos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, ação ou médico..."
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
              <TableHead>Ação</TableHead>
              <TableHead>Médico</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">Carregando...</TableCell>
              </TableRow>
            ) : logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log: any) => {
                const isExternalLink = log.detalhes?.includes('link externo');
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{log.usuario_nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.acao}</Badge>
                    </TableCell>
                    <TableCell>{log.medicos?.nome_completo || '-'}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-start gap-2">
                        {isExternalLink ? (
                          <LinkIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-sm truncate">{log.detalhes || '-'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
