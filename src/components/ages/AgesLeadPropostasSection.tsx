import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Building2, Calendar, DollarSign, Plus, MapPin, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { AgesNovaPropostaDialog } from "./AgesNovaPropostaDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface AgesLeadPropostasSectionProps {
  leadId: string;
  leadNome?: string;
  unidadesVinculadas?: string[];
}

export function AgesLeadPropostasSection({ leadId, leadNome, unidadesVinculadas }: AgesLeadPropostasSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [propostaParaEditar, setPropostaParaEditar] = useState<any>(null);
  const queryClient = useQueryClient();
  const { isAdmin, isLeader } = usePermissions();
  const podeExcluir = isAdmin || isLeader;

  const { data: propostas, isLoading } = useQuery({
    queryKey: ['ages-lead-propostas', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_propostas')
        .select(`
          *,
          cliente:ages_clientes!ages_propostas_cliente_id_fkey(id, nome_empresa),
          unidade:ages_unidades!ages_propostas_unidade_id_fkey(id, nome),
          contrato:ages_contratos!ages_propostas_contrato_id_fkey(id, codigo_contrato, objeto_contrato)
        `)
        .eq('lead_id', leadId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'rascunho':
        return <Badge variant="secondary">Rascunho</Badge>;
      case 'enviada':
        return <Badge className="bg-blue-500">Enviada</Badge>;
      case 'aceita':
        return <Badge className="bg-green-500">Aceita</Badge>;
      case 'recusada':
        return <Badge variant="destructive">Recusada</Badge>;
      default:
        return <Badge variant="outline">{status || 'N/A'}</Badge>;
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      const { error } = await supabase.from('ages_propostas').delete().eq('id', propostaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta excluída!");
      queryClient.invalidateQueries({ queryKey: ['ages-lead-propostas', leadId] });
    },
    onError: () => {
      toast.error("Erro ao excluir proposta");
    },
  });

  const handleEditar = (proposta: any) => {
    setPropostaParaEditar({
      id: proposta.id,
      cliente_id: proposta.cliente?.id || proposta.cliente_id,
      unidade_id: proposta.unidade?.id || proposta.unidade_id,
      contrato_id: proposta.contrato?.id || proposta.contrato_id,
      observacoes: proposta.observacoes,
      valor: proposta.valor,
      status: proposta.status,
    });
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setPropostaParaEditar(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Propostas ({propostas?.length || 0})
        </h3>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Proposta
        </Button>
      </div>

      {(!propostas || propostas.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhuma proposta</p>
          <p className="text-sm">Clique em "Nova Proposta" para criar uma.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {propostas.map((proposta: any) => (
            <div key={proposta.id} className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  {/* ID, Status and Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-primary">
                      {proposta.id_proposta || proposta.id.slice(0, 8)}
                    </span>
                    {getStatusBadge(proposta.status)}
                    
                    {/* Edit/Delete buttons */}
                    <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleEditar(proposta)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(proposta.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>

                  {/* Cliente Info */}
                  {proposta.cliente && (
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm font-medium">{proposta.cliente.nome_empresa}</p>
                    </div>
                  )}

                  {/* Unidade */}
                  {proposta.unidade && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{proposta.unidade.nome}</span>
                    </div>
                  )}

                  {/* Contrato */}
                  {proposta.contrato && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">
                        Contrato: {proposta.contrato.codigo_contrato || 'S/N'}
                      </span>
                    </div>
                  )}

                  {/* Observações */}
                  {proposta.observacoes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{proposta.observacoes}</p>
                  )}
                </div>

                {/* Right Side - Value and Date */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-lg font-semibold text-primary">
                    <DollarSign className="h-4 w-4" />
                    {formatCurrency(proposta.valor)}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    {proposta.criado_em ? format(new Date(proposta.criado_em), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog Nova/Editar Proposta */}
      <AgesNovaPropostaDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        leadId={leadId}
        leadNome={leadNome}
        unidadesVinculadas={unidadesVinculadas}
        propostaParaEditar={propostaParaEditar}
      />
    </div>
  );
}
