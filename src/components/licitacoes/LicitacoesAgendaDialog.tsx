import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Gavel, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotuloTarefa, urgenciaTarefa } from "@/lib/licitacaoTarefas";

/**
 * Agenda da equipe de licitações (T5): disputas e tarefas dos próximos dias, por dia, com as
 * atrasadas no topo. Pedido da Denise na reunião de 07/10 ("o que vai acontecer na semana").
 * Só o quadro da GSS; clicar abre o card.
 */
type Item = { id: string; licitacaoId: string; quando: string; tipo: "disputa" | "tarefa"; titulo: string; card: string; responsavelId: string | null; responsavel?: string };

export function LicitacoesAgendaDialog({ open, onOpenChange, onAbrir }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAbrir: (licitacaoId: string) => void;
}) {
  const { user } = useAuth();
  const [dias, setDias] = useState(7);
  const [soMinhas, setSoMinhas] = useState(false);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["licitacoes-agenda", dias],
    enabled: open,
    queryFn: async () => {
      const ini = new Date(); ini.setHours(0, 0, 0, 0);
      const fim = new Date(ini.getTime() + dias * 864e5).toISOString();
      const [{ data: tarefas }, { data: disputas }] = await Promise.all([
        (supabase as any).from("licitacao_tarefas")
          .select("id, licitacao_id, tipo, titulo, data_hora, responsavel_id, created_by, licitacoes!inner(titulo, numero_edital, empresa, responsavel_id)")
          .is("concluida_em", null).lt("data_hora", fim).order("data_hora").limit(500),
        (supabase as any).from("licitacoes")
          .select("id, titulo, numero_edital, data_disputa, responsavel_id")
          .eq("board", "effecti").eq("empresa", "GSS").is("arquivado_em", null)
          .gte("data_disputa", ini.toISOString()).lt("data_disputa", fim).order("data_disputa").limit(500),
      ]);
      const ids = [...new Set([...(tarefas ?? []).map((t: any) => t.responsavel_id ?? t.created_by), ...(disputas ?? []).map((d: any) => d.responsavel_id)].filter(Boolean))];
      const { data: perfis } = ids.length ? await supabase.from("profiles").select("id, nome_completo").in("id", ids) : { data: [] as any[] };
      const nome = (id: string | null) => (perfis ?? []).find((p: any) => p.id === id)?.nome_completo?.split(" ").slice(0, 2).join(" ");
      const lista: Item[] = [
        ...(tarefas ?? []).filter((t: any) => t.licitacoes?.empresa !== "AGES").map((t: any) => ({
          id: t.id, licitacaoId: t.licitacao_id, quando: t.data_hora, tipo: "tarefa" as const, titulo: rotuloTarefa(t),
          card: t.licitacoes?.titulo || t.licitacoes?.numero_edital || "Edital",
          responsavelId: t.responsavel_id ?? t.created_by, responsavel: nome(t.responsavel_id ?? t.created_by),
        })),
        ...(disputas ?? []).map((d: any) => ({
          id: `d-${d.id}`, licitacaoId: d.id, quando: d.data_disputa, tipo: "disputa" as const, titulo: "Disputa",
          card: d.titulo || d.numero_edital || "Edital", responsavelId: d.responsavel_id, responsavel: nome(d.responsavel_id),
        })),
      ];
      return lista.sort((a, b) => a.quando.localeCompare(b.quando));
    },
  });

  const grupos = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const vis = soMinhas ? itens.filter((i) => i.responsavelId === user?.id) : itens;
    const m = new Map<string, Item[]>();
    for (const i of vis) {
      const d = new Date(i.quando);
      const chave = d < hoje ? "Atrasadas" : d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
      if (!m.has(chave)) m.set(chave, []);
      m.get(chave)!.push(i);
    }
    return [...m.entries()];
  }, [itens, soMinhas, user?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Agenda de licitações</DialogTitle>
          <DialogDescription>Disputas e tarefas com prazo do quadro da GSS. Tarefa atrasada fica no topo até alguém concluir.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">Próximos 7 dias</SelectItem>
              <SelectItem value="15">Próximos 15 dias</SelectItem>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm"><Switch checked={soMinhas} onCheckedChange={setSoMinhas} /> Só as minhas</label>
        </div>

        {isLoading ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          : !grupos.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nada no período.</p>
          : (
            <div className="space-y-4">
              {grupos.map(([dia, lista]) => (
                <div key={dia}>
                  <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wide", dia === "Atrasadas" ? "text-red-600" : "text-muted-foreground")}>{dia}</p>
                  <div className="divide-y rounded-md border">
                    {lista.map((i) => {
                      const u = urgenciaTarefa(i.quando, false);
                      return (
                        <button key={i.id} type="button" onClick={() => { onAbrir(i.licitacaoId); onOpenChange(false); }}
                          className="flex w-full items-start gap-3 p-2.5 text-left hover:bg-muted/50">
                          <span className={cn("w-12 shrink-0 pt-0.5 text-sm tabular-nums", u === "vencida" ? "text-red-600" : "text-muted-foreground")}>
                            {new Date(i.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {i.tipo === "disputa" ? <Gavel className="h-3.5 w-3.5 text-primary" /> : <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-sm font-medium">{i.titulo}</span>
                              {u === "vencida" && <Badge variant="outline" className="h-5 border-red-300 px-1.5 text-[10px] text-red-700">{new Date(i.quando).toLocaleDateString("pt-BR")}</Badge>}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{i.card}{i.responsavel ? ` · ${i.responsavel}` : ""}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
