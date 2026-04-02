import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const ETAPAS = [
  { value: 'lead_gerado', label: 'Lead Gerado', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'contato_inicial', label: 'Contato Inicial', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'envio_informacoes', label: 'Envio de Informações', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'qualificacao', label: 'Qualificação', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'encaminhado_captacao', label: 'Encaminhado à Captação', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  { value: 'processo_contratacao', label: 'Em Processo', color: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { value: 'plantao_agendado', label: 'Plantão Agendado', color: 'bg-green-100 text-green-700 border-green-300' },
];

export function FunilCaptacaoTab() {
  const queryClient = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ['marketing-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_leads' as any)
        .select('*, origem:campanhas(nome), responsavel:profiles(nome_completo)');
      if (error) throw error;
      return data as any;
    },
  });

  const updateEtapaMutation = useMutation({
    mutationFn: async ({ id, etapa }: { id: string; etapa: string }) => {
      const { error } = await supabase
        .from('marketing_leads' as any)
        .update({ etapa } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-leads'] });
      toast.success('Lead movido com sucesso');
    },
  });

  const getLeadsByEtapa = (etapa: string) => {
    return leads?.filter(lead => lead.etapa === etapa) || [];
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Funil de Captação de Médicos</h2>
          <p className="text-sm text-muted-foreground">Gerencie o pipeline de leads e oportunidades</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Lead
        </Button>
      </div>

      {isLoading ? (
        <div>Carregando funil...</div>
      ) : (
        <div className="grid grid-cols-7 gap-4">
          {ETAPAS.map((etapa) => {
            const leadsEtapa = getLeadsByEtapa(etapa.value);
            return (
              <div key={etapa.value} className="space-y-3">
                <div className={`p-3 rounded-lg border-2 ${etapa.color}`}>
                  <h3 className="font-semibold text-sm text-center">{etapa.label}</h3>
                  <p className="text-center text-2xl font-bold mt-1">{leadsEtapa.length}</p>
                </div>
                <ScrollArea className="h-[calc(100vh-300px)]">
                  <div className="space-y-2 pr-2">
                    {leadsEtapa.map((lead) => (
                      <Card key={lead.id} className="p-3 space-y-2 cursor-move hover:shadow-md transition-shadow">
                        <div>
                          <h4 className="font-semibold text-sm">{lead.nome}</h4>
                          {lead.especialidade && (
                            <p className="text-xs text-muted-foreground">{lead.especialidade}</p>
                          )}
                        </div>
                        {lead.cidade && (
                          <p className="text-xs text-muted-foreground">📍 {lead.cidade}</p>
                        )}
                        {lead.telefone && (
                          <p className="text-xs text-muted-foreground">📞 {lead.telefone}</p>
                        )}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {lead.tags.slice(0, 2).map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs px-1 py-0">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="pt-2 border-t">
                          <select
                            className="w-full text-xs p-1 rounded border"
                            value={lead.etapa}
                            onChange={(e) => updateEtapaMutation.mutate({ id: lead.id, etapa: e.target.value })}
                          >
                            {ETAPAS.map(e => (
                              <option key={e.value} value={e.value}>{e.label}</option>
                            ))}
                          </select>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}