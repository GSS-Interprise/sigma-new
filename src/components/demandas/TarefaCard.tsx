import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Paperclip,
  Users,
  Gavel,
  FileText,
  UserSearch,
  MessageCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { URGENCIA_CLASS, URGENCIA_LABEL, TIPO_LABEL } from "@/lib/setoresAccess";
import type { DemandaTarefa } from "@/hooks/useDemandas";

interface Props {
  tarefa: DemandaTarefa;
  onConcluir?: (id: string) => void;
  onClick?: (t: DemandaTarefa) => void;
  compact?: boolean;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function TarefaCard({ tarefa, onConcluir, onClick, compact }: Props) {
  const atrasada =
    tarefa.data_limite &&
    tarefa.status !== "concluida" &&
    isPast(new Date(tarefa.data_limite));

  const urgClass =
    URGENCIA_CLASS[tarefa.urgencia] ?? URGENCIA_CLASS.media;

  const refs: { icon: any; label: string }[] = [];
  if (tarefa.licitacao_id) refs.push({ icon: Gavel, label: "Licitação" });
  if (tarefa.contrato_id) refs.push({ icon: FileText, label: "Contrato" });
  if (tarefa.lead_id) refs.push({ icon: UserSearch, label: "Lead" });
  if (tarefa.sigzap_conversation_id)
    refs.push({ icon: MessageCircle, label: "SigZap" });

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-l-[3px] p-3 transition-all hover:shadow-md cursor-pointer bg-card/60 backdrop-blur-sm",
        atrasada
          ? "border-l-destructive"
          : tarefa.urgencia === "critica"
          ? "border-l-destructive"
          : tarefa.urgencia === "alta"
          ? "border-l-orange-500"
          : tarefa.urgencia === "media"
          ? "border-l-primary"
          : "border-l-muted-foreground/40",
        tarefa.status === "concluida" && "opacity-60",
      )}
      onClick={() => onClick?.(tarefa)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4
          className={cn(
            "text-sm font-semibold leading-snug flex-1 line-clamp-2",
            tarefa.status === "concluida" && "line-through",
          )}
        >
          {tarefa.titulo}
        </h4>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", urgClass)}>
          {URGENCIA_LABEL[tarefa.urgencia] ?? tarefa.urgencia}
        </Badge>
      </div>

      {!compact && tarefa.descricao && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {tarefa.descricao
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim()}
        </p>
      )}

      <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5">
          {TIPO_LABEL[tarefa.tipo] ?? tarefa.tipo}
        </span>
        {tarefa.setor_destino_nome && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5">
            {tarefa.setor_destino_nome}
          </span>
        )}
        {tarefa.escopo === "geral" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-1.5 py-0.5">
            Geral
          </span>
        )}
        {refs.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <r.icon className="h-3 w-3" />
            {r.label}
          </span>
        ))}
        {tarefa.anexos_count ? (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" />
            {tarefa.anexos_count}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px]">
          {tarefa.data_limite ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                atrasada ? "text-destructive font-medium" : "text-muted-foreground",
              )}
            >
              <Calendar className="h-3 w-3" />
              {format(new Date(tarefa.data_limite), "dd MMM", { locale: ptBR })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Sem prazo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {tarefa.responsavel_nome && (
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[9px] bg-primary/15 text-primary">
                {initials(tarefa.responsavel_nome)}
              </AvatarFallback>
            </Avatar>
          )}
          {(tarefa.mencionados ?? []).slice(0, 3).map((m) => (
            <Avatar key={m.user_id} className="h-5 w-5 -ml-1.5 ring-2 ring-card">
              <AvatarFallback className="text-[9px] bg-accent/40">
                {initials(m.nome)}
              </AvatarFallback>
            </Avatar>
          ))}
          {(tarefa.mencionados?.length ?? 0) > 3 && (
            <span className="text-[10px] text-muted-foreground ml-1">
              +{(tarefa.mencionados!.length - 3)}
            </span>
          )}
        </div>
      </div>

      {onConcluir && tarefa.status !== "concluida" && (
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onConcluir(tarefa.id);
          }}
          title="Marcar como concluída"
        >
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </Button>
      )}
    </Card>
  );
}
