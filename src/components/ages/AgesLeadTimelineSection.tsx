import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  FileText,
  CheckCircle2,
  UserCheck,
  Phone,
  Calendar,
  Clock,
  ArrowRight,
  Edit,
  PlusCircle,
  Send,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AgesLeadTimelineSectionProps {
  leadId: string;
}

type TipoEventoAgesLead =
  | "lead_criado"
  | "lead_editado"
  | "status_alterado"
  | "convertido_profissional"
  | "enviado_acompanhamento"
  | "documento_anexado"
  | "documento_removido"
  | "contato_telefonico"
  | "email_enviado"
  | "aprovacao_alterada";

export function AgesLeadTimelineSection({ leadId }: AgesLeadTimelineSectionProps) {
  const { data: historico, isLoading } = useQuery({
    queryKey: ["ages-lead-historico", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_lead_historico")
        .select("*")
        .eq("lead_id", leadId)
        .order("criado_em", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const getEventIcon = (tipo: TipoEventoAgesLead) => {
    switch (tipo) {
      case "email_enviado":
        return <Mail className="h-4 w-4" />;
      case "documento_anexado":
      case "documento_removido":
        return <FileText className="h-4 w-4" />;
      case "convertido_profissional":
        return <UserCheck className="h-4 w-4" />;
      case "contato_telefonico":
        return <Phone className="h-4 w-4" />;
      case "lead_criado":
        return <PlusCircle className="h-4 w-4" />;
      case "lead_editado":
        return <Edit className="h-4 w-4" />;
      case "enviado_acompanhamento":
        return <Send className="h-4 w-4" />;
      case "aprovacao_alterada":
        return <CheckCircle2 className="h-4 w-4" />;
      case "status_alterado":
      default:
        return <ArrowRight className="h-4 w-4" />;
    }
  };

  const getEventColor = (tipo: TipoEventoAgesLead) => {
    switch (tipo) {
      case "email_enviado":
        return "bg-blue-500";
      case "documento_anexado":
        return "bg-purple-500";
      case "documento_removido":
        return "bg-red-500";
      case "convertido_profissional":
        return "bg-primary";
      case "contato_telefonico":
        return "bg-orange-500";
      case "lead_criado":
        return "bg-sky-500";
      case "lead_editado":
        return "bg-slate-500";
      case "enviado_acompanhamento":
        return "bg-amber-500";
      case "aprovacao_alterada":
        return "bg-emerald-500";
      case "status_alterado":
      default:
        return "bg-gray-500";
    }
  };

  const getEventLabel = (tipo: TipoEventoAgesLead) => {
    switch (tipo) {
      case "email_enviado":
        return "E-mail";
      case "documento_anexado":
        return "Documento anexado";
      case "documento_removido":
        return "Documento removido";
      case "convertido_profissional":
        return "Conversão";
      case "contato_telefonico":
        return "Contato";
      case "lead_criado":
        return "Criação";
      case "lead_editado":
        return "Edição";
      case "enviado_acompanhamento":
        return "Acompanhamento";
      case "aprovacao_alterada":
        return "Aprovação";
      case "status_alterado":
      default:
        return "Status";
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
        <h3 className="font-semibold">Histórico ({historico.length} eventos)</h3>
      </div>

      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-4">
          {historico.map((evento: any) => (
            <div key={evento.id} className="relative flex gap-4">
              <div
                className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-white ${getEventColor(
                  evento.tipo_evento as TipoEventoAgesLead
                )}`}
              >
                {getEventIcon(evento.tipo_evento as TipoEventoAgesLead)}
              </div>

              <div className="flex-1 rounded-lg border bg-card p-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <Badge variant="outline" className="mb-1">
                      {getEventLabel(evento.tipo_evento as TipoEventoAgesLead)}
                    </Badge>
                    <p className="font-medium">{evento.descricao_resumida}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p>{format(new Date(evento.criado_em), "dd/MM/yyyy", { locale: ptBR })}</p>
                    <p>{format(new Date(evento.criado_em), "HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                {evento.usuario_nome && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">Por: {evento.usuario_nome}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
