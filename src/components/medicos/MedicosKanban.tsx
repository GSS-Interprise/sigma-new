import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Phone, Mail, FileText, Calendar, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { cn } from "@/lib/utils";
import { MedicoKanbanCardDialog } from "./MedicoKanbanCardDialog";
import { CardActionsMenu } from "@/components/demandas/CardActionsMenu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// Mapa de cores de etiquetas para tailwind
const tagColorMap: Record<string, { bg: string; text: string }> = {
  red: { bg: 'bg-red-100', text: 'text-red-800' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  green: { bg: 'bg-green-100', text: 'text-green-800' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-800' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

type MedicoKanbanCard = {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  crm: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  status: string;
  canal_id: string | null;
  medico_id: string | null;
  responsavel_id: string | null;
  created_at: string;
  updated_at: string;
  etiquetas: string[] | null;
};

export function MedicosKanban({ searchTerm = "" }: { searchTerm?: string }) {
  const queryClient = useQueryClient();
  const [selectedCard, setSelectedCard] = useState<MedicoKanbanCard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: columns = [], isLoading: loadingColumns } = useKanbanColumns('medicos');

  // Buscar configuração de etiquetas para exibir cores corretas
  const { data: etiquetasConfig = [] } = useQuery({
    queryKey: ['leads-etiquetas-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_etiquetas_config')
        .select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: cards, isLoading: loadingCards } = useQuery<MedicoKanbanCard[]>({
    queryKey: ['medicos-kanban-cards'],
    queryFn: async () => {
      // Busca cards com join para medicos -> leads para obter tags (nome correto da coluna)
      // Buscar cards e lista de médicos aprovados em paralelo
      const [cardsResult, aprovadosResult] = await Promise.all([
        supabase
          .from('medico_kanban_cards')
          .select(`
            *,
            medicos:medico_id (
              lead_id,
              aprovacao_contrato_assinado,
              aprovacao_documentacao_unidade,
              aprovacao_cadastro_unidade,
              leads:lead_id (
                tags
              )
            )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('medicos')
          .select('nome_completo')
          .eq('aprovacao_contrato_assinado', true)
          .eq('aprovacao_documentacao_unidade', true)
          .eq('aprovacao_cadastro_unidade', true),
      ]);

      if (cardsResult.error) throw cardsResult.error;

      // Nomes de médicos totalmente aprovados (normalizados) para filtrar cards órfãos
      const nomesAprovados = new Set(
        (aprovadosResult.data || []).map((m: any) => m.nome_completo?.toLowerCase().trim())
      );
      
      // Filtrar cards de médicos já totalmente aprovados (por vínculo ou por nome)
      return (cardsResult.data || [])
        .filter((card: any) => {
          const m = card.medicos;
          // Card com vínculo: checar aprovações
          if (m) {
            return !(m.aprovacao_contrato_assinado && m.aprovacao_documentacao_unidade && m.aprovacao_cadastro_unidade);
          }
          // Card órfão (sem medico_id): checar pelo nome
          return !nomesAprovados.has(card.nome?.toLowerCase().trim());
        })
        .map((card: any) => ({
          ...card,
          etiquetas: card.medicos?.leads?.tags || card.etiquetas || [],
          medicos: undefined,
        }));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('medico_kanban_cards')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      toast.success('Status atualizado');
    },
  });

  const createPreCadastroMutation = useMutation({
    mutationFn: async (card: MedicoKanbanCard) => {
      // Novo modelo: criar lead primeiro, depois médico com lead_id
      const phoneE164 = card.telefone 
        ? (card.telefone.startsWith('+') ? card.telefone : '+55' + card.telefone.replace(/[^0-9]/g, ''))
        : '+55' + Date.now().toString().slice(-11);

      // Verificar se já existe lead com mesmo telefone
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('phone_e164', phoneE164)
        .maybeSingle();

      let leadId = existingLead?.id;

      // Se não existe lead, criar um novo
      if (!leadId) {
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            nome: card.nome,
            phone_e164: phoneE164,
            email: card.email,
            cpf: card.cpf,
            crm: card.crm,
            data_nascimento: card.data_nascimento,
            observacoes: card.observacoes,
            status: 'Revisar Dados',
            origem: 'Kanban Médicos',
          })
          .select('id')
          .single();

        if (leadError) throw leadError;
        leadId = newLead.id;
      }

      // Verificar se já existe médico com mesmo phone_e164
      const { data: existingMedico } = await supabase
        .from('medicos')
        .select('id')
        .eq('phone_e164', phoneE164)
        .maybeSingle();

      let medicoId = existingMedico?.id;

      if (existingMedico) {
        // Atualizar médico existente com lead_id
        const { error: updateMedicoError } = await supabase
          .from('medicos')
          .update({ lead_id: leadId })
          .eq('id', existingMedico.id);
        
        if (updateMedicoError) throw updateMedicoError;
      } else {
        // Criar novo médico vinculado ao lead
        const { data: newMedico, error: medicoError } = await supabase
          .from('medicos')
          .insert({
            nome_completo: card.nome,
            cpf: card.cpf,
            data_nascimento: card.data_nascimento,
            crm: card.crm,
            telefone: card.telefone,
            phone_e164: phoneE164,
            email: card.email,
            status_medico: 'Ativo',
            lead_id: leadId,
          })
          .select()
          .single();

        if (medicoError) throw medicoError;
        medicoId = newMedico.id;
      }

      // Update the kanban card with the medico_id and move to 'revisar_dados'
      const { error: updateError } = await supabase
        .from('medico_kanban_cards')
        .update({ 
          medico_id: medicoId, 
          status: 'revisar_dados',
          updated_at: new Date().toISOString() 
        })
        .eq('id', card.id);

      if (updateError) throw updateError;

      return { medicoId, leadId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicos-kanban-cards'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Pré-cadastro criado com sucesso');
    },
    onError: (error: any) => {
      console.error('Erro ao criar pré-cadastro:', error);
      toast.error('Erro ao criar pré-cadastro');
    },
  });

  const getCardsByStatus = (status: string) => {
    const filtered = cards?.filter(card => {
      if (card.status !== status) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        card.nome?.toLowerCase().includes(term) ||
        card.telefone?.toLowerCase().includes(term) ||
        card.cpf?.toLowerCase().includes(term)
      );
    }) || [];
    return filtered;
  };

  // Calcula a cor de urgência baseada nos dias na coluna "ativo"
  const getUrgencyStyle = (card: MedicoKanbanCard, columnId: string) => {
    // Só aplica na coluna "ativo"
    if (columnId !== 'ativo') return {};
    
    const daysInColumn = differenceInDays(new Date(), new Date(card.updated_at));
    
    if (daysInColumn >= 10) {
      // Vermelho - urgente
      return { 
        backgroundColor: 'hsl(0 84% 95%)', 
        borderColor: 'hsl(0 84% 60%)',
        borderWidth: '2px'
      };
    } else if (daysInColumn >= 6) {
      // Laranja - atenção alta
      return { 
        backgroundColor: 'hsl(25 95% 95%)', 
        borderColor: 'hsl(25 95% 53%)',
        borderWidth: '2px'
      };
    } else if (daysInColumn >= 3) {
      // Amarelo - atenção
      return { 
        backgroundColor: 'hsl(48 96% 95%)', 
        borderColor: 'hsl(48 96% 53%)',
        borderWidth: '2px'
      };
    } else {
      // Verde - ok
      return { 
        backgroundColor: 'hsl(142 76% 95%)', 
        borderColor: 'hsl(142 76% 36%)',
        borderWidth: '2px'
      };
    }
  };

  const getUrgencyBadge = (card: MedicoKanbanCard, columnId: string) => {
    if (columnId !== 'ativo') return null;
    
    const daysInColumn = differenceInDays(new Date(), new Date(card.updated_at));
    
    if (daysInColumn >= 10) {
      return <Badge variant="destructive" className="text-xs">{daysInColumn}d - Urgente!</Badge>;
    } else if (daysInColumn >= 6) {
      return <Badge className="text-xs bg-orange-500 hover:bg-orange-600">{daysInColumn}d</Badge>;
    } else if (daysInColumn >= 3) {
      return <Badge className="text-xs bg-yellow-500 hover:bg-yellow-600 text-black">{daysInColumn}d</Badge>;
    } else {
      return <Badge className="text-xs bg-green-500 hover:bg-green-600">{daysInColumn}d</Badge>;
    }
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('cardId', cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId) {
      updateStatusMutation.mutate({ id: cardId, status: newStatus });
    }
  };

  const handleCardClick = (card: MedicoKanbanCard) => {
    setSelectedCard(card);
    setDialogOpen(true);
  };

  const handleCreatePreCadastro = (card: MedicoKanbanCard) => {
    if (card.medico_id) {
      toast.info('Este card já possui um pré-cadastro vinculado');
      return;
    }
    createPreCadastroMutation.mutate(card);
  };

  if (loadingColumns || loadingCards) {
    return <div className="p-4">Carregando...</div>;
  }

  return (
    <>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto h-[calc(100vh-220px)] pb-2 px-1">
        {columns.map((column) => (
          <Card 
            key={column.id} 
            className="w-[260px] sm:w-[280px] md:w-[300px] flex-shrink-0 flex flex-col h-full"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="h-2 w-2 rounded-full" 
                    style={{ backgroundColor: column.cor || 'hsl(var(--primary))' }}
                  />
                  <span className="truncate">{column.label}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {getCardsByStatus(column.id).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pt-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-3">
                  {getCardsByStatus(column.id).map((card) => (
                    <ContextMenu key={card.id}>
                      <ContextMenuTrigger>
                        <Card
                          className="cursor-move hover:shadow-md transition-shadow"
                          draggable
                          onDragStart={(e) => handleDragStart(e, card.id)}
                          onClick={() => handleCardClick(card)}
                          style={getUrgencyStyle(card, column.id)}
                        >
                          <CardContent className="p-3 space-y-2">
                            {/* Nome e Badge de urgência */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-4 w-4 text-primary flex-shrink-0" />
                                <h4 className="font-semibold text-sm line-clamp-1">
                                  {card.nome}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {getUrgencyBadge(card, column.id)}
                                <CardActionsMenu
                                  tipo="livre"
                                  recursoId={card.id}
                                  label={card.nome || "Médico"}
                                />
                              </div>
                            </div>

                            {/* Informações */}
                            <div className="space-y-1.5 text-xs">
                              {card.cpf && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <CreditCard className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{card.cpf}</span>
                                </div>
                              )}

                              {card.crm && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <FileText className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">CRM: {card.crm}</span>
                                </div>
                              )}

                              {card.telefone && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{card.telefone}</span>
                                </div>
                              )}

                              {card.email && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Mail className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{card.email}</span>
                                </div>
                              )}

                              {card.data_nascimento && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">
                                    {format(new Date(card.data_nascimento + 'T00:00:00'), 'dd/MM/yyyy')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Etiquetas */}
                            {card.etiquetas && card.etiquetas.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {card.etiquetas.map((tagNome) => {
                                  const tagConfig = etiquetasConfig.find((c: any) => 
                                    c.nome?.toLowerCase().trim() === tagNome?.toLowerCase().trim()
                                  );
                                  const colorId = tagConfig?.cor_id || 'gray';
                                  const colors = tagColorMap[colorId] || tagColorMap.gray;
                                  return (
                                    <Badge 
                                      key={tagNome} 
                                      className={cn("text-xs", colors.bg, colors.text)}
                                    >
                                      {tagNome}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}

                            {/* Status badges */}
                            <div className="flex flex-wrap gap-1">
                              {card.medico_id && (
                                <Badge variant="secondary" className="text-xs">
                                  Cadastrado
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => handleCreatePreCadastro(card)}
                          disabled={!!card.medico_id}
                        >
                          Criar Pré-Cadastro
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                  
                  {getCardsByStatus(column.id).length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      Nenhum card
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))}
      </div>

      <MedicoKanbanCardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        card={selectedCard}
      />
    </>
  );
}
