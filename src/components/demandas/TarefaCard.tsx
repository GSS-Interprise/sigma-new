import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  RotateCcw,
  Repeat,
  Trash2,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { URGENCIA_CLASS, URGENCIA_LABEL, TIPO_LABEL } from "@/lib/setoresAccess";
import type { DemandaTarefa } from "@/hooks/useDemandas";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { extractMensagemLink } from "@/lib/mensagemLink";
import { useNavigate } from "react-router-dom";
import { useSoftDeleteDemanda } from "@/hooks/useDemandas";

interface Props {
  tarefa: DemandaTarefa;
  onConcluir?: (id: string) => void;
  onReabrir?: (id: string) => void;
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

export function TarefaCard({ tarefa, onConcluir, onReabrir, onClick, compact }: Props) {
  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const softDelete = useSoftDeleteDemanda();
  const mensagemLink = extractMensagemLink(tarefa.descricao);
  const atrasada =
    tarefa.data_limite &&
    tarefa.status !== "concluida" &&
    isPast(parseLocalDate(tarefa.data_limite) ?? new Date(tarefa.data_limite));

  const finalizadoresIds = (tarefa.finalizadores ?? []).map((f) => f.user_id);
  const podeFinalizar =
    isAdmin ||
    (!!user?.id && (tarefa.created_by === user.id || finalizadoresIds.includes(user.id)));
  const souFinalizador =
    !!user?.id && (tarefa.created_by === user.id || finalizadoresIds.includes(user.id));

  const podeExcluir = isAdmin || (!!user?.id && tarefa.created_by === user.id);

  const urgClass =
    URGENCIA_CLASS[tarefa.urgencia] ?? URGENCIA_CLASS.media;

  const refs: { icon: typeof Gavel; label: string }[] = [];
  if (tarefa.licitacao_id) refs.push({ icon: Gavel, label: "Licitação" });
  if (tarefa.contrato_id) refs.push({ icon: FileText, label: "Contrato" });
  if (tarefa.lead_id) refs.push({ icon: UserSearch, label: "Lead" });
  if (tarefa.sigzap_conversation_id)
    refs.push({ icon: MessageCircle, label: "Conversa" });

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 cursor-pointer",
        atrasada
          ? "border-l-[6px] border-l-rose-500 bg-slate-900 text-white shadow-xl shadow-slate-900/10 hover:scale-[1.005] hover:shadow-2xl"
          : "border-l-[6px] bg-card hover:shadow-lg hover:-translate-y-0.5",
        !atrasada && (tarefa.urgencia === "critica"
          ? "border-l-destructive"
          : tarefa.urgencia === "alta"
          ? "border-l-orange-500"
          : tarefa.urgencia === "media"
          ? "border-l-primary"
          : "border-l-muted-foreground/40"),
        !atrasada && souFinalizador && tarefa.status !== "concluida" && "ring-1 ring-destructive/40 bg-destructive/[0.04]",
        tarefa.status === "concluida" && "opacity-60",
      )}
      onClick={() => onClick?.(tarefa)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4
          className={cn(
            "text-[15px] font-bold leading-snug flex-1 line-clamp-2",
            atrasada ? "text-white" : "text-foreground",
            tarefa.status === "concluida" && "line-through",
          )}
        >
          {tarefa.titulo}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {atrasada && (
            <Badge data-overdue-keep className="text-[10px] px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold tracking-wider uppercase">
              Atrasada
            </Badge>
          )}
          {souFinalizador && tarefa.status !== "concluida" && !atrasada && (
            <Badge className="text-[9px] px-1.5 py-0 bg-destructive/15 text-destructive border border-destructive/40">
              Você finaliza
            </Badge>
          )}
          <Badge variant="outline" className={cn(
            "text-[10px] px-1.5 py-0",
            atrasada ? "bg-white/10 text-white/80 border-white/15" : urgClass,
          )}>
            {URGENCIA_LABEL[tarefa.urgencia] ?? tarefa.urgencia}
          </Badge>
        </div>
      </div>

      {!compact && tarefa.descricao && (
        <p className={cn(
          "text-xs line-clamp-2 mb-3 leading-relaxed",
          atrasada ? "text-slate-400" : "text-muted-foreground",
        )}>
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

      <div className={cn(
        "flex items-center flex-wrap gap-1.5 text-[11px]",
        atrasada ? "text-slate-400" : "text-muted-foreground",
      )}>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
          atrasada ? "bg-white/5 text-slate-300 border border-white/10" : "bg-muted/60",
        )}>
          {TIPO_LABEL[tarefa.tipo] ?? tarefa.tipo}
        </span>
        {tarefa.setor_destino_nome && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
            atrasada ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-primary/10 text-primary",
          )}>
            {tarefa.setor_destino_nome}
          </span>
        )}
        {tarefa.escopo === "geral" && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
            atrasada ? "bg-white/5 text-slate-300 border border-white/10" : "bg-accent/40",
          )}>
            Geral
          </span>
        )}
        {refs.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <r.icon className="h-3 w-3" />
            {r.label}
          </span>
        ))}
        {mensagemLink && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(mensagemLink.href);
            }}
            title="Ir para mensagem original no canal"
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5 hover:bg-primary/20 transition-colors"
          >
            <MessageCircle className="h-3 w-3" />
            Mensagem
          </button>
        )}
        {tarefa.anexos_count ? (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" />
            {tarefa.anexos_count}
          </span>
        ) : null}
      </div>

      <div className={cn(
        "mt-3 pt-3 flex items-center justify-between gap-2 border-t",
        atrasada ? "border-white/5" : "border-border/40",
      )}>
        <div className="flex items-center gap-1 text-[11px]">
          {tarefa.data_limite ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                atrasada ? "text-rose-400" : "text-muted-foreground",
              )}
            >
              <Calendar className="h-3 w-3" />
              {format(parseLocalDate(tarefa.data_limite) ?? new Date(tarefa.data_limite), "dd MMM", { locale: ptBR })}
              {tarefa.data_limite_hora && (
                <span className="ml-0.5 tabular-nums">
                  · {(tarefa.data_limite_hora as string).slice(0, 5)}
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Sem prazo
            </span>
          )}
          {tarefa.recorrencia_id && (
            <span
              className="inline-flex items-center gap-0.5 text-primary"
              title="Tarefa recorrente"
            >
              <Repeat className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(() => {
            const envolvidos: Array<{ id: string; nome: string | null; destaque: boolean } | null> = [
              tarefa.criador_nome
                ? { id: tarefa.created_by ?? "criador", nome: tarefa.criador_nome, destaque: true }
                : null,
              tarefa.responsavel_nome
                ? { id: tarefa.responsavel_id ?? "responsavel", nome: tarefa.responsavel_nome, destaque: false }
                : null,
              ...(tarefa.mencionados ?? []).map((m) => ({ id: m.user_id, nome: m.nome ?? null, destaque: false })),
            ];
            const envolvidosValidos = envolvidos.filter(
              (p): p is { id: string; nome: string | null; destaque: boolean } => !!p,
            );
            const unicos = Array.from(new Map(envolvidosValidos.map((p) => [p.id, p])).values());
            return unicos.slice(0, 4).map((p) => (
              <Avatar key={p.id} className="h-5 w-5 -ml-1.5 first:ml-0 ring-2 ring-card" title={p.nome ?? undefined}>
                <AvatarFallback className={cn("text-[9px] bg-accent/40", p.destaque && "bg-primary/15 text-primary")}>
                  {initials(p.nome)}
                </AvatarFallback>
              </Avatar>
            ));
          })()}
          {(() => {
            const envolvidos = [
              tarefa.created_by,
              tarefa.responsavel_id,
              ...(tarefa.mencionados ?? []).map((m) => m.user_id),
            ].filter((id): id is string => !!id);
            const total = new Set(envolvidos).size;
            return total > 4 ? (
              <span className="text-[10px] text-muted-foreground ml-1">+{total - 4}</span>
            ) : null;
          })()}
        </div>
      </div>

      {onConcluir && tarefa.status !== "concluida" && podeFinalizar && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="absolute bottom-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 bg-card/80 hover:bg-card"
              onClick={(e) => e.stopPropagation()}
              title="Marcar como concluída"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Marcar como concluída?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta tarefa será marcada como concluída. Apenas administradores poderão reabri-la depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onConcluir(tarefa.id)}>
                Concluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {onReabrir && tarefa.status === "concluida" && isAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="absolute bottom-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 bg-card/80 hover:bg-card"
          onClick={(e) => {
            e.stopPropagation();
            onReabrir(tarefa.id);
          }}
          title="Reabrir tarefa (admin)"
        >
          <RotateCcw className="h-4 w-4 text-primary" />
        </Button>
      )}

      {podeExcluir && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 bg-card/80 hover:bg-card hover:text-red-600"
              onClick={(e) => e.stopPropagation()}
              title="Excluir tarefa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
              <AlertDialogDescription>
                A tarefa <b>{tarefa.titulo}</b> sairá da sua tela. O histórico
                permanece no banco e pode ser recuperado por um administrador.
                {tarefa.recorrencia_id && (
                  <>
                    {" "}
                    Esta é uma tarefa <b>recorrente</b> — escolha se quer remover
                    apenas esta ocorrência ou toda a série.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-wrap gap-2">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {tarefa.recorrencia_id ? (
                <>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() =>
                      softDelete.mutate({ tarefaId: tarefa.id, scope: "single" })
                    }
                  >
                    Só esta
                  </AlertDialogAction>
                  <AlertDialogAction
                    className="bg-red-700 hover:bg-red-800 text-white"
                    onClick={() =>
                      softDelete.mutate({
                        tarefaId: tarefa.id,
                        scope: "serie",
                        recorrenciaId: tarefa.recorrencia_id,
                      })
                    }
                  >
                    Toda a recorrência
                  </AlertDialogAction>
                </>
              ) : (
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => softDelete.mutate({ tarefaId: tarefa.id })}
                >
                  Excluir
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
