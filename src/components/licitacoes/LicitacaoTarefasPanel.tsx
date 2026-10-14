import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Bell, CalendarClock, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ANTECEDENCIAS, AVISOS_PADRAO, TIPOS_TAREFA, diasUteisAntes, juntarDataHora, rotuloTarefa, separarDataHora, urgenciaTarefa,
  type LicitacaoTarefa,
} from "@/lib/licitacaoTarefas";

/**
 * Prazos e tarefas do edital (T5 de docs/arquitetura/licitacoes-contratos-gss.md): tarefa com tipo,
 * data e hora, responsável e aviso com antecedência (robô licitacoes-tarefas-alertas: sino e
 * e-mail). Sugere esclarecimento/impugnação 3 dias úteis antes da disputa e, em fase invertida,
 * cobra a data de envio dos documentos. Criar, remarcar e concluir ficam no histórico do card.
 */

// equipe de licitação + quem já responde por algum card (a lista antiga deixava a Denise de fora)
export function useEquipeLicitacoes() {
  return useQuery({
    queryKey: ["equipe-licitacoes-tarefas"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [{ data: papeis }, { data: resp }] = await Promise.all([
        supabase.from("user_roles").select("user_id").in("role", ["licitador", "lider_licitacao", "gestor_contratos"] as any),
        (supabase as any).from("licitacoes").select("responsavel_id").eq("board", "effecti").not("responsavel_id", "is", null)
          .gte("updated_at", new Date(Date.now() - 120 * 864e5).toISOString()).limit(1000),
      ]);
      const ids = [...new Set([...(papeis ?? []).map((p: any) => p.user_id), ...(resp ?? []).map((r: any) => r.responsavel_id)])];
      if (!ids.length) return [] as { id: string; nome_completo: string }[];
      const { data } = await supabase.from("profiles").select("id, nome_completo").in("id", ids).order("nome_completo");
      return (data ?? []) as { id: string; nome_completo: string }[];
    },
  });
}

export function useMinhasPreferenciasLicitacoes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["licitacoes-preferencias", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("licitacoes_preferencias").select("*").eq("user_id", user!.id).maybeSingle();
      return (data ?? { user_id: user!.id, avisos_min: AVISOS_PADRAO, aviso_email: true, filtro_dias: null }) as {
        user_id: string; avisos_min: number[]; aviso_email: boolean; filtro_dias: number | null;
      };
    },
  });
}

const dataBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

export function LicitacaoTarefasPanel({ licitacaoId, dataDisputa, responsavelCard }: {
  licitacaoId: string; dataDisputa?: string | null; responsavelCard?: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: equipe = [] } = useEquipeLicitacoes();
  const [form, setForm] = useState<Partial<LicitacaoTarefa> | null>(null);
  const [verConcluidas, setVerConcluidas] = useState(false);
  const [avisosAberto, setAvisosAberto] = useState(false);
  const nomeDe = (id?: string | null) => equipe.find((p) => p.id === id)?.nome_completo?.split(" ").slice(0, 2).join(" ");

  const { data: tarefas = [] } = useQuery({
    queryKey: ["licitacao-tarefas", licitacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("licitacao_tarefas").select("*").eq("licitacao_id", licitacaoId).order("data_hora");
      if (error) throw error;
      return (data ?? []) as LicitacaoTarefa[];
    },
  });
  const { data: faseInvertida = false } = useQuery({
    queryKey: ["licitacao-fase-invertida", licitacaoId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("licitacoes").select("fase_invertida").eq("id", licitacaoId).single();
      return !!data?.fase_invertida;
    },
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["licitacao-tarefas", licitacaoId] });
    qc.invalidateQueries({ queryKey: ["licitacao-tarefas-abertas"] });
    qc.invalidateQueries({ queryKey: ["licitacoes-atividades", licitacaoId] });
  };

  const salvar = useMutation({
    mutationFn: async (t: Partial<LicitacaoTarefa>) => {
      const linha = {
        tipo: t.tipo, titulo: t.titulo?.trim() || null, data_hora: t.data_hora, responsavel_id: t.responsavel_id || null,
        observacao: t.observacao?.trim() || null, avisos_min: t.avisos_min?.length ? t.avisos_min : null,
      };
      const r = t.id
        ? await (supabase as any).from("licitacao_tarefas").update(linha).eq("id", t.id)
        : await (supabase as any).from("licitacao_tarefas").insert({ ...linha, licitacao_id: licitacaoId, created_by: user?.id });
      if (r.error) throw r.error;
    },
    onSuccess: (_d, t) => { toast.success(t.id ? "Tarefa atualizada" : "Tarefa criada"); setForm(null); recarregar(); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar a tarefa"),
  });
  const concluir = useMutation({
    mutationFn: async (t: LicitacaoTarefa) => {
      const { error } = await (supabase as any).from("licitacao_tarefas")
        .update({ concluida_em: t.concluida_em ? null : new Date().toISOString() }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e: any) => toast.error(e?.message || "Não foi possível concluir"),
  });
  const excluir = useMutation({
    mutationFn: async (t: LicitacaoTarefa) => {
      const { error } = await (supabase as any).from("licitacao_tarefas").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa excluída"); recarregar(); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível excluir"),
  });
  const marcarFase = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await (supabase as any).from("licitacoes").update({ fase_invertida: v }).eq("id", licitacaoId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["licitacao-fase-invertida", licitacaoId] });
      qc.invalidateQueries({ queryKey: ["licitacoes-kanban"] });
      if (v && !tarefas.some((t) => t.tipo === "envio_documentos")) novaTarefa("envio_documentos");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível marcar"),
  });

  const abertas = tarefas.filter((t) => !t.concluida_em);
  const concluidas = tarefas.filter((t) => t.concluida_em);

  // sugestão: esclarecimento/impugnação 3 dias úteis antes da disputa
  const sugestao = useMemo(() => {
    if (!dataDisputa || tarefas.some((t) => t.tipo === "esclarecimento_impugnacao")) return null;
    const disputa = new Date(dataDisputa);
    const limite = diasUteisAntes(disputa, 3);
    if (limite.getTime() < Date.now()) return null;
    return limite;
  }, [dataDisputa, tarefas]);
  const faltaEnvio = faseInvertida && !tarefas.some((t) => t.tipo === "envio_documentos");

  function novaTarefa(tipo = "personalizada", quando?: Date) {
    const base = quando ?? new Date(Date.now() + 864e5);
    const { data } = separarDataHora(base.toISOString());
    const hora = quando ? separarDataHora(quando.toISOString()).hora : "09:00";
    setForm({ tipo, titulo: "", data_hora: juntarDataHora(data, hora), responsavel_id: responsavelCard || user?.id || null, observacao: "", avisos_min: null });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Prazos e tarefas</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="Na fase invertida a habilitação vem antes: a data de envio dos documentos é obrigatória">
          <Switch checked={faseInvertida} onCheckedChange={(v) => marcarFase.mutate(v)} className="scale-75" />
          Fase invertida
        </label>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAvisosAberto(true)}>
          <Bell className="h-3.5 w-3.5" /> Meus avisos
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => novaTarefa()}>
          <Plus className="h-3.5 w-3.5" /> Tarefa
        </Button>
      </div>

      {faltaEnvio && (
        <button type="button" onClick={() => novaTarefa("envio_documentos")}
          className="flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-left text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Fase invertida: falta lançar a data de envio dos documentos. Clique para lançar.
        </button>
      )}
      {sugestao && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Lightbulb className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Esclarecimento/impugnação até <b>{sugestao.toLocaleDateString("pt-BR")}</b> (3 dias úteis antes da disputa; feriado não entra na conta).</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => novaTarefa("esclarecimento_impugnacao", sugestao)}>Criar tarefa</Button>
        </div>
      )}

      {abertas.length === 0 && !sugestao && !faltaEnvio && (
        <p className="text-xs text-muted-foreground">Nenhuma tarefa aberta. Recurso, contrarrazão, envio de documentos e deliberação entram aqui com data e hora, e o Sigma avisa antes.</p>
      )}
      <ul className="space-y-1">
        {abertas.map((t) => <LinhaTarefa key={t.id} t={t} responsavel={nomeDe(t.responsavel_id)} onConcluir={() => concluir.mutate(t)} onEditar={() => setForm(t)} onExcluir={() => { if (window.confirm(`Excluir "${rotuloTarefa(t)}"?`)) excluir.mutate(t); }} />)}
      </ul>
      {concluidas.length > 0 && (
        <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setVerConcluidas((v) => !v)}>
          {verConcluidas ? "Esconder" : "Ver"} {concluidas.length} concluída(s)
        </button>
      )}
      {verConcluidas && (
        <ul className="space-y-1">
          {concluidas.map((t) => <LinhaTarefa key={t.id} t={t} responsavel={nomeDe(t.responsavel_id)} onConcluir={() => concluir.mutate(t)} onEditar={() => setForm(t)} onExcluir={() => { if (window.confirm(`Excluir "${rotuloTarefa(t)}"?`)) excluir.mutate(t); }} />)}
        </ul>
      )}

      {form && (
        <TarefaForm
          inicial={form} equipe={equipe} pendente={salvar.isPending}
          onCancelar={() => setForm(null)} onSalvar={(t) => salvar.mutate(t)}
        />
      )}
      {avisosAberto && <MeusAvisosDialog onFechar={() => setAvisosAberto(false)} />}
    </div>
  );
}

function LinhaTarefa({ t, responsavel, onConcluir, onEditar, onExcluir }: {
  t: LicitacaoTarefa; responsavel?: string; onConcluir: () => void; onEditar: () => void; onExcluir: () => void;
}) {
  const u = urgenciaTarefa(t.data_hora, !!t.concluida_em);
  return (
    <li className="group flex items-start gap-2 rounded-md bg-background px-2 py-1.5 text-xs">
      <Checkbox checked={!!t.concluida_em} onCheckedChange={onConcluir} className="mt-0.5" title={t.concluida_em ? "Reabrir" : "Concluir"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-medium", t.concluida_em && "text-muted-foreground line-through")}>{rotuloTarefa(t)}</span>
          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]",
            u === "vencida" && "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
            u === "hoje" && "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200")}>
            {u === "vencida" ? "venceu " : ""}{dataBr(t.data_hora)}
          </Badge>
          {responsavel && <span className="text-muted-foreground">· {responsavel}</span>}
        </div>
        {t.observacao && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{t.observacao}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
        <button type="button" className="rounded p-1 hover:bg-muted" title="Editar ou remarcar" onClick={onEditar}><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" className="rounded p-1 text-destructive hover:bg-destructive/10" title="Excluir" onClick={onExcluir}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </li>
  );
}

function TarefaForm({ inicial, equipe, pendente, onSalvar, onCancelar }: {
  inicial: Partial<LicitacaoTarefa>; equipe: { id: string; nome_completo: string }[]; pendente: boolean;
  onSalvar: (t: Partial<LicitacaoTarefa>) => void; onCancelar: () => void;
}) {
  const ini = separarDataHora(inicial.data_hora || new Date().toISOString());
  const [tipo, setTipo] = useState(inicial.tipo || "personalizada");
  const [titulo, setTitulo] = useState(inicial.titulo || "");
  const [data, setData] = useState(ini.data);
  const [hora, setHora] = useState(ini.hora);
  const [responsavel, setResponsavel] = useState(inicial.responsavel_id || "");
  const [observacao, setObservacao] = useState(inicial.observacao || "");
  const [avisos, setAvisos] = useState<number[] | null>(inicial.avisos_min ?? null);

  const enviar = () => {
    if (tipo === "personalizada" && !titulo.trim()) return toast.error("Escreva o nome da tarefa");
    if (!data || !hora) return toast.error("Informe data e hora");
    onSalvar({ id: inicial.id, tipo, titulo, data_hora: juntarDataHora(data, hora), responsavel_id: responsavel || null, observacao, avisos_min: avisos });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>O responsável e quem criou recebem o aviso no Sigma e por e-mail antes do prazo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_TAREFA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <span className="text-xs text-muted-foreground">{tipo === "personalizada" ? "Nome da tarefa" : "Complemento (opcional)"}</span>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "personalizada" ? "Ex.: enviar amostra ao representante" : "Ex.: item 7.2 do edital"} className="h-9" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Data</span>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Hora</span>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-9" />
            </div>
            <div className="col-span-2 space-y-1">
              <span className="text-xs text-muted-foreground">Responsável</span>
              <Select value={responsavel || "__ninguem"} onValueChange={(v) => setResponsavel(v === "__ninguem" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguem">Sem responsável (avisa quem criou)</SelectItem>
                  {equipe.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Avisar antes</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={avisos === null ? "default" : "outline"} className="cursor-pointer font-normal" onClick={() => setAvisos(null)}>Padrão de cada pessoa</Badge>
              {ANTECEDENCIAS.map((a) => {
                const on = !!avisos?.includes(a.min);
                return (
                  <Badge key={a.min} variant={on ? "default" : "outline"} className="cursor-pointer font-normal"
                    onClick={() => setAvisos((v) => { const atual = v ?? []; const novo = on ? atual.filter((x) => x !== a.min) : [...atual, a.min]; return novo.length ? novo : null; })}>
                    {a.label}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Observação</span>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className="min-h-[60px] text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button onClick={enviar} disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MeusAvisosDialog({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: pref } = useMinhasPreferenciasLicitacoes();
  const [avisos, setAvisos] = useState<number[] | null>(null);
  const [email, setEmail] = useState<boolean | null>(null);
  const atuais = avisos ?? pref?.avisos_min ?? AVISOS_PADRAO;
  const comEmail = email ?? pref?.aviso_email ?? true;

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("licitacoes_preferencias")
        .upsert({ user_id: user!.id, avisos_min: atuais, aviso_email: comEmail, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Avisos salvos"); qc.invalidateQueries({ queryKey: ["licitacoes-preferencias"] }); onFechar(); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Meus avisos de prazo</DialogTitle>
          <DialogDescription>Quanto tempo antes de cada tarefa você quer ser avisado. Vale para todas as tarefas em que você é responsável ou que você criou.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {ANTECEDENCIAS.map((a) => {
            const on = atuais.includes(a.min);
            return (
              <Badge key={a.min} variant={on ? "default" : "outline"} className="cursor-pointer font-normal"
                onClick={() => setAvisos(on ? atuais.filter((x) => x !== a.min) : [...atuais, a.min].sort((x, y) => y - x))}>
                {a.label}
              </Badge>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={comEmail} onCheckedChange={setEmail} /> Também por e-mail
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !atuais.length}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
