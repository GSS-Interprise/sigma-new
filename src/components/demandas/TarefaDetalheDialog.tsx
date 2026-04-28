import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, MessageSquare, Activity, Paperclip, Link as LinkIcon, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDemandaAtividades, useDemandaComentarios, useDemandaDetalhe } from "@/hooks/useDemandas";
import { URGENCIA_LABEL } from "@/lib/setoresAccess";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { toast } from "sonner";

interface Props {
  tarefaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function TarefaDetalheDialog({ tarefaId, open, onOpenChange }: Props) {
  const tarefaIdValido = !!tarefaId && UUID_RE.test(tarefaId);
  const queryId = open && tarefaIdValido ? tarefaId : null;
  const { data: tarefa, isLoading } = useDemandaDetalhe(queryId);
  const { data: comentarios = [] } = useDemandaComentarios(queryId);
  const { data: atividades = [] } = useDemandaAtividades(queryId);
  const tarefaCorreta = !!tarefa && tarefa.id === tarefaId;

  if (open && tarefaId && !tarefaIdValido) {
    toast.error("Demanda inválida. Abra o card novamente.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[59rem] max-h-[92vh] overflow-hidden p-0">
        <DialogHeader>
          <div className="px-5 pt-5 pr-12">
            <DialogTitle>{tarefaCorreta ? tarefa.titulo : "Detalhe da demanda"}</DialogTitle>
            <DialogDescription>Comentários, atividades e contexto da tarefa.</DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-5.5rem)] overflow-hidden border-t lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ScrollArea className="min-h-[28rem] p-5">
            {(isLoading || (tarefa && !tarefaCorreta)) && <div className="text-sm text-muted-foreground">Carregando demanda correta…</div>}
            {!isLoading && tarefaIdValido && !tarefa && <div className="text-sm text-muted-foreground">Demanda não encontrada ou sem permissão de acesso.</div>}
            {tarefaCorreta && (
              <div className="space-y-4 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{URGENCIA_LABEL[tarefa.urgencia] ?? tarefa.urgencia}</Badge>
                  <Badge variant="secondary">{tarefa.status}</Badge>
                  {tarefa.data_limite && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" /> {format(new Date(tarefa.data_limite), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>

                {tarefa.descricao ? (
                  <div className="prose prose-sm max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(tarefa.descricao) }} />
                ) : (
                  <p className="text-sm text-muted-foreground">Sem descrição.</p>
                )}

                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Pessoas
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tarefa.responsavel_nome && <Badge variant="secondary">Responsável: {tarefa.responsavel_nome}</Badge>}
                    {(tarefa.mencionados ?? []).map((m) => <Badge key={m.user_id} variant="outline">{m.nome ?? "Pessoa marcada"}</Badge>)}
                    {!tarefa.responsavel_nome && !(tarefa.mencionados ?? []).length && <span className="text-xs text-muted-foreground">Nenhuma pessoa marcada.</span>}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          <aside className="min-h-0 border-t bg-muted/20 lg:border-l lg:border-t-0">
            <Tabs defaultValue="comentarios" className="flex h-full min-h-[28rem] flex-col">
              <TabsList className="m-3 grid h-9 grid-cols-2">
                <TabsTrigger value="comentarios" className="gap-1 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Comentários</TabsTrigger>
                <TabsTrigger value="atividades" className="gap-1 text-xs"><Activity className="h-3.5 w-3.5" /> Atividades</TabsTrigger>
              </TabsList>

              <TabsContent value="comentarios" className="mt-0 flex-1 overflow-hidden px-3 pb-3">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    {comentarios.length === 0 && <p className="text-xs text-muted-foreground">Sem comentários ainda.</p>}
                    {comentarios.map((c) => (
                      <div key={c.id} className="rounded-md border bg-background p-3 text-sm shadow-sm">
                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(c.autor_nome)}</AvatarFallback></Avatar>
                          <span>{c.autor_nome ?? "Usuário"}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">{c.conteudo}</p>
                        {!!c.links?.length && <div className="mt-2 space-y-1">{c.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><LinkIcon className="h-3 w-3" />{l.titulo || l.url}</a>)}</div>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="atividades" className="mt-0 flex-1 overflow-hidden px-3 pb-3">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    {atividades.length === 0 && <p className="text-xs text-muted-foreground">Sem atividades registradas.</p>}
                    {atividades.map((a) => <div key={a.id} className="rounded-md border bg-background p-3 text-xs shadow-sm"><div className="font-medium">{a.resumo}</div><div className="mt-1 text-muted-foreground">{a.autor_nome ?? "Usuário"} · {format(new Date(a.created_at), "dd/MM HH:mm")}</div></div>)}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}