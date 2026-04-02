import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon, Users, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function EventosTab() {
  const queryClient = useQueryClient();

  const { data: eventos, isLoading } = useQuery({
    queryKey: ['eventos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos' as any)
        .select('*');
      if (error) throw error;
      return data as any;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('eventos' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventos'] });
      toast.success('Evento excluído com sucesso');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Eventos de Marketing</h2>
          <p className="text-sm text-muted-foreground">Gerencie eventos, feiras e ações presenciais</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Evento
        </Button>
      </div>

      {isLoading ? (
        <div>Carregando eventos...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventos?.map((evento) => (
            <Card key={evento.id} className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-lg">{evento.nome}</h3>
                <div className="flex items-center gap-2 text-muted-foreground mt-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-sm">
                    {format(new Date(evento.data_evento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {evento.orcamento && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm">Orçamento</span>
                    </div>
                    <span className="font-semibold">R$ {Number(evento.orcamento).toLocaleString('pt-BR')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Leads Gerados</span>
                  </div>
                  <span className="font-semibold text-green-600">{evento.leads_gerados || 0}</span>
                </div>
              </div>

              {evento.participantes && evento.participantes.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Participantes:</p>
                  <div className="flex flex-wrap gap-1">
                    {evento.participantes.slice(0, 3).map((participante, idx) => (
                      <span key={idx} className="text-xs bg-secondary px-2 py-1 rounded">
                        {participante}
                      </span>
                    ))}
                    {evento.participantes.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{evento.participantes.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              )}

              {evento.relatorio_pos_evento && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Relatório:</p>
                  <p className="text-sm line-clamp-2">{evento.relatorio_pos_evento}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">Ver Detalhes</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm('Deseja excluir este evento?')) {
                      deleteMutation.mutate(evento.id);
                    }
                  }}
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}