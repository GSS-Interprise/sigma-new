import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Check, CheckCheck, ExternalLink, Filter } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

/**
 * Página dedicada de notificações. Sino do header só mostra as últimas — aqui
 * a operadora vê tudo, filtra por tipo, marca múltiplas como lidas em massa.
 */

interface Notificacao {
  id: string;
  user_id: string;
  tipo: string | null;
  titulo: string | null;
  mensagem: string | null;
  link: string | null;
  referencia_id: string | null;
  lida: boolean;
  created_at: string;
}

type FiltroLida = "todas" | "nao_lidas" | "lidas";

const TIPO_LABEL: Record<string, string> = {
  task_atrasada: "Task atrasada",
  suporte_novo_ticket: "Novo ticket de suporte",
  suporte_resposta: "Resposta no ticket",
  kanban_atribuido: "Atribuição Kanban",
  lead_quente: "Lead quente",
};

export default function Notificacoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filtroLida, setFiltroLida] = useState<FiltroLida>("todas");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: notificacoes = [], isLoading } = useQuery<Notificacao[]>({
    queryKey: ["notificacoes-pagina", user?.id, filtroLida, filtroTipo],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("system_notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filtroLida === "lidas") q = q.eq("lida", true);
      if (filtroLida === "nao_lidas") q = q.eq("lida", false);
      if (filtroTipo !== "todos") q = q.eq("tipo", filtroTipo);
      const { data } = await q;
      return (data || []) as Notificacao[];
    },
    refetchInterval: 60_000,
  });

  // Tipos disponíveis baseado no dataset atual (pra dropdown)
  const tiposDisponiveis = useMemo(() => {
    const set = new Set<string>();
    notificacoes.forEach((n) => n.tipo && set.add(n.tipo));
    return Array.from(set).sort();
  }, [notificacoes]);

  const naoLidasCount = useMemo(
    () => notificacoes.filter((n) => !n.lida).length,
    [notificacoes],
  );

  const marcarUmaLida = async (id: string) => {
    await supabase.from("system_notifications").update({ lida: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notificacoes-pagina"] });
    queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
  };

  const marcarTodasLidas = async () => {
    if (!user?.id) return;
    const ids = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("system_notifications").update({ lida: true }).in("id", ids);
    queryClient.invalidateQueries({ queryKey: ["notificacoes-pagina"] });
    queryClient.invalidateQueries({ queryKey: ["notificacoes-sistema"] });
    toast.success(`${ids.length} notificação(ões) marcadas como lida`);
  };

  const clickNotif = async (n: Notificacao) => {
    if (!n.lida) await marcarUmaLida(n.id);
    if (n.link) {
      const target =
        n.tipo?.startsWith("suporte_") && n.referencia_id
          ? `${n.link}?ticket=${n.referencia_id}`
          : n.link;
      navigate(target);
    }
  };

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Bell className="h-6 w-6" />
        Notificações
      </h1>
      <p className="text-sm text-muted-foreground">
        Histórico completo das notificações que chegaram pra você
      </p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4">
        {/* Filtros */}
        <Card className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
                Status
              </label>
              <Select value={filtroLida} onValueChange={(v) => setFiltroLida(v as FiltroLida)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="nao_lidas">Apenas não lidas</SelectItem>
                  <SelectItem value="lidas">Apenas lidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
                Tipo
              </label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tiposDisponiveis.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-2">
              {naoLidasCount > 0 && (
                <Button variant="outline" size="sm" onClick={marcarTodasLidas}>
                  <CheckCheck className="h-4 w-4 mr-1.5" />
                  Marcar todas como lidas
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Lista */}
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/30 text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {isLoading
                ? "Carregando..."
                : `${notificacoes.length} notificação(ões) — ${naoLidasCount} não lida(s)`}
            </span>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma notificação com esses filtros</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notificacoes.map((n) => {
                const hora = format(new Date(n.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
                const rel = formatDistanceToNow(new Date(n.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                });
                return (
                  <li
                    key={n.id}
                    className={`p-4 hover:bg-muted/40 transition-colors cursor-pointer flex items-start gap-3 ${
                      !n.lida ? "bg-primary/5 border-l-4 border-l-primary" : ""
                    }`}
                    onClick={() => clickNotif(n)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-sm truncate ${
                            !n.lida ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {n.titulo || "(sem título)"}
                        </p>
                        {n.tipo && (
                          <Badge variant="outline" className="text-[10px]">
                            {TIPO_LABEL[n.tipo] ?? n.tipo}
                          </Badge>
                        )}
                        {!n.lida && (
                          <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />
                        )}
                      </div>
                      {n.mensagem && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {n.mensagem}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {rel} · {hora}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.lida && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            marcarUmaLida(n.id);
                          }}
                          title="Marcar como lida"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {n.link && (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
