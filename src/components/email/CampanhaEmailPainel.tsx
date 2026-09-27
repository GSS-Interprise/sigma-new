import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Mail, Pause, Play, Save, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { EmailComposer, type EmailRascunho } from "./EmailComposer";
import { EmailMetricas } from "./EmailMetricas";

/**
 * E-mail de UMA campanha. Serve para os dois casos:
 * - campanha de WhatsApp: manda e-mail para os médicos que já estão nela (todos ou só quem não respondeu);
 * - campanha só de e-mail: o público vem dos filtros da própria campanha.
 * O envio real é da edge email-campanha (fila + cron a cada 2 min, respeitando o limite diário).
 */
export const EMAIL_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: "Rascunho",  cls: "bg-slate-100 text-slate-600" },
  agendado:  { label: "Agendado",  cls: "bg-violet-50 text-violet-700" },
  enviando:  { label: "Enviando",  cls: "bg-emerald-50 text-emerald-700" },
  pausado:   { label: "Pausado",   cls: "bg-amber-50 text-amber-700" },
  concluido: { label: "Concluído", cls: "bg-blue-50 text-blue-700" },
};

const ERROS: Record<string, string> = {
  remetente_nao_configurado:
    "O remetente de marketing ainda não foi configurado. Ele usa um subdomínio próprio para não afetar os e-mails do dia a dia da GSS — assim que o subdomínio estiver pronto, o envio é liberado.",
};

async function chamar(acao: string, campanhaId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("email-campanha", { body: { acao, campanha_id: campanhaId, ...extra } });
  const r = (data ?? {}) as any;
  if (error || !r.ok) {
    let msg = r.error || error?.message || "falha";
    try { const ctx = await (error as any)?.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* corpo já lido */ }
    throw new Error(ERROS[msg] || msg);
  }
  return r;
}

export function CampanhaEmailPainel({ campanhaId }: { campanhaId: string }) {
  const qc = useQueryClient();
  const { data: c, refetch } = useQuery({
    queryKey: ["email-campanha", campanhaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("campanhas")
        .select("id, nome, canal, assunto_email, data_agendamento, email_ativo, email_publico, email_conteudo, email_remetente_nome, email_limite_diario, email_status, email_iniciado_em, email_concluido_em")
        .eq("id", campanhaId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [rascunho, setRascunho] = useState<EmailRascunho | null>(null);
  const [limite, setLimite] = useState(500);
  const [agendamento, setAgendamento] = useState("");
  const [estimativa, setEstimativa] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!c) return;
    const ct = c.email_conteudo ?? {};
    setRascunho({
      assunto: c.assunto_email ?? "", remetente_nome: c.email_remetente_nome ?? "GSS Saúde",
      titulo: ct.titulo ?? "", mensagem: ct.mensagem ?? "", botao_texto: ct.botao_texto ?? "", botao_link: ct.botao_link ?? "",
    });
    setLimite(c.email_limite_diario ?? 500);
    setAgendamento(c.data_agendamento && c.canal === "email" ? toLocalInput(c.data_agendamento) : "");
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimar = async () => {
    try { setEstimativa((await chamar("estimar", campanhaId)).total); } catch { setEstimativa(null); }
  };
  useEffect(() => { if (c) estimar(); }, [c?.id, c?.email_publico]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c || !rascunho) return <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  const ehEmail = c.canal === "email";
  const status = c.email_status as string;
  const editavel = status === "rascunho" || status === "pausado" || status === "concluido";

  const salvar = async (silencioso = false) => {
    setOcupado("salvar");
    const patch: Record<string, unknown> = {
      assunto_email: rascunho.assunto.trim() || null,
      email_remetente_nome: rascunho.remetente_nome.trim() || null,
      email_conteudo: { titulo: rascunho.titulo, mensagem: rascunho.mensagem, botao_texto: rascunho.botao_texto, botao_link: rascunho.botao_link },
      email_limite_diario: Math.max(10, Math.min(20000, Number(limite) || 500)),
      email_ativo: true,
    };
    // agendamento só na campanha de e-mail: na de WhatsApp a data é da própria campanha
    if (ehEmail) patch.data_agendamento = agendamento ? new Date(agendamento).toISOString() : null;
    const { error } = await (supabase as any).from("campanhas").update(patch).eq("id", campanhaId);
    setOcupado(null);
    if (error) { toast.error("Não salvou: " + error.message); return false; }
    if (!silencioso) toast.success("E-mail salvo.");
    await refetch();
    qc.invalidateQueries({ queryKey: ["campanhas-email"] });
    return true;
  };

  const trocarPublico = async (p: "todos" | "sem_resposta") => {
    await (supabase as any).from("campanhas").update({ email_publico: p }).eq("id", campanhaId);
    setEstimativa(null);
    await refetch();
  };

  const disparar = async () => {
    setConfirmar(false);
    if (!(await salvar(true))) return;
    setOcupado("iniciar");
    try {
      const r = await chamar("iniciar", campanhaId);
      toast.success(r.status === "agendado"
        ? `Agendado: ${r.na_fila.toLocaleString("pt-BR")} e-mails saem a partir da data marcada.`
        : `${r.na_fila.toLocaleString("pt-BR")} e-mails na fila. Os primeiros saem em até 2 minutos.`);
    } catch (e: any) { toast.error(e.message, { duration: 12000 }); }
    setOcupado(null);
    await refetch();
    qc.invalidateQueries({ queryKey: ["email-metricas", campanhaId] });
    qc.invalidateQueries({ queryKey: ["campanhas-email"] });
  };

  const pausarRetomar = async () => {
    const acao = status === "pausado" ? "retomar" : "pausar";
    setOcupado(acao);
    try { await chamar(acao, campanhaId); toast.success(acao === "pausar" ? "Envio pausado." : "Envio retomado."); }
    catch (e: any) { toast.error(e.message); }
    setOcupado(null);
    await refetch();
    qc.invalidateQueries({ queryKey: ["campanhas-email"] });
  };

  const dias = estimativa ? Math.ceil(estimativa / Math.max(1, limite)) : 0;
  const st = EMAIL_STATUS[status] ?? EMAIL_STATUS.rascunho;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className={`border-0 ${st.cls}`}>{st.label}</Badge>
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {estimativa === null ? "calculando público…" : `${estimativa.toLocaleString("pt-BR")} médicos com e-mail válido`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {(editavel || status === "enviando") && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!!ocupado} onClick={() => salvar()}>
              {ocupado === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          )}
          {(status === "enviando" || status === "pausado" || status === "agendado") && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!!ocupado} onClick={pausarRetomar}>
              {status === "pausado" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {status === "pausado" ? "Retomar" : "Pausar"}
            </Button>
          )}
          {(status === "rascunho" || status === "concluido") && (
            <Button size="sm" className="gap-1.5" disabled={!!ocupado || !estimativa} onClick={() => setConfirmar(true)}>
              {ocupado === "iniciar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {status === "concluido" ? "Enviar para quem entrou depois" : "Disparar e-mail"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {!ehEmail && (
          <div>
            <Label className="text-xs">Quem recebe</Label>
            <div className="mt-1 flex rounded-md border p-0.5 text-sm">
              {([["todos", "Todos da campanha"], ["sem_resposta", "Só quem não respondeu"]] as const).map(([v, l]) => (
                <button key={v} type="button" disabled={!editavel} onClick={() => trocarPublico(v)}
                  className={`flex-1 rounded px-2 py-1.5 ${c.email_publico === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label className="text-xs">Limite por dia</Label>
          <Input type="number" min={10} max={20000} value={limite} disabled={!editavel && status !== "enviando"}
            onChange={(e) => setLimite(Number(e.target.value))} />
          <p className="text-[11px] text-muted-foreground mt-1">
            {dias > 0 ? `Termina em ~${dias} dia${dias > 1 ? "s" : ""}.` : " "} Subir aos poucos protege a reputação do domínio.
          </p>
        </div>
        {ehEmail && (
          <div>
            <Label className="text-xs">Começar em (opcional)</Label>
            <Input type="datetime-local" value={agendamento} disabled={!editavel} onChange={(e) => setAgendamento(e.target.value)} />
          </div>
        )}
      </div>

      <EmailComposer valor={rascunho} onChange={setRascunho} campanhaId={campanhaId} desabilitado={!editavel} />
      {!editavel && (
        <p className="text-xs text-muted-foreground">Para mudar o texto, pause o envio. A mudança vale para quem ainda está na fila.</p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Mail className="h-4 w-4" /> Resultado</h3>
        <EmailMetricas campanhaId={campanhaId} />
      </div>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {status === "concluido"
                ? "Enviar para quem entrou na campanha depois do último envio?"
                : `Disparar para ${estimativa?.toLocaleString("pt-BR")} médicos?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Saem até {limite.toLocaleString("pt-BR")} por dia{dias > 1 ? `, ao longo de ~${dias} dias` : ""}.
              Quem já recebeu este e-mail não recebe de novo, e quem se descadastrou fica de fora.
              {ehEmail && agendamento ? ` Começa em ${new Date(agendamento).toLocaleString("pt-BR")}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={disparar}>Disparar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
