import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { History, X, Edit, PlusCircle, Send, UserCheck, Mail, MessageSquare, FileText, Phone, Calendar, ArrowRight, AlertTriangle, Eye, UserPlus, CheckCircle2, XCircle, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AgesLeadAtividadesPanelProps {
  leadId: string;
  onClose: () => void;
  embedded?: boolean;
}

type TipoEventoAgesLead = 
  | 'lead_criado'
  | 'lead_editado'
  | 'status_alterado'
  | 'convertido_profissional'
  | 'enviado_acompanhamento'
  | 'documento_anexado'
  | 'documento_removido'
  | 'contato_telefonico'
  | 'email_enviado'
  | 'aprovacao_alterada';

export function AgesLeadAtividadesPanel({ leadId, onClose, embedded }: AgesLeadAtividadesPanelProps) {
  const { data: historico, isLoading } = useQuery({
    queryKey: ['ages-lead-historico', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_lead_historico')
        .select('*')
        .eq('lead_id', leadId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const getEventIcon = (tipo: TipoEventoAgesLead) => {
    switch (tipo) {
      case 'email_enviado': return <Mail className="h-3 w-3" />;
      case 'documento_anexado': return <FileText className="h-3 w-3" />;
      case 'documento_removido': return <XCircle className="h-3 w-3" />;
      case 'convertido_profissional': return <UserCheck className="h-3 w-3" />;
      case 'contato_telefonico': return <Phone className="h-3 w-3" />;
      case 'lead_criado': return <PlusCircle className="h-3 w-3" />;
      case 'lead_editado': return <Edit className="h-3 w-3" />;
      case 'enviado_acompanhamento': return <Send className="h-3 w-3" />;
      case 'aprovacao_alterada': return <CheckCircle2 className="h-3 w-3" />;
      case 'status_alterado': return <ArrowRight className="h-3 w-3" />;
      default: return <ArrowRight className="h-3 w-3" />;
    }
  };

  const getEventColor = (tipo: TipoEventoAgesLead) => {
    switch (tipo) {
      case 'email_enviado': return 'bg-blue-500';
      case 'documento_anexado': return 'bg-purple-500';
      case 'documento_removido': return 'bg-red-500';
      case 'convertido_profissional': return 'bg-primary';
      case 'contato_telefonico': return 'bg-orange-500';
      case 'lead_criado': return 'bg-sky-500';
      case 'lead_editado': return 'bg-slate-500';
      case 'enviado_acompanhamento': return 'bg-amber-500';
      case 'aprovacao_alterada': return 'bg-emerald-500';
      case 'status_alterado': return 'bg-gray-500';
      default: return 'bg-muted-foreground';
    }
  };

  return (
    <div className={embedded ? "flex flex-col h-full" : "w-80 border-l bg-muted/30 flex flex-col shrink-0"}>
      {!embedded && (
        <div className="flex items-center justify-between p-3 border-b bg-background">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-primary" />
            Atividades
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : historico && historico.length > 0 ? (
            <div className="space-y-2">
              {historico.map((evento: any) => (
                <div key={evento.id} className="rounded-lg border bg-background p-2.5">
                  <div className="flex items-start gap-2">
                    <div className={`shrink-0 flex items-center justify-center h-6 w-6 rounded-full text-white ${getEventColor(evento.tipo_evento as TipoEventoAgesLead)}`}>
                      {getEventIcon(evento.tipo_evento as TipoEventoAgesLead)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight line-clamp-2">
                        {evento.descricao_resumida}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                        <span>{format(new Date(evento.criado_em), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                        {evento.usuario_nome && (
                          <>
                            <span>•</span>
                            <span className="truncate">{evento.usuario_nome}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-medium text-sm">Nenhuma atividade</p>
              <p className="text-xs">As alterações serão exibidas aqui.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
