import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRoleLabel } from "@/lib/roleLabels";
import { Download, Search } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function AuditoriaPermissoes() {
  const { user } = useAuth();
  const { isAdmin, isLeader } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

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

  const { data: logs, isLoading } = useQuery({
    queryKey: ['permissoes-log-auditoria', searchTerm, dateRange, userProfile?.setor_id, isLeader],
    queryFn: async () => {
      let query = supabase
        .from('permissoes_log')
        .select(`
          *,
          profiles:user_id!left (
            nome_completo,
            email,
            setor_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', dateRange.to.toISOString());
      }

      const { data } = await query;
      
      let filteredData = data || [];

      // Filtrar por setor se for líder
      if (isLeader && userProfile?.setor_id) {
        filteredData = filteredData.filter((log: any) => 
          log.profiles?.setor_id === userProfile.setor_id
        );
      }
      
      if (!searchTerm) return filteredData;
      
      return filteredData.filter((log: any) => 
        log.profiles?.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.modulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.acao?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    },
  });

  const handleExport = () => {
    if (!logs) return;
    
    const csv = [
      ['Data/Hora', 'Usuário', 'Email', 'Módulo', 'Ação', 'Perfil', 'Campo', 'Valor Anterior', 'Valor Novo'],
      ...logs.map((log: any) => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        log.profiles?.nome_completo || '',
        log.profiles?.email || '',
        log.modulo,
        log.acao,
        getRoleLabel(log.perfil),
        log.campo_modificado,
        log.valor_anterior || '-',
        log.valor_novo || '-',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria-permissoes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {isLeader && userProfile?.setores && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Visualizando dados do setor: <strong>{userProfile.setores.nome}</strong>
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário, módulo ou ação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd/MM/yy")} - {format(dateRange.to, "dd/MM/yy")}
                    </>
                  ) : (
                    format(dateRange.from, "dd/MM/yyyy")
                  )
                ) : (
                  "Filtrar por data"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
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
              <TableHead>Módulo</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Campo</TableHead>
              <TableHead>Anterior</TableHead>
              <TableHead>Novo</TableHead>
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
                  Nenhuma alteração registrada
                </TableCell>
              </TableRow>
            ) : (
              logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
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
