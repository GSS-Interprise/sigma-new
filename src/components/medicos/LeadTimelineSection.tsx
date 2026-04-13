import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mail, MessageSquare, FileText, CheckCircle2, XCircle, 
  UserCheck, Phone, Calendar, Clock, ArrowRight, Building2,
  Edit, PlusCircle, UserPlus, AlertTriangle, Send, Eye
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadTimelineSectionProps {
  leadId: string;
}

import { TipoEventoLead } from "@/lib/leadHistoryLogger";

export function LeadTimelineSection({ leadId }: LeadTimelineSectionProps) {
  const { data: historico, isLoading } = useQuery({
    queryKey: ['lead-historico', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_historico')
        .select(`
          *,
          proposta:proposta!lead_historico_proposta_id_fkey(id, id_proposta, valor),
          servico:servico!lead_historico_servico_id_fkey(id, nome),
          contrato:contratos!lead_historico_contrato_id_fkey(id, codigo_contrato),
          licitacao:licitacoes!lead_historico_licitacao_id_fkey(id, numero_edital),
          medico:medicos!lead_historico_medico_id_fkey(id, nome_completo, crm)
        `)
        .eq('lead_id', leadId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const getEventIcon = (tipo: TipoEventoLead) => {
    switch (tipo) {
      case 'disparo_email':
        return <Mail className="h-4 w-4" />;
      case 'disparo_zap':
        return <MessageSquare className="h-4 w-4" />;
      case 'proposta_enviada':
        return <FileText className="h-4 w-4" />;
      case 'proposta_aceita':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'proposta_recusada':
        return <XCircle className="h-4 w-4" />;
      case 'convertido_em_medico':
        return <UserCheck className="h-4 w-4" />;
      case 'atendimento':
      case 'contato_telefonico':
        return <Phone className="h-4 w-4" />;
      case 'reuniao_agendada':
        return <Calendar className="h-4 w-4" />;
      case 'documentacao_solicitada':
      case 'documentacao_recebida':
        return <FileText className="h-4 w-4" />;
      case 'lead_criado':
        return <PlusCircle className="h-4 w-4" />;
      case 'lead_editado':
        return <Edit className="h-4 w-4" />;
      case 'enviado_acompanhamento':
        return <Send className="h-4 w-4" />;
      case 'lead_qualificado':
        return <UserPlus className="h-4 w-4" />;
      case 'em_resposta':
        return <Eye className="h-4 w-4" />;
      case 'lead_descartado':
        return <AlertTriangle className="h-4 w-4" />;
      case 'status_alterado':
        return <ArrowRight className="h-4 w-4" />;
      default:
        return <ArrowRight className="h-4 w-4" />;
    }
  };

  const getEventColor = (tipo: TipoEventoLead) => {
    switch (tipo) {
      case 'disparo_email':
        return 'bg-blue-500';
      case 'disparo_zap':
        return 'bg-green-500';
      case 'proposta_enviada':
        return 'bg-purple-500';
      case 'proposta_aceita':
        return 'bg-emerald-500';
      case 'proposta_recusada':
        return 'bg-red-500';
      case 'convertido_em_medico':
        return 'bg-primary';
      case 'atendimento':
      case 'contato_telefonico':
        return 'bg-orange-500';
      case 'reuniao_agendada':
        return 'bg-cyan-500';
      case 'lead_criado':
        return 'bg-sky-500';
      case 'lead_editado':
        return 'bg-slate-500';
      case 'enviado_acompanhamento':
        return 'bg-amber-500';
      case 'lead_qualificado':
        return 'bg-indigo-500';
      case 'em_resposta':
        return 'bg-cyan-500';
      case 'lead_descartado':
        return 'bg-red-600';
      case 'status_alterado':
        return 'bg-gray-500';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getEventLabel = (tipo: TipoEventoLead) => {
    switch (tipo) {
      case 'disparo_email': return 'Disparo de E-mail';
      case 'disparo_zap': return 'Disparo WhatsApp';
      case 'proposta_enviada': return 'Proposta Enviada';
      case 'proposta_aceita': return 'Proposta Aceita';
      case 'proposta_recusada': return 'Proposta Recusada';
      case 'convertido_em_medico': return 'Convertido em Médico';
      case 'atendimento': return 'Atendimento';
      case 'contato_telefonico': return 'Contato Telefônico';
      case 'reuniao_agendada': return 'Reunião Agendada';
      case 'documentacao_solicitada': return 'Documentação Solicitada';
      case 'documentacao_recebida': return 'Documentação Recebida';
      case 'lead_criado': return 'Lead Criado';
      case 'lead_editado': return 'Lead Editado';
      case 'enviado_acompanhamento': return 'Enviado p/ Acompanhamento';
      case 'lead_qualificado': return 'Lead Qualificado';
      case 'em_resposta': return 'Em Resposta';
      case 'lead_descartado': return 'Lead Descartado';
      case 'status_alterado': return 'Status Alterado';
      default: return 'Outro';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!historico || historico.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Nenhum evento registrado</p>
        <p className="text-sm">O histórico de interações aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Histórico ({historico.length} eventos)
        </h3>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-4">
          {historico.map((evento: any, index: number) => (
            <div key={evento.id} className="relative flex gap-4">
              {/* Icon */}
              <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-white ${getEventColor(evento.tipo_evento)}`}>
                {getEventIcon(evento.tipo_evento)}
              </div>

              {/* Content */}
              <div className="flex-1 rounded-lg border bg-card p-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <Badge variant="outline" className="mb-1">
                      {getEventLabel(evento.tipo_evento)}
                    </Badge>
                    <p className="font-medium">{evento.descricao_resumida}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p>{format(new Date(evento.criado_em), "dd/MM/yyyy", { locale: ptBR })}</p>
                    <p>{format(new Date(evento.criado_em), "HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                {/* Related entities */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {evento.proposta && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      Proposta: {evento.proposta.id_proposta || evento.proposta.id.slice(0, 8)}
                    </span>
                  )}
                  {evento.servico && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {evento.servico.nome}
                    </span>
                  )}
                  {evento.contrato && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      Contrato: {evento.contrato.codigo_contrato || 'S/N'}
                    </span>
                  )}
                  {evento.licitacao && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      Licitação: {evento.licitacao.numero_edital}
                    </span>
                  )}
                  {evento.medico && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <UserCheck className="h-3 w-3" />
                      Médico: {evento.medico.nome_completo}
                    </span>
                  )}
                </div>

                {/* JUS verification image preview */}
                {evento.metadados && typeof evento.metadados === 'object' && (evento.metadados as any).arquivo_url && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">
                      📎 {(evento.metadados as any).tipo || 'Anexo'}
                    </p>
                    <a href={(evento.metadados as any).arquivo_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={(evento.metadados as any).arquivo_url}
                        alt={(evento.metadados as any).tipo || 'Anexo'}
                        className="max-h-[200px] rounded-md border object-contain cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    </a>
                  </div>
                )}

                {/* User info */}
                {evento.usuario_nome && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    Por: {evento.usuario_nome}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
