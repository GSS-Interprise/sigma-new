import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, CheckCircle, XCircle, Clock, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const MODULO_LABELS: Record<string, string> = {
  suporte: "Suporte",
  contratos: "Contratos",
  campanhas: "Campanhas",
  disparos: "Disparos",
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  enviado: { label: "Enviado", color: "text-green-600", icon: CheckCircle },
  falha: { label: "Falha", color: "text-red-600", icon: XCircle },
  pendente: { label: "Pendente", color: "text-yellow-600", icon: Clock },
};

export function AbaEmails() {
  const [moduloFilter, setModuloFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const { data: emails, isLoading } = useQuery({
    queryKey: ['sigma-email-log', moduloFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('sigma_email_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (moduloFilter !== "todos") {
        query = query.eq('modulo', moduloFilter);
      }
      if (statusFilter !== "todos") {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['sigma-email-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigma_email_log')
        .select('status, modulo');
      if (error) throw error;

      const total = data?.length || 0;
      const enviados = data?.filter(e => e.status === 'enviado').length || 0;
      const falhas = data?.filter(e => e.status === 'falha').length || 0;
      const modulos = [...new Set(data?.map(e => e.modulo) || [])];

      return { total, enviados, falhas, modulos };
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Enviados</p>
              <p className="text-2xl font-bold">{stats?.total || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sucesso</p>
              <p className="text-2xl font-bold text-green-600">{stats?.enviados || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Falhas</p>
              <p className="text-2xl font-bold text-red-600">{stats?.falhas || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Central de Emails do SIGMA</h3>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={moduloFilter} onValueChange={setModuloFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos módulos</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="contratos">Contratos</SelectItem>
                  <SelectItem value="campanhas">Campanhas</SelectItem>
                  <SelectItem value="disparos">Disparos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="falha">Falha</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails && emails.length > 0 ? (
                  emails.map((email: any) => {
                    const statusInfo = STATUS_LABELS[email.status] || STATUS_LABELS.pendente;
                    const StatusIcon = statusInfo.icon;

                    return (
                      <TableRow key={email.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {MODULO_LABELS[email.modulo] || email.modulo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {email.destinatario_nome && (
                              <span className="text-sm font-medium">{email.destinatario_nome}</span>
                            )}
                            <a
                              href={`mailto:${email.destinatario_email}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {email.destinatario_email}
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm">
                          {email.assunto}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 ${statusInfo.color}`}>
                            <StatusIcon className="h-4 w-4" />
                            <span className="text-sm">{statusInfo.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(email.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {email.erro && (
                            <span className="text-xs text-red-500 truncate block">{email.erro}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum email encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span><strong>Enviado:</strong> Email entregue com sucesso</span>
            </p>
            <p className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span><strong>Falha:</strong> Erro no envio do email</span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
