import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  MessageCircle,
  Mail,
  Instagram,
  Phone,
  Check,
  Clock,
  X,
  MoreHorizontal,
  CheckCircle2,
  ClipboardList,
  CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

type TaskTipo = "whatsapp_1" | "whatsapp_2" | "whatsapp_3" | "email" | "instagram" | "telefone";
type TaskStatus = "pendente" | "feita" | "snooze" | "descartada";

interface Task {
  id: string;
  campanha_lead_id: string;
  tipo: TaskTipo;
  ordem: number;
  status: TaskStatus;
  prazo_at: string;
  feita_em: string | null;
  feita_por: string | null;
  observacao: string | null;
  snooze_ate: string | null;
  descarte_motivo: string | null;
}

const TIPO_META: Record<TaskTipo, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp_1: { label: "WhatsApp #1", icon: MessageCircle, color: "text-emerald-600" },
  whatsapp_2: { label: "WhatsApp #2", icon: MessageCircle, color: "text-emerald-600" },
  email: { label: "Email", icon: Mail, color: "text-blue-600" },
  whatsapp_3: { label: "WhatsApp #3", icon: MessageCircle, color: "text-emerald-600" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-600" },
  telefone: { label: "Telefone", icon: Phone, color: "text-amber-600" },
};

const SNOOZE_OPCOES = [
  { label: "1 dia", horas: 24 },
  { label: "3 dias", horas: 72 },
  { label: "1 semana", horas: 168 },
];

interface Props {
  campanhaLeadId: string;
}

export function LeadCampanhaTasks({ campanhaLeadId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feitaTaskId, setFeitaTaskId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [descartarTaskId, setDescartarTaskId] = useState<string | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState("");

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["campanha-lead-tasks", campanhaLeadId],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("campanha_lead_tasks" as any)
        .select("*")
        .eq("campanha_lead_id", campanhaLeadId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data as unknown as Task[]) ?? [];
    },
  });

  const marcarFeita = useMutation({
    mutationFn: async ({ taskId, obs }: { taskId: string; obs: string }) => {
      const { error } = await supabase
        .from("campanha_lead_tasks" as any)
        .update({
          status: "feita",
          feita_em: new Date().toISOString(),
          feita_por: user?.id,
          observacao: obs.trim() || null,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task marcada como feita");
      queryClient.invalidateQueries({ queryKey: ["campanha-lead-tasks", campanhaLeadId] });
      setFeitaTaskId(null);
      setObservacao("");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao marcar task"),
  });

  const snooze = useMutation({
    mutationFn: async ({ taskId, ate }: { taskId: string; ate: Date }) => {
      const novoPrazo = ate.toISOString();
      const { error } = await supabase
        .from("campanha_lead_tasks" as any)
        .update({ status: "snooze", snooze_ate: novoPrazo, prazo_at: novoPrazo })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Adiada para ${format(vars.ate, "dd/MM 'às' HH'h'", { locale: ptBR })}`);
      queryClient.invalidateQueries({ queryKey: ["campanha-lead-tasks", campanhaLeadId] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao adiar"),
  });

  const descartar = useMutation({
    mutationFn: async ({ taskId, motivo }: { taskId: string; motivo: string }) => {
      const { error } = await supabase
        .from("campanha_lead_tasks" as any)
        .update({
          status: "descartada",
          descarte_motivo: motivo.trim() || "Sem motivo informado",
          feita_em: new Date().toISOString(),
          feita_por: user?.id,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task descartada");
      queryClient.invalidateQueries({ queryKey: ["campanha-lead-tasks", campanhaLeadId] });
      setDescartarTaskId(null);
      setMotivoDescarte("");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao descartar"),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando tasks...</div>;
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sem tasks pra este lead.</p>
        <p className="text-xs mt-1">
          Tasks são geradas automaticamente quando lead entra em campanha manual.
        </p>
      </div>
    );
  }

  const pendentes = tasks.filter((t) => t.status === "pendente" || t.status === "snooze").length;
  const feitas = tasks.filter((t) => t.status === "feita").length;
  const descartadas = tasks.filter((t) => t.status === "descartada").length;

  return (
    <>
      <div className="p-5 space-y-4">
        {/* Resumo */}
        <div className="flex items-center gap-3 text-xs">
          <Badge variant="outline" className="gap-1.5">
            <Clock className="h-3 w-3" />
            {pendentes} pendentes
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            {feitas} feitas
          </Badge>
          {descartadas > 0 && (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <X className="h-3 w-3" />
              {descartadas} descartadas
            </Badge>
          )}
        </div>

        {/* Lista de tasks */}
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onMarcarFeita={() => setFeitaTaskId(task.id)}
              onSnooze={(ate) => snooze.mutate({ taskId: task.id, ate })}
              onDescartar={() => setDescartarTaskId(task.id)}
            />
          ))}
        </div>
      </div>

      {/* Dialog: marcar feita com observação */}
      <AlertDialog open={!!feitaTaskId} onOpenChange={(open) => !open && setFeitaTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar task como feita</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Adicione uma observação curta sobre o que aconteceu (opcional).
                </p>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: respondeu, marcou pra segunda; ou: caiu na caixa postal"
                  rows={3}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setObservacao("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => feitaTaskId && marcarFeita.mutate({ taskId: feitaTaskId, obs: observacao })}
              disabled={marcarFeita.isPending}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: descartar com motivo */}
      <AlertDialog open={!!descartarTaskId} onOpenChange={(open) => !open && setDescartarTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar task?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Use quando o lead não responde mais ou não vale a pena seguir. Informe o motivo:
                </p>
                <Textarea
                  value={motivoDescarte}
                  onChange={(e) => setMotivoDescarte(e.target.value)}
                  placeholder="Ex: bloqueou no whatsapp; ou: número errado"
                  rows={3}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivoDescarte("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => descartarTaskId && descartar.mutate({ taskId: descartarTaskId, motivo: motivoDescarte })}
              disabled={descartar.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface TaskRowProps {
  task: Task;
  onMarcarFeita: () => void;
  onSnooze: (ate: Date) => void;
  onDescartar: () => void;
}

function TaskRow({ task, onMarcarFeita, onSnooze, onDescartar }: TaskRowProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const meta = TIPO_META[task.tipo];
  const Icon = meta.icon;
  const prazo = new Date(task.prazo_at);
  const isHoje = isToday(prazo);
  const isAtrasada = isPast(prazo) && !isHoje && task.status === "pendente";
  const isFeita = task.status === "feita";
  const isDescartada = task.status === "descartada";

  const corStatus = isFeita
    ? "border-emerald-200 bg-emerald-50/40"
    : isDescartada
      ? "border-muted bg-muted/30 opacity-60"
      : isAtrasada
        ? "border-red-300 bg-red-50/40"
        : isHoje
          ? "border-amber-300 bg-amber-50/40"
          : "border-border bg-card";

  return (
    <div
      className={cn(
        "border rounded-md p-3 flex items-start gap-3 transition-colors",
        corStatus
      )}
    >
      <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", meta.color, (isFeita || isDescartada) && "opacity-50")} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn(isFeita && "line-through text-muted-foreground")}>{meta.label}</span>
          {task.status === "snooze" && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
              <Clock className="h-2.5 w-2.5" />
              adiada
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground mt-0.5">
          {isFeita && task.feita_em && (
            <>
              ✓ feita {format(new Date(task.feita_em), "dd/MM HH:mm", { locale: ptBR })}
              {task.observacao && <span className="block mt-1 italic">"{task.observacao}"</span>}
            </>
          )}
          {isDescartada && (
            <>
              descartada
              {task.descarte_motivo && <span className="block mt-1 italic">"{task.descarte_motivo}"</span>}
            </>
          )}
          {!isFeita && !isDescartada && (
            <>
              prazo {format(prazo, "dd/MM HH:mm", { locale: ptBR })}
              {isAtrasada && <span className="text-red-600 font-medium ml-1">· ATRASADA</span>}
              {isHoje && <span className="text-amber-700 font-medium ml-1">· HOJE</span>}
            </>
          )}
        </div>
      </div>

      {!isFeita && !isDescartada && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={onMarcarFeita}
            title="Marcar feita"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Feita</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Mais ações">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {SNOOZE_OPCOES.map((op) => (
                <DropdownMenuItem
                  key={op.horas}
                  onClick={() =>
                    onSnooze(new Date(Date.now() + op.horas * 60 * 60 * 1000))
                  }
                >
                  <Clock className="h-3.5 w-3.5 mr-2" />
                  Adiar {op.label}
                </DropdownMenuItem>
              ))}
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setDatePickerOpen(true);
                    }}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    Escolher data...
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={undefined}
                    onSelect={(date) => {
                      if (date) {
                        const d = new Date(date);
                        d.setHours(9, 0, 0, 0); // adiar pra 9h da manhã
                        onSnooze(d);
                        setDatePickerOpen(false);
                      }
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDescartar} className="text-destructive focus:text-destructive">
                <X className="h-3.5 w-3.5 mr-2" />
                Descartar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
