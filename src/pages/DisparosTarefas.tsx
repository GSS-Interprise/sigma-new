import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListTodo, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useTarefasCaptacao, useAtualizarTarefa } from "@/hooks/useTarefasCaptacao";

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  aberta: "outline",
  em_andamento: "secondary",
  concluida: "default",
  cancelada: "destructive",
};

const PRIO_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  baixa: "outline",
  media: "secondary",
  alta: "default",
  urgente: "destructive",
};

export default function DisparosTarefas() {
  const [statusFiltro, setStatusFiltro] = useState<string>("aberta");
  const [canalFiltro, setCanalFiltro] = useState<string>("todos");

  const { data: tarefas = [], isLoading } = useTarefasCaptacao({
    status: statusFiltro === "todos" ? undefined : ([statusFiltro as any]),
    canal: canalFiltro === "todos" ? undefined : [canalFiltro],
  });

  const atualizar = useAtualizarTarefa();

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ListTodo className="h-6 w-6" />
        Tarefas e Solicitações
      </h1>
      <p className="text-sm text-muted-foreground">
        Leads abertos, follow-ups e gatilhos por canal
      </p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute>
      <AppLayout headerActions={headerActions}>
        <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={canalFiltro} onValueChange={setCanalFiltro}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos canais</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
          ) : tarefas.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma tarefa encontrada com esses filtros.
            </Card>
          ) : (
            <div className="grid gap-3">
              {tarefas.map((t: any) => {
                const vencida =
                  t.prazo && new Date(t.prazo) < new Date() && t.status !== "concluida";
                return (
                  <Card key={t.id} className={vencida ? "border-destructive" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-medium">{t.titulo}</h3>
                            <Badge variant={STATUS_VARIANTS[t.status]}>
                              {STATUS_LABELS[t.status]}
                            </Badge>
                            <Badge variant={PRIO_VARIANTS[t.prioridade]}>
                              {t.prioridade}
                            </Badge>
                            {t.canal && <Badge variant="outline">{t.canal}</Badge>}
                            {vencida && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Vencida
                              </Badge>
                            )}
                          </div>
                          {t.descricao && (
                            <p className="text-sm text-muted-foreground mb-2">{t.descricao}</p>
                          )}
                          <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                            {t.lead?.nome && <span>Lead: {t.lead.nome}</span>}
                            {t.responsavel_nome && <span>Resp.: {t.responsavel_nome}</span>}
                            {t.prazo && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(t.prazo).toLocaleString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </div>
                        {t.status !== "concluida" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              atualizar.mutate({ id: t.id, status: "concluida" })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Concluir
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
