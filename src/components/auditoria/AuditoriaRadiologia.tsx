import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search } from "lucide-react";

export function AuditoriaRadiologia() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ['radiologia-log-auditoria', searchTerm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('radiologia_pendencias_historico')
        .select(`
          *,
          radiologia_pendencias (
            cliente_id,
            clientes (nome_empresa)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      
      // Buscar perfis manualmente para os usuario_id
      const userIds = [...new Set((data || []).map((log: any) => log.usuario_id).filter(Boolean))];
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome_completo')
          .in('id', userIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.nome_completo]) || []);
        
        const dataWithProfiles = (data || []).map((log: any) => ({
          ...log,
          profile_nome: profileMap.get(log.usuario_id)
        }));
        
        if (!searchTerm) return dataWithProfiles;
        
        return dataWithProfiles.filter((log: any) => 
          log.profile_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.acao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.radiologia_pendencias?.clientes?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      if (!searchTerm) return data || [];
      
      return (data || []).filter((log: any) => 
        log.usuario_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.acao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.radiologia_pendencias?.clientes?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    },
  });

  const handleExport = () => {
    if (!logs) return;
    
    const csv = [
      ['Data/Hora', 'Usuário', 'Ação', 'Cliente', 'Detalhes'],
      ...logs.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        log.profile_nome || log.usuario_nome || 'Sistema',
        log.acao,
        log.radiologia_pendencias?.clientes?.nome_empresa || '-',
        log.detalhes || '-',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-radiologia-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getAcaoBadge = (acao: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'marcada_resolvida': 'default',
      'registro_atualizado': 'secondary',
      'email_enviado': 'outline',
    };
    return <Badge variant={variants[acao] || 'outline'}>{acao}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, ação ou cliente..."
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
              <TableHead>Cliente</TableHead>
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
              logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {log.profile_nome || log.usuario_nome || 'Sistema'}
                  </TableCell>
                  <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                  <TableCell>
                    {log.radiologia_pendencias?.clientes?.nome_empresa || '-'}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {log.detalhes || '-'}
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
