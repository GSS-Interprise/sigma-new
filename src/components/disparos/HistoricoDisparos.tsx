import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function HistoricoDisparos() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["disparos-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Histórico de Disparos</h2>
        <p className="text-muted-foreground">Carregando histórico...</p>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Histórico de Disparos</h2>
        <p className="text-muted-foreground">Nenhum disparo realizado ainda.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">
        Histórico de Disparos (últimos 10)
      </h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Destinatários</TableHead>
              <TableHead>Enviados</TableHead>
              <TableHead>Falhas</TableHead>
              <TableHead>IA</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell>{log.usuario_nome}</TableCell>
                <TableCell>{log.especialidade}</TableCell>
                <TableCell>{log.estado || "Todos"}</TableCell>
                <TableCell>{log.total_destinatarios}</TableCell>
                <TableCell className="text-green-600 font-medium">
                  {log.enviados}
                </TableCell>
                <TableCell
                  className={log.falhas > 0 ? "text-red-600 font-medium" : ""}
                >
                  {log.falhas}
                </TableCell>
                <TableCell>
                  {log.revisado_ia && (
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Detalhes do Disparo</DialogTitle>
                        <DialogDescription>
                          Enviado em{" "}
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-semibold mb-2">Mensagem:</h4>
                          <div className="bg-muted/50 p-4 rounded-lg whitespace-pre-wrap text-sm">
                            {log.mensagem}
                          </div>
                        </div>

                        {log.destinatarios && Array.isArray(log.destinatarios) && (
                          <div>
                            <h4 className="font-semibold mb-2">
                              Destinatários ({log.destinatarios.length}):
                            </h4>
                            <ScrollArea className="h-[200px] border rounded-lg">
                              <div className="p-4 space-y-2">
                                {log.destinatarios.map((dest: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="text-sm border-b pb-2 last:border-0"
                                  >
                                    <p className="font-medium">{dest.nome}</p>
                                    <p className="text-muted-foreground text-xs">
                                      {dest.email} | {dest.telefone}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {log.falhas > 0 && log.detalhes_falhas && (
                          <div>
                            <h4 className="font-semibold mb-2 text-red-600">
                              Falhas ({log.falhas}):
                            </h4>
                            <ScrollArea className="h-[150px] border rounded-lg bg-red-50">
                              <div className="p-4 space-y-2">
                                {(log.detalhes_falhas as any[]).map(
                                  (falha: any, idx: number) => (
                                    <div key={idx} className="text-sm">
                                      <p className="font-medium">{falha.contato}</p>
                                      <p className="text-muted-foreground text-xs">
                                        {falha.motivo}
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
