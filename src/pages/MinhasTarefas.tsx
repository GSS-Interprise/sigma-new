import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { LeadProfile360Modal } from "@/components/medicos/LeadProfile360Modal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ListTodo, Loader2, CheckCircle2, Clock, AlertTriangle, CalendarDays,
  MessageCircle, Phone, Instagram, Mail, Megaphone, UserRound, UsersRound,
  UserX, ExternalLink,
  Gauge, TimerOff, Inbox, Layers3,
  UserPlus, BarChart3,
} from "lucide-react";

const CANAL = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  ligacao: { label: "Ligação", icon: Phone },
  instagram: { label: "Instagram", icon: Instagram },
  email: { label: "E-mail", icon: Mail },
} as Record<string, { label: string; icon: typeof MessageCircle }>;

const FILTROS = [
  { key: "hoje", label: "Hoje", situacoes: ["hoje"] },
  { key: "atrasadas", label: "Atrasadas", situacoes: ["atrasada"] },
  { key: "pendentes", label: "Hoje + atrasadas", situacoes: ["hoje", "atrasada"] },
  { key: "proximas", label: "Próximas", situacoes: ["futura"] },
] as const;

type Escopo = "minhas" | "equipe" | "sem_responsavel";
type VisaoCapacidade = "priorizada" | "completa";

type Task = {
  task_id: string;
  campanha_id: string;
  campanha_nome: string;
  campanha_lead_id: string;
  lead_id: string;
  lead_nome: string | null;
  lead_phone: string | null;
  tipo: string;
  rotulo: string | null;
  prazo_at: string | null;
  situacao: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  passos_restantes: number;
  prioridade_operacional: "urgente" | "alta" | "normal";
  fila_posicao: number;
  horas_atraso: number;
  sla_status: "no_prazo" | "atencao" | "vencido";
};

type CapacityRow = {
  responsavel_id: string | null;
  responsavel_nome: string;
  fila_total: number;
  fila_priorizada: number;
  sla_vencido: number;
  urgentes: number;
  alertas_coordenacao: number;
  concluidas_hoje: number;
};

export default function MinhasTarefas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["key"]>("pendentes");
  // O legado ainda possui campanhas sem dono. "Equipe" preserva a visibilidade
  // operacional enquanto a configuração de responsáveis é regularizada.
  const [escopo, setEscopo] = useState<Escopo>("equipe");
  const [visaoCapacidade, setVisaoCapacidade] = useState<VisaoCapacidade>("priorizada");
  const [campanha, setCampanha] = useState("__all");
  const [leadAberto, setLeadAberto] = useState<string | null>(null);

  const situacoes = FILTROS.find((item) => item.key === filtro)?.situacoes ?? ["hoje", "atrasada"];

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["central-tarefas", filtro, escopo, visaoCapacidade, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = (supabase as any)
        .from("vw_campanha_tasks_operacional")
        .select("task_id, campanha_id, campanha_nome, campanha_lead_id, lead_id, lead_nome, lead_phone, tipo, rotulo, prazo_at, situacao:situacao_operacional, responsavel_id, responsavel_nome, passos_restantes, prioridade_operacional, fila_posicao, horas_atraso, sla_status")
        .eq("is_next_action", true)
        .in("situacao", situacoes)
        .order("fila_posicao", { ascending: true, nullsFirst: false })
        .range(0, 599);

      if (visaoCapacidade === "priorizada") query = query.eq("dentro_capacidade_diaria", true);
      if (escopo === "minhas") query = query.eq("responsavel_id", user!.id);
      if (escopo === "sem_responsavel") query = query.is("responsavel_id", null);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const { data: metricas } = useQuery({
    queryKey: ["central-tarefas-metricas", escopo, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const contar = async (ajustar?: (query: any) => any) => {
        let query = (supabase as any)
          .from("vw_campanha_tasks_operacional")
          .select("task_id", { count: "exact", head: true })
          .eq("is_next_action", true);
        if (escopo === "minhas") query = query.eq("responsavel_id", user!.id);
        if (escopo === "sem_responsavel") query = query.is("responsavel_id", null);
        if (ajustar) query = ajustar(query);
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      };

      const [total, priorizadas, vencidas, urgentes] = await Promise.all([
        contar(),
        contar((query) => query.eq("dentro_capacidade_diaria", true)),
        contar((query) => query.eq("situacao_operacional", "atrasada")),
        contar((query) => query.eq("prioridade_operacional", "urgente")),
      ]);
      return { total, priorizadas, excedentes: Math.max(0, total - priorizadas), vencidas, urgentes };
    },
  });

  const { data: capacidadeEquipe = [] } = useQuery({
    queryKey: ["crm-capacidade-equipe"],
    enabled: escopo === "equipe",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_crm_task_capacity_by_owner")
        .select("responsavel_id, responsavel_nome, fila_total, fila_priorizada, sla_vencido, urgentes, alertas_coordenacao, concluidas_hoje")
        .order("alertas_coordenacao", { ascending: false })
        .order("fila_total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CapacityRow[];
    },
  });

  // Uma tarefa pode ser concluída no card, na campanha ou por uma automação.
  // O Realtime mantém todas essas entradas coerentes sem exigir F5 da operação.
  useEffect(() => {
    const channel = supabase
      .channel(`central-tarefas-${user?.id ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campanha_lead_tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["central-tarefas"] });
          qc.invalidateQueries({ queryKey: ["central-tarefas-metricas"] });
          qc.invalidateQueries({ queryKey: ["crm-capacidade-equipe"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user?.id]);

  const campanhas = useMemo(
    () => [...new Set(tasks.map((task) => task.campanha_nome).filter(Boolean))].sort(),
    [tasks],
  );

  useEffect(() => {
    if (campanha !== "__all" && !campanhas.includes(campanha)) setCampanha("__all");
  }, [campanha, campanhas]);

  const lista = campanha === "__all" ? tasks : tasks.filter((task) => task.campanha_nome === campanha);
  const semResponsavel = tasks.filter((task) => !task.responsavel_id).length;

  const marcarFeita = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await (supabase as any)
        .from("campanha_lead_tasks")
        .update({ status: "feita", feita_em: new Date().toISOString(), feita_por: user?.id })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["central-tarefas"] });
      qc.invalidateQueries({ queryKey: ["central-tarefas-metricas"] });
      qc.invalidateQueries({ queryKey: ["crm-capacidade-equipe"] });
      qc.invalidateQueries({ queryKey: ["campanha-lead-tasks"] });
    },
    onError: (error: Error) => toast.error(`Não foi possível concluir: ${error.message}`),
  });

  const assumirProxima = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("crm_assumir_proxima_acao");
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível assumir a próxima ação");
      return data as { lead_id: string };
    },
    onSuccess: (data) => {
      toast.success("Lead assumido e IA pausada");
      qc.invalidateQueries({ queryKey: ["central-tarefas"] });
      qc.invalidateQueries({ queryKey: ["central-tarefas-metricas"] });
      qc.invalidateQueries({ queryKey: ["crm-capacidade-equipe"] });
      setLeadAberto(data.lead_id);
    },
    onError: (error: Error) => {
      const mensagens: Record<string, string> = {
        fila_vazia: "A fila da equipe está vazia.",
        capacidade_atingida: "Você já atingiu a capacidade de 60 ações.",
      };
      toast.error(mensagens[error.message] || error.message);
    },
  });

  const porCampanha = useMemo(() => {
    const mapa = new Map<string, Task[]>();
    lista.forEach((task) => {
      const chave = task.campanha_nome || "Sem campanha";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(task);
    });
    return [...mapa.entries()];
  }, [lista]);

  return (
    <AppLayout
      headerActions={
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <ListTodo className="h-6 w-6" /> Central de tarefas
          </h1>
          <p className="text-sm text-muted-foreground">Uma próxima ação por lead · até 60 ações por responsável</p>
        </div>
      }
    >
      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Fila priorizada", valor: metricas?.priorizadas ?? 0, Icon: Gauge, cor: "text-emerald-600" },
            { label: "Backlog excedente", valor: metricas?.excedentes ?? 0, Icon: Layers3, cor: "text-amber-600" },
            { label: "SLA vencido", valor: metricas?.vencidas ?? 0, Icon: TimerOff, cor: "text-red-600" },
            { label: "Leads urgentes", valor: metricas?.urgentes ?? 0, Icon: Inbox, cor: "text-primary" },
          ].map(({ label, valor, Icon, cor }) => (
            <Card key={label}>
              <CardContent className="flex min-h-20 items-center gap-3 p-3 sm:p-4">
                <Icon className={`h-5 w-5 shrink-0 ${cor}`} />
                <div className="min-w-0">
                  <div className="text-xl font-bold tabular-nums">{valor}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            {([
              ["minhas", "Minhas", UserRound],
              ["equipe", "Equipe", UsersRound],
              ["sem_responsavel", "Fila da equipe", UserX],
            ] as const).map(([key, label, Icon]) => (
              <Button
                key={key}
                size="sm"
                variant={escopo === key ? "default" : "outline"}
                className="min-h-11 shrink-0"
                onClick={() => setEscopo(key)}
              >
                <Icon className="mr-1.5 h-4 w-4" /> {label}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:justify-center lg:pb-0">
            {FILTROS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filtro === item.key ? "secondary" : "ghost"}
                className="min-h-11 shrink-0"
                onClick={() => setFiltro(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <Select value={campanha} onValueChange={setCampanha}>
            <SelectTrigger className="min-h-11 w-full lg:w-[240px]">
              <SelectValue placeholder="Campanha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as campanhas</SelectItem>
              {campanhas.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant={visaoCapacidade === "priorizada" ? "default" : "outline"}
            className="min-h-11 shrink-0"
            onClick={() => setVisaoCapacidade("priorizada")}
          >
            Fila priorizada (até 60)
          </Button>
          <Button
            size="sm"
            variant={visaoCapacidade === "completa" ? "default" : "outline"}
            className="min-h-11 shrink-0"
            onClick={() => setVisaoCapacidade("completa")}
          >
            Ver backlog completo
          </Button>
          <Button
            size="sm"
            className="min-h-11 shrink-0 sm:ml-auto"
            onClick={() => assumirProxima.mutate()}
            disabled={assumirProxima.isPending}
          >
            {assumirProxima.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
            Assumir próxima ação
          </Button>
        </div>

        {escopo === "equipe" && capacidadeEquipe.length > 0 && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Capacidade por operadora</h2>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {capacidadeEquipe.map((pessoa) => (
                  <div key={pessoa.responsavel_id ?? "equipe"} className="min-w-[210px] rounded-lg border p-3">
                    <div className="truncate text-sm font-medium">{pessoa.responsavel_nome}</div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Fila</span><span className="text-right font-medium">{pessoa.fila_priorizada}/{pessoa.fila_total}</span>
                      <span className="text-muted-foreground">Concluídas hoje</span><span className="text-right font-medium">{pessoa.concluidas_hoje}</span>
                      <span className="text-muted-foreground">Urgentes</span><span className="text-right font-medium">{pessoa.urgentes}</span>
                      <span className="text-muted-foreground">Alertas</span>
                      <span className={`text-right font-medium ${pessoa.alertas_coordenacao > 0 ? "text-red-600" : ""}`}>{pessoa.alertas_coordenacao}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {escopo === "equipe" && semResponsavel > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {semResponsavel} próxima(s) ação(ões) estão na fila da equipe.
              Ao assumir o lead, a responsabilidade passa automaticamente para a operadora.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : lista.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
              Nenhuma tarefa nesse recorte.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {lista.length} próxima(s) ação(ões) priorizadas
            </div>
            {porCampanha.map(([nome, itens]) => (
              <Card key={nome}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5 sm:px-4">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</span>
                    <Badge variant="secondary" className="text-xs">{itens.length}</Badge>
                  </div>
                  <div className="divide-y">
                    {itens.map((task) => {
                      const canal = CANAL[task.tipo] || { label: task.tipo, icon: MessageCircle };
                      const Icon = canal.icon;
                      const atrasada = task.situacao === "atrasada";
                      return (
                        <div key={task.task_id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className={`mt-1 shrink-0 ${atrasada ? "text-red-500" : "text-muted-foreground"}`}>
                              {atrasada ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                className="block max-w-full truncate text-left font-medium hover:underline"
                                onClick={() => setLeadAberto(task.lead_id)}
                              >
                                {task.lead_nome || task.lead_phone || "Lead"}
                              </button>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {task.prioridade_operacional !== "normal" && (
                                  <Badge variant={task.prioridade_operacional === "urgente" ? "destructive" : "secondary"} className="h-5 text-[10px]">
                                    {task.prioridade_operacional === "urgente" ? "Urgente" : "Alta prioridade"}
                                  </Badge>
                                )}
                                <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{task.rotulo || canal.label}</span>
                                {task.prazo_at && (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {new Date(task.prazo_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                                  </span>
                                )}
                                {task.responsavel_nome && (
                                  <span className="inline-flex items-center gap-1">
                                    <UserRound className="h-3 w-3" />{task.responsavel_nome}
                                  </span>
                                )}
                                {task.passos_restantes > 1 && <span>{task.passos_restantes - 1} etapa(s) depois desta</span>}
                                {atrasada && (
                                  <span className="font-medium text-red-600">
                                    SLA vencido há {task.horas_atraso < 24 ? `${task.horas_atraso}h` : `${Math.floor(task.horas_atraso / 24)}d`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => setLeadAberto(task.lead_id)}
                            >
                              <ExternalLink className="mr-1 h-4 w-4" /> Abrir lead
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => marcarFeita.mutate(task.task_id)}
                              disabled={marcarFeita.isPending}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" /> Feita
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      <LeadProfile360Modal
        open={!!leadAberto}
        onOpenChange={(open) => !open && setLeadAberto(null)}
        leadId={leadAberto}
      />
    </AppLayout>
  );
}
