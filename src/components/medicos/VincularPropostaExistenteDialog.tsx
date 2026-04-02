import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, FileText, Building2, Link2, Check, Loader2 } from "lucide-react";

interface VincularPropostaExistenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadNome?: string;
  unidadesVinculadas?: string[];
}

export function VincularPropostaExistenteDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  unidadesVinculadas,
}: VincularPropostaExistenteDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPropostaId, setSelectedPropostaId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Buscar propostas disponíveis baseadas nas unidades vinculadas ou contratos
  const { data: propostasDisponiveis, isLoading } = useQuery({
    queryKey: ['propostas-disponiveis-vincular', unidadesVinculadas, leadId],
    queryFn: async () => {
      // Buscar propostas de DISPARO (para captação) sem lead vinculado
      // Propostas personalizadas não aparecem pois são exclusivas de um médico
      
      const { data, error } = await supabase
        .from('proposta')
        .select(`
          id,
          id_proposta,
          nome,
          tipo,
          status,
          valor,
          observacoes,
          descricao,
          criado_em,
          lead_id,
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
            cliente:clientes!contratos_cliente_id_fkey(id, nome_empresa),
            unidade:unidades!contratos_unidade_id_fkey(id, nome)
          ),
          unidade:unidades!proposta_unidade_id_fkey(
            id,
            nome
          ),
          lead:leads!proposta_lead_id_fkey(
            id,
            nome
          )
        `)
        .is('lead_id', null) // Propostas sem lead vinculado
        .or('tipo.is.null,tipo.eq.disparo') // Apenas propostas de disparo (ou legadas sem tipo)
        .order('criado_em', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      // Se temos unidades vinculadas, filtrar localmente para incluir:
      // 1. Propostas com unidade nas unidades vinculadas
      // 2. Propostas com contrato.unidade nas unidades vinculadas
      // 3. Propostas sem unidade definida (para permitir associação manual)
      if (unidadesVinculadas && unidadesVinculadas.length > 0) {
        return (data || []).filter(proposta => {
          // Proposta com unidade direta vinculada
          if (proposta.unidade?.id && unidadesVinculadas.includes(proposta.unidade.id)) {
            return true;
          }
          // Proposta com contrato cuja unidade está vinculada
          if (proposta.contrato?.unidade?.id && unidadesVinculadas.includes(proposta.contrato.unidade.id)) {
            return true;
          }
          // Propostas sem unidade definida (podem ser associadas)
          if (!proposta.unidade?.id && !proposta.contrato?.unidade?.id) {
            return true;
          }
          return false;
        });
      }
      
      return data || [];
    },
    enabled: open,
  });

  // Filtrar por termo de busca
  const propostasFiltradas = (propostasDisponiveis || []).filter(proposta => {
    if (!searchTerm) return true;
    const termo = searchTerm.toLowerCase();
    const contratoNome = proposta.contrato?.cliente?.nome_empresa?.toLowerCase() || '';
    const unidadeNome = proposta.unidade?.nome?.toLowerCase() || proposta.contrato?.unidade?.nome?.toLowerCase() || '';
    const servicoNome = proposta.servico?.nome?.toLowerCase() || '';
    const codigo = proposta.contrato?.codigo_contrato?.toLowerCase() || '';
    const descricao = proposta.descricao?.toLowerCase() || '';
    
    return contratoNome.includes(termo) || 
           unidadeNome.includes(termo) || 
           servicoNome.includes(termo) ||
           codigo.includes(termo) ||
           descricao.includes(termo);
  });

  const vincularMutation = useMutation({
    mutationFn: async (propostaId: string) => {
      // Buscar proposta original para clonar
      const { data: propostaOriginal, error: fetchError } = await supabase
        .from('proposta')
        .select('*')
        .eq('id', propostaId)
        .single();
      
      if (fetchError || !propostaOriginal) throw fetchError || new Error('Proposta não encontrada');
      
      // Buscar itens da proposta original
      const { data: itensOriginais } = await supabase
        .from('proposta_itens')
        .select('*')
        .eq('proposta_id', propostaId);
      
      // Clonar proposta como "personalizada" para o lead, mantendo o template original intacto
      const { id, id_proposta, criado_em, atualizado_em, ...camposClonar } = propostaOriginal;
      
      const { data: novaProposta, error: insertError } = await supabase
        .from('proposta')
        .insert({
          ...camposClonar,
          lead_id: leadId,
          tipo: 'personalizada',
          status: 'personalizada',
          descricao: propostaOriginal.descricao || `Proposta vinculada a ${leadNome || 'Lead'}`,
        })
        .select('id')
        .single();
      
      if (insertError || !novaProposta) throw insertError || new Error('Erro ao criar proposta');
      
      // Clonar itens da proposta se existirem
      if (itensOriginais && itensOriginais.length > 0) {
        const novosItens = itensOriginais.map(item => {
          const { id: itemId, proposta_id, created_at, updated_at, ...itemCampos } = item;
          return {
            ...itemCampos,
            proposta_id: novaProposta.id,
          };
        });
        
        const { error: itensError } = await supabase
          .from('proposta_itens')
          .insert(novosItens);
        
        if (itensError) {
          console.error('Erro ao clonar itens:', itensError);
          // Não falha, proposta já foi criada
        }
      }
    },
    onSuccess: () => {
      toast.success("Proposta vinculada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-propostas-count', leadId] });
      queryClient.invalidateQueries({ queryKey: ['propostas-disponiveis-vincular'] });
      onOpenChange(false);
      setSelectedPropostaId(null);
      setSearchTerm("");
    },
    onError: () => {
      toast.error("Erro ao vincular proposta");
    },
  });

  const handleVincular = () => {
    if (selectedPropostaId) {
      vincularMutation.mutate(selectedPropostaId);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'geral':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Geral</Badge>;
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

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Proposta Existente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, unidade, contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="flex-1 h-[400px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : propostasFiltradas.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhuma proposta disponível</p>
                <p className="text-sm">Não há propostas sem lead vinculado para as unidades deste profissional.</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {propostasFiltradas.map((proposta) => {
                  const isSelected = selectedPropostaId === proposta.id;
                  const unidadeNome = proposta.unidade?.nome || proposta.contrato?.unidade?.nome;
                  const clienteNome = proposta.contrato?.cliente?.nome_empresa;
                  // Nome da proposta: usa o campo nome, ou gera um nome baseado no serviço/contrato
                  const nomeProposta = (proposta as any).nome || proposta.servico?.nome || proposta.descricao || `Proposta ${proposta.id_proposta || proposta.id.slice(0, 8)}`;
                  
                  return (
                    <div
                      key={proposta.id}
                      onClick={() => setSelectedPropostaId(proposta.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                          : 'hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-medium text-primary">
                              {proposta.id_proposta || proposta.id.slice(0, 8)}
                            </span>
                            {getStatusBadge(proposta.status)}
                            {proposta.valor != null && (
                              <span className="text-sm font-medium text-green-600">
                                {formatCurrency(proposta.valor)}
                              </span>
                            )}
                          </div>
                          
                          {/* Nome da Proposta em destaque */}
                          <p className="text-sm font-semibold truncate mb-1">{nomeProposta}</p>
                          
                          {clienteNome && (
                            <p className="text-sm text-muted-foreground truncate">{clienteNome}</p>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            {proposta.contrato?.codigo_contrato && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {proposta.contrato.codigo_contrato}
                              </span>
                            )}
                            {unidadeNome && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {unidadeNome}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="flex-shrink-0">
                            <Check className="h-5 w-5 text-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleVincular} 
              disabled={!selectedPropostaId || vincularMutation.isPending}
            >
              {vincularMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Vincular Proposta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
