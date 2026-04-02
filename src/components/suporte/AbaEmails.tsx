import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, CheckCircle, XCircle, Clock } from "lucide-react";
import { ResendEmailButton } from "./ResendEmailButton";
import { Skeleton } from "@/components/ui/skeleton";

export function AbaEmails() {
  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets-emails'],
    queryFn: async () => {
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('suporte_tickets')
        .select('*')
        .order('data_abertura', { ascending: false });
      
      if (ticketsError) throw ticketsError;
      
      // Buscar emails dos usuários
      const userIds = ticketsData?.map(t => t.solicitante_id).filter(Boolean) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      
      // Map para adicionar o email do solicitante
      return ticketsData?.map(ticket => ({
        ...ticket,
        solicitante_email: profiles?.find(p => p.id === ticket.solicitante_id)?.email || null
      }));
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
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Histórico de Emails de Suporte</h3>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Email Enviado Para</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data Abertura</TableHead>
                  <TableHead>Status Email</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets && tickets.length > 0 ? (
                  tickets.map((ticket) => {
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">{ticket.numero}</TableCell>
                        <TableCell>{ticket.solicitante_nome}</TableCell>
                        <TableCell>
                          <a 
                            href={`mailto:${ticket.solicitante_email || 'N/A'}`}
                            className="text-primary hover:underline"
                          >
                            {ticket.solicitante_email || 'Email não disponível'}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ticket.tipo === 'software' ? 'Software' : 'Hardware'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(ticket.data_abertura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {ticket.email_status === 'enviado' ? (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <div className="flex flex-col">
                                <span className="text-sm">Enviado</span>
                                {ticket.email_enviado_em && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(ticket.email_enviado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : ticket.email_status === 'pendente' ? (
                            <div className="flex items-center gap-2 text-yellow-600">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">Pendente</span>
                            </div>
                          ) : ticket.email_status === 'falha' ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 text-red-600">
                                <XCircle className="h-4 w-4" />
                                <span className="text-sm">Falha</span>
                              </div>
                              {ticket.email_erro && (
                                <span className="text-xs text-muted-foreground mt-1">
                                  {ticket.email_erro}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-gray-600">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">Aguardando</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ticket.destino === 'interno' ? 'default' : 'secondary'}>
                            {ticket.destino === 'interno' ? 'Interno' : 'Externo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <ResendEmailButton 
                            ticketId={ticket.id} 
                            ticketNumero={ticket.numero}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
              <span><strong>Enviado:</strong> Email foi enviado com sucesso para o solicitante</span>
            </p>
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span><strong>Pendente:</strong> Email está sendo processado</span>
            </p>
            <p className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span><strong>Falha:</strong> Erro ao enviar o email - use o botão Reenviar</span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
