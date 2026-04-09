import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Building2, Briefcase, Calendar, DollarSign, Plus, MapPin, Package, Pencil, Trash2, Link2, Copy, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { NovaPropostaDialog } from "./NovaPropostaDialog";
import { VincularPropostaExistenteDialog } from "./VincularPropostaExistenteDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LeadPropostasSectionProps {
  leadId: string;
  leadNome?: string;
  unidadesVinculadas?: string[];
}

export function LeadPropostasSection({ leadId, leadNome, unidadesVinculadas }: LeadPropostasSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  const [propostaParaEditar, setPropostaParaEditar] = useState<any>(null);
  const [propostaParaPersonalizar, setPropostaParaPersonalizar] = useState<any>(null);
  const queryClient = useQueryClient();
  const { isAdmin, isLeader } = usePermissions();
  const podeExcluir = isAdmin || isLeader;

  const { data: propostas, isLoading } = useQuery({
    queryKey: ['lead-propostas', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposta')
        .select(`
          *,
          servico:servico!proposta_servico_id_fkey(
            id, 
            nome, 
            especialidade,
            contrato_capitacao:contrato_capitacao!servico_contrato_capitacao_id_fkey(
              id,
              contrato:contratos!contrato_capitacao_contrato_id_fkey(
                id,
                codigo_contrato,
                objeto_contrato,
                cliente:clientes!contratos_cliente_id_fkey(nome_empresa)
              )
            )
          ),
          contrato:contratos!proposta_contrato_id_fkey(
            id,
            codigo_contrato,
            objeto_contrato,
            cliente:clientes!contratos_cliente_id_fkey(id, nome_empresa)
          ),
          unidade:unidades!proposta_unidade_id_fkey(
            id,
            nome
          ),
          licitacao:licitacoes!proposta_licitacao_id_fkey(
            id,
            numero_edital,
            orgao,
            objeto
          )
        `)
        .eq('lead_id', leadId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  // Fetch itens das propostas
  const { data: propostasItens } = useQuery({
    queryKey: ['propostas-itens', propostas?.map(p => p.id)],
    queryFn: async () => {
      if (!propostas || propostas.length === 0) return {};
      
      const propostaIds = propostas.map(p => p.id);
      const { data, error } = await supabase
        .from('proposta_itens')
        .select('*')
        .in('proposta_id', propostaIds);
      
      if (error) throw error;
      
      // Agrupar por proposta_id
      const grouped: Record<string, typeof data> = {};
      data?.forEach(item => {
        if (!grouped[item.proposta_id]) {
          grouped[item.proposta_id] = [];
        }
        grouped[item.proposta_id].push(item);
      });
      return grouped;
    },
    enabled: !!propostas && propostas.length > 0,
  });

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (status: string | null, tipo: string | null) => {
    // Para propostas personalizadas, mostrar badge especial
    if (tipo === 'personalizada') {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          <User className="h-3 w-3 mr-1" />
          Personalizada
        </Badge>
      );
    }
    
    switch (status) {
      case 'geral':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Geral</Badge>;
      case 'rascunho':
        return <Badge variant="secondary">Para Disparo</Badge>;
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

  const getTipoBadge = (tipo: string | null) => {
    if (tipo === 'personalizada') {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          <User className="h-3 w-3 mr-1" />
          Personalizada
        </Badge>
      );
    }
    return null;
  };

  // Desvincular proposta (para propostas vinculadas de contratos de captação)
  const desvincularMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      const { error } = await supabase
        .from('proposta')
        .update({ lead_id: null, descricao: null })
        .eq('id', propostaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta desvinculada!");
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-propostas-count', leadId] });
      queryClient.invalidateQueries({ queryKey: ['propostas-disponiveis-vincular'] });
    },
    onError: () => {
      toast.error("Erro ao desvincular proposta");
    },
  });

  // Excluir proposta permanentemente (apenas para propostas criadas localmente)
  const deleteMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      // Delete itens first
      await supabase.from('proposta_itens').delete().eq('proposta_id', propostaId);
      // Then delete proposta
      const { error } = await supabase.from('proposta').delete().eq('id', propostaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta excluída!");
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-propostas-count', leadId] });
    },
    onError: () => {
      toast.error("Erro ao excluir proposta");
    },
  });

  // Personalizar proposta - clona a proposta vinculada e converte para personalizada
  const personalizarMutation = useMutation({
    mutationFn: async (proposta: any) => {
      // 1. Buscar itens da proposta original
      const { data: itensOriginais } = await supabase
        .from('proposta_itens')
        .select('*')
        .eq('proposta_id', proposta.id);

      // 2. Criar nova proposta personalizada
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // Calcular numero_proposta
      const { data: maxProposta } = await supabase
        .from('proposta')
        .select('numero_proposta')
        .eq('lead_id', leadId)
        .order('numero_proposta', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextNumero = (maxProposta?.numero_proposta || 0) + 1;
      
      const { data: novaProposta, error: createError } = await supabase
        .from('proposta')
        .insert({
          lead_id: leadId,
          contrato_id: proposta.contrato_id,
          unidade_id: proposta.unidade_id,
          servico_id: null, // Remove vínculo com serviço
          tipo: 'personalizada',
          status: 'personalizada',
          valor: proposta.valor,
          nome: `Proposta personalizada - ${leadNome || 'Lead'}`,
          observacoes: proposta.observacoes,
          descricao: `Proposta personalizada para ${leadNome || 'Lead'}`,
          criado_por: currentUser?.id || null,
          criado_por_nome: currentUser?.user_metadata?.nome_completo || currentUser?.email || null,
          numero_proposta: nextNumero,
        })
        .select()
        .single();

      if (createError) throw createError;

      // 3. Copiar itens para a nova proposta
      if (itensOriginais && itensOriginais.length > 0) {
        const novosItens = itensOriginais.map(item => ({
          proposta_id: novaProposta.id,
          contrato_item_id: item.contrato_item_id,
          item_nome: item.item_nome,
          valor_contrato: item.valor_contrato,
          valor_medico: item.valor_medico,
          quantidade: item.quantidade,
        }));

        const { error: itensError } = await supabase
          .from('proposta_itens')
          .insert(novosItens);

        if (itensError) throw itensError;
      }

      // 4. Desvincular a proposta original do lead
      await supabase
        .from('proposta')
        .update({ lead_id: null, descricao: null })
        .eq('id', proposta.id);

      return novaProposta;
    },
    onSuccess: () => {
      toast.success("Proposta personalizada criada! Agora você pode editar os valores.");
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['propostas-disponiveis-vincular'] });
    },
    onError: (error: any) => {
      toast.error("Erro ao personalizar proposta: " + error.message);
    },
  });

  // Verifica se a proposta veio de um contrato de captação (vinculada) ou foi criada localmente
  const isPropostaVinculada = (proposta: any) => {
    // Se o tipo é 'disparo' e tem servico_id, é vinculada (para disparos)
    // Se o tipo é 'personalizada', não é vinculada (foi personalizada para o médico)
    return proposta.tipo === 'disparo' && (proposta.servico_id || proposta.descricao?.includes('Proposta vinculada'));
  };

  const handleEditar = (proposta: any) => {
    setPropostaParaEditar({
      id: proposta.id,
      unidade_id: proposta.unidade?.id || proposta.unidade_id,
      contrato_id: proposta.contrato?.id || proposta.contrato_id,
      observacoes: proposta.observacoes,
      valor: proposta.valor,
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setVincularDialogOpen(true)} size="sm">
            <Link2 className="h-4 w-4 mr-2" />
            Vincular Existente
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Proposta
          </Button>
        </div>
      </div>

      {(!propostas || propostas.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhuma proposta enviada</p>
          <p className="text-sm">Clique em "Nova Proposta" para criar uma.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {propostas.map((proposta: any) => {
            const itens = propostasItens?.[proposta.id] || [];
            
            return (
              <div key={proposta.id} className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* ID, Status and Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium text-primary">
                        {proposta.numero_proposta ? `Proposta #${proposta.numero_proposta}` : (proposta.id_proposta || proposta.id.slice(0, 8))}
                      </span>
                      {getStatusBadge(proposta.status, proposta.tipo)}
                      
                      {/* Edit/Delete/Personalizar buttons */}
                      <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Botão Personalizar - só aparece para propostas vinculadas (tipo disparo) */}
                        {proposta.tipo !== 'personalizada' && isPropostaVinculada(proposta) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                  onClick={() => personalizarMutation.mutate(proposta)}
                                  disabled={personalizarMutation.isPending}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Personalizar proposta com valores exclusivos para este médico</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
                                <AlertDialogTitle>
                                  {isPropostaVinculada(proposta) ? 'Desvincular proposta?' : 'Excluir proposta?'}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isPropostaVinculada(proposta) 
                                    ? 'A proposta será desvinculada deste profissional e ficará disponível para outros leads.'
                                    : 'Esta ação não pode ser desfeita.'}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => isPropostaVinculada(proposta) 
                                    ? desvincularMutation.mutate(proposta.id)
                                    : deleteMutation.mutate(proposta.id)}
                                  className={isPropostaVinculada(proposta) 
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                                >
                                  {isPropostaVinculada(proposta) ? 'Desvincular' : 'Excluir'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>

                    {/* Contract Info (novo vínculo direto) */}
                    {proposta.contrato && (
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm">
                            Contrato: <span className="font-medium">{proposta.contrato.codigo_contrato || 'S/N'}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {proposta.contrato.cliente?.nome_empresa}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Unidade */}
                    {proposta.unidade && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">{proposta.unidade.nome}</span>
                      </div>
                    )}

                    {/* Service Info (legado) */}
                    {!proposta.contrato && proposta.servico && (
                      <div className="flex items-start gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{proposta.servico.nome}</p>
                          <p className="text-xs text-muted-foreground">{proposta.servico.especialidade}</p>
                        </div>
                      </div>
                    )}

                    {/* Contract Info (legado via serviço) */}
                    {!proposta.contrato && proposta.servico?.contrato_capitacao?.contrato && (
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm">
                            Contrato: <span className="font-medium">{proposta.servico.contrato_capitacao.contrato.codigo_contrato || 'S/N'}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {proposta.servico.contrato_capitacao.contrato.cliente?.nome_empresa}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Licitação Info */}
                    {proposta.licitacao && (
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm">
                            Licitação: <span className="font-medium">{proposta.licitacao.numero_edital}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{proposta.licitacao.orgao}</p>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {proposta.descricao && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{proposta.descricao}</p>
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

                {/* Itens da Proposta */}
                {itens.length > 0 && (
                  <Collapsible className="mt-3 pt-3 border-t">
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Package className="h-4 w-4" />
                      <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="rounded border bg-muted/30">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium">Item</th>
                              <th className="text-right p-2 font-medium">Vl. Contrato</th>
                              <th className="text-right p-2 font-medium">Vl. Médico</th>
                              <th className="text-center p-2 font-medium">Qtd</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itens.map((item: any) => (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="p-2">{item.item_nome}</td>
                                <td className="p-2 text-right text-muted-foreground">{formatCurrency(item.valor_contrato)}</td>
                                <td className="p-2 text-right font-medium">{formatCurrency(item.valor_medico)}</td>
                                <td className="p-2 text-center">{item.quantidade}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Observations */}
                {proposta.observacoes && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">{proposta.observacoes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Nova/Editar Proposta */}
      <NovaPropostaDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        leadId={leadId}
        leadNome={leadNome}
        unidadesVinculadas={unidadesVinculadas}
        propostaParaEditar={propostaParaEditar}
      />

      {/* Dialog Vincular Proposta Existente */}
      <VincularPropostaExistenteDialog
        open={vincularDialogOpen}
        onOpenChange={setVincularDialogOpen}
        leadId={leadId}
        leadNome={leadNome}
        unidadesVinculadas={unidadesVinculadas}
      />
    </div>
  );
}
