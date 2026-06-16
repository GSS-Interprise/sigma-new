import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ListTodo, Loader2, CheckCircle2, Clock, AlertTriangle, CalendarDays,
  MessageCircle, Phone, Instagram, Mail, Megaphone,
} from "lucide-react";

const CANAL = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  ligacao: { label: "Ligação", icon: Phone },
  instagram: { label: "Instagram", icon: Instagram },
  email: { label: "E-mail", icon: Mail },
} as Record<string, { label: string; icon: any }>;

const FILTROS = [
  { key: "hoje", label: "Hoje", situacoes: ["hoje"] },
  { key: "atrasadas", label: "Atrasadas", situacoes: ["atrasada"] },
  { key: "pendentes", label: "Hoje + Atrasadas", situacoes: ["hoje", "atrasada"] },
  { key: "proximas", label: "Próximas", situacoes: ["futura"] },
];

type Task = {
  task_id: string; campanha_id: string; campanha_nome: string; lead_id: string;
  lead_nome: string | null; lead_phone: string | null; tipo: string;
  prazo_at: string | null; situacao: string;
};

export default function MinhasTarefas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filtro, setFiltro] = useState("pendentes");
  const [campanha, setCampanha] = useState("__all");

  const situacoes = FILTROS.find((f) => f.key === filtro)!.situacoes;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["central-tarefas", filtro],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_campanha_tasks_dashboard")
        .select("task_id, campanha_id, campanha_nome, lead_id, lead_nome, lead_phone, tipo, prazo_at, situacao")
        .in("situacao", situacoes)
        .order("prazo_at", { ascending: true, nullsFirst: true })
        .range(0, 599);
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const campanhas = useMemo(
    () => [...new Set(tasks.map((t) => t.campanha_nome).filter(Boolean))].sort(),
    [tasks],
  );
  const lista = campanha === "__all" ? tasks : tasks.filter((t) => t.campanha_nome === campanha);

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
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const porCampanha = useMemo(() => {
    const m = new Map<string, Task[]>();
    lista.forEach((t) => {
      const k = t.campanha_nome || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    });
    return [...m.entries()];
  }, [lista]);

  return (
    <AppLayout
      headerActions={
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListTodo className="h-6 w-6" /> Central de Tarefas</h1>
          <p className="text-sm text-muted-foreground">O que precisa ser feito hoje, em todas as campanhas</p>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <Button key={f.key} size="sm" variant={filtro === f.key ? "default" : "outline"} onClick={() => setFiltro(f.key)}>{f.label}</Button>
          ))}
          <Select value={campanha} onValueChange={setCampanha}>
            <SelectTrigger className="w-[220px] ml-auto"><SelectValue placeholder="Campanha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as campanhas</SelectItem>
              {campanhas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : lista.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Nenhuma tarefa {filtro === "atrasadas" ? "atrasada" : "pendente"} por aqui. 🎉
          </CardContent></Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">{lista.length} tarefa(s){lista.length >= 600 ? " (mostrando as 600 mais urgentes)" : ""}</div>
            {porCampanha.map(([nome, ts]) => (
              <Card key={nome}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{nome}</span>
                    <Badge variant="secondary" className="text-xs">{ts.length}</Badge>
                  </div>
                  <div className="divide-y">
                    {ts.map((t) => {
                      const canal = CANAL[t.tipo] || { label: t.tipo, icon: MessageCircle };
                      const Icon = canal.icon;
                      const atrasada = t.situacao === "atrasada";
                      return (
                        <div key={t.task_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className={`shrink-0 ${atrasada ? "text-red-500" : "text-muted-foreground"}`}>
                            {atrasada ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{t.lead_nome || t.lead_phone || "Lead"}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{canal.label}</span>
                              {t.prazo_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(t.prazo_at).toLocaleDateString("pt-BR")}</span>}
                              {atrasada && <span className="text-red-600">atrasada</span>}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => marcarFeita.mutate(t.task_id)} disabled={marcarFeita.isPending}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Feita
                          </Button>
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
    </AppLayout>
  );
}
