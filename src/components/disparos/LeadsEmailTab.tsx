import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle, 
  Clock, 
  Eye,
  MapPin,
  Mail,
  User,
  Calendar,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusVariants: Record<string, string> = {
  novo: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  em_analise: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  concluido: "bg-green-500/10 text-green-500 border-green-500/20",
  descartado: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em Análise",
  concluido: "Concluído",
  descartado: "Descartado",
};

export function LeadsEmailTab() {
  const [selectedResposta, setSelectedResposta] = useState<any>(null);
  const [observacoes, setObservacoes] = useState("");
  const queryClient = useQueryClient();

  const { data: respostas = [], isLoading } = useQuery({
    queryKey: ["email-respostas-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_respostas" as any)
        .select(`
          *,
          medico:medico_id (
            nome_completo,
            especialidade
          )
        `)
        .order("data_resposta", { ascending: false });

      if (error) {
        console.error("Erro ao buscar respostas:", error);
        return [];
      }
      return data || [];
    },
  });

  const atualizarStatusMutation = useMutation({
    mutationFn: async ({ id, status, obs }: { id: string; status: string; obs?: string }) => {
      const updates: any = {
        status_lead: status,
        updated_at: new Date().toISOString(),
      };

      if (obs) {
        updates.observacoes = obs;
      }

      if (status === 'concluido') {
        const { data: { user } } = await supabase.auth.getUser();
        updates.concluido = true;
        updates.concluido_por = user?.id;
        updates.concluido_em = new Date().toISOString();
      } else {
        updates.concluido = false;
        updates.concluido_por = null;
        updates.concluido_em = null;
      }

      const { error } = await supabase
        .from("email_respostas" as any)
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-respostas-leads"] });
      toast.success("Status atualizado com sucesso!");
      setSelectedResposta(null);
      setObservacoes("");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  const deletarRespostaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_respostas" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-respostas-leads"] });
      toast.success("Resposta removida com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover resposta: " + error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded"></div>
                <div className="h-3 bg-muted rounded w-5/6"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (respostas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Mail className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nenhuma resposta de email recebida ainda
          </p>
          <p className="text-sm text-muted-foreground text-center mt-2">
            As respostas dos médicos aparecerão aqui automaticamente
          </p>
        </CardContent>
      </Card>
    );
  }

  const agrupadosPorStatus = respostas.reduce((acc: Record<string, any[]>, resposta: any) => {
    const status = resposta.status_lead;
    if (!acc[status]) acc[status] = [];
    acc[status].push(resposta);
    return acc;
  }, {});

  return (
    <>
      <div className="space-y-6">
        {Object.entries(agrupadosPorStatus).map(([status, respostasDoStatus]) => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className={statusVariants[status]}>
                {statusLabels[status]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {respostasDoStatus.length} {respostasDoStatus.length === 1 ? 'lead' : 'leads'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {respostasDoStatus.map((resposta) => (
                <Card key={resposta.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {resposta.remetente_nome || resposta.remetente_email}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {resposta.remetente_email}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja remover esta resposta?")) {
                            deletarRespostaMutation.mutate(resposta.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {resposta.especialidade && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className="text-xs">
                          {resposta.especialidade}
                        </Badge>
                      </div>
                    )}

                    {resposta.localidade && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {resposta.localidade}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(resposta.data_resposta), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>

                    <div className="bg-muted/50 rounded-md p-3 text-sm">
                      <p className="line-clamp-3 text-muted-foreground">
                        {resposta.conteudo_resposta}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedResposta(resposta);
                          setObservacoes(resposta.observacoes || "");
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver Detalhes
                      </Button>
                      {!resposta.concluido && (
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            atualizarStatusMutation.mutate({
                              id: resposta.id,
                              status: 'concluido'
                            });
                          }}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Concluir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Dialog de Detalhes */}
      <Dialog open={!!selectedResposta} onOpenChange={() => setSelectedResposta(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Resposta</DialogTitle>
          </DialogHeader>

          {selectedResposta && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Remetente</Label>
                <p className="text-sm">{selectedResposta.remetente_nome || selectedResposta.remetente_email}</p>
                <p className="text-xs text-muted-foreground">{selectedResposta.remetente_email}</p>
              </div>

              {selectedResposta.especialidade && (
                <div>
                  <Label className="text-sm font-semibold">Especialidade</Label>
                  <p className="text-sm">{selectedResposta.especialidade}</p>
                </div>
              )}

              {selectedResposta.localidade && (
                <div>
                  <Label className="text-sm font-semibold">Localidade</Label>
                  <p className="text-sm">{selectedResposta.localidade}</p>
                </div>
              )}

              <div>
                <Label className="text-sm font-semibold">Data da Resposta</Label>
                <p className="text-sm">
                  {format(new Date(selectedResposta.data_resposta), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>

              <div>
                <Label className="text-sm font-semibold">Conteúdo da Resposta</Label>
                <div className="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap mt-2">
                  {selectedResposta.conteudo_resposta}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Status</Label>
                <Select
                  value={selectedResposta.status_lead}
                  onValueChange={(value) => {
                    atualizarStatusMutation.mutate({
                      id: selectedResposta.id,
                      status: value,
                      obs: observacoes
                    });
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="descartado">Descartado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="observacoes" className="text-sm font-semibold">
                  Observações
                </Label>
                <Textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Adicione observações sobre este lead..."
                  className="mt-2"
                  rows={4}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedResposta(null)}
                  className="flex-1"
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    atualizarStatusMutation.mutate({
                      id: selectedResposta.id,
                      status: selectedResposta.status_lead,
                      obs: observacoes
                    });
                  }}
                  className="flex-1"
                >
                  Salvar Observações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
