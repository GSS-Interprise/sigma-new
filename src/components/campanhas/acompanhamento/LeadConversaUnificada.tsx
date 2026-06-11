import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, ExternalLink, Send } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  leadId: string;
  /** Histórico legado (campanha_leads.historico_conversa) — usado como fallback. */
  historicoCampanhaFallback: Array<{ role: string; text: string; ts: string }>;
  /** Contexto da campanha — habilita enviar o 1º contato manual quando o lead ainda não tem conversa. */
  campanhaId?: string;
  campanhaLeadId?: string;
  leadPhone?: string | null;
}

interface SigzapMsg {
  id: string;
  from_me: boolean;
  message_text: string | null;
  message_type: string | null;
  sent_at: string;
  message_status: string | null;
}

/**
 * Mostra a conversa REAL do SigZap pelo lead_id (FK adicionada em F1.3).
 * Cross-campanha: se o mesmo médico está em N campanhas, a conversa
 * é a mesma (sigzap_messages é por conversation_id que vem do phone, não da campanha).
 *
 * Fallback pro histórico legado (campanha_leads.historico_conversa) quando
 * a conversa SigZap ainda não foi vinculada via lead_id (30% dos leads
 * sem match exato no backfill F1.3).
 */
// Traduz erro técnico de envio (Evolution/edge) numa mensagem clara pra operadora —
// pra ninguém achar que é "erro de sistema" quando é chip caído / número inválido.
function traduzErroEnvio(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("connection closed") || m.includes("precondition") || m.includes("428") || m.includes("desconect"))
    return "O chip dessa campanha está desconectado do WhatsApp. Reconecte ele em 'Disparos & Chips' e tente de novo.";
  if (m.includes("not on whatsapp") || m.includes("exists") || m.includes("invalid") || m.includes("número") || m.includes("number"))
    return "Esse número parece não ter WhatsApp ativo. Confira o número ou marque o lead como perdido.";
  if (m.includes("timeout") || m.includes("abort") || m.includes("demor"))
    return "O WhatsApp demorou demais pra responder (chip lento). Tente de novo em instantes.";
  if (m.includes("non-2xx") || m.includes("edge function"))
    return "Não consegui enviar agora (o chip pode estar fora do ar). Confira a conexão do chip e tente de novo.";
  return raw || "Não consegui enviar agora. Tente de novo.";
}

export function LeadConversaUnificada({ leadId, historicoCampanhaFallback, campanhaId, campanhaLeadId, leadPhone }: Props) {
  // 1. Acha a conversa SigZap vinculada a este lead
  const { data: conv, isLoading: loadingConv } = useQuery({
    queryKey: ["acompanhamento-conv-by-lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sigzap_conversations")
        .select("id, instance_id, last_message_at, instance:instance_id(name), contact:contact_id(contact_jid, contact_phone)")
        .eq("lead_id", leadId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data as {
        id: string;
        instance_id: string | null;
        last_message_at: string | null;
        instance: { name: string | null } | null;
        contact: { contact_jid: string | null; contact_phone: string | null } | null;
      } | null;
    },
  });

  // #5 (pedido equipe 11/06): escolher por qual chip a resposta sai. Default = chip da
  // conversa (continuidade: médico já conhece esse número). Operadora pode trocar pra
  // um chip "humano" se quiser separar do que a IA usa — com aviso de que muda o número.
  const [instanceEscolhida, setInstanceEscolhida] = useState<string | null>(null);
  const { data: chipsCampanha = [] } = useQuery({
    queryKey: ["acompanhamento-chips-campanha", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data: camp } = await (supabase as any)
        .from("campanhas").select("chip_ids, chip_id").eq("id", campanhaId).maybeSingle();
      const ids: string[] = (camp?.chip_ids?.length ? camp.chip_ids : [camp?.chip_id]).filter(Boolean);
      if (!ids.length) return [] as Array<{ instance_name: string; nome: string; open: boolean }>;
      const { data: chips } = await (supabase as any)
        .from("chips").select("nome, instance_name, connection_state").in("id", ids);
      return (chips ?? []).map((c: any) => ({ instance_name: c.instance_name, nome: c.nome, open: c.connection_state === "open" }));
    },
    staleTime: 60_000,
  });
  // Chip efetivo do envio: escolhido > o da conversa SigZap
  const instanceAtual = instanceEscolhida || conv?.instance?.name || null;

  // Caixa de resposta da operadora — envia pelo mesmo caminho do SigZap (send-sigzap-message).
  // Esse envio NÃO passa pelo gate anti-ban de disparo: resposta pode sair em segundos.
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const enviar = useMutation({
    mutationFn: async (msg: string) => {
      const instanceName = instanceAtual;
      const contactJid =
        conv?.contact?.contact_jid ||
        (conv?.contact?.contact_phone
          ? `${conv.contact.contact_phone.replace(/\D/g, "")}@s.whatsapp.net`
          : null);
      if (!conv?.id || !instanceName || !contactJid) {
        throw new Error("Conversa sem instância/contato vinculado — responda pelo SigZap.");
      }
      const { data, error } = await supabase.functions.invoke("send-sigzap-message", {
        body: { action: "send", conversationId: conv.id, instanceName, contactJid, message: msg },
      });
      if (error) {
        // Extrai o motivo real do corpo (o invoke só dá "non-2xx" genérico).
        let det = error?.message || "";
        try { const body = await (error as any).context?.json?.(); det = body?.details ? JSON.stringify(body.details) : (body?.error || det); } catch (_) {}
        throw new Error(traduzErroEnvio(det));
      }
      if ((data as any)?.error) throw new Error(traduzErroEnvio((data as any).error));
      return data;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["acompanhamento-conv-msgs", conv?.id] });
      toast.success("Mensagem enviada ✅");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível enviar."),
  });

  // 1º contato MANUAL (campanha manual): lead ainda sem conversa — inicia o contato
  // pelo chip da campanha e marca o campanha_leads (data_primeiro_contato + contatado).
  const [texto1o, setTexto1o] = useState("");
  const enviar1oContato = useMutation({
    mutationFn: async (msg: string) => {
      if (!campanhaId) throw new Error("Sem campanha no contexto");
      const { data, error } = await supabase.functions.invoke("campanha-disparo-manual-1contato", {
        body: { campanha_id: campanhaId, campanha_lead_id: campanhaLeadId, lead_id: leadId, phone: leadPhone, mensagem: msg },
      });
      if (error) throw new Error(traduzErroEnvio(error?.message || ""));
      if ((data as any)?.error) throw new Error((data as any).error); // já vem traduzido da edge
      return data;
    },
    onSuccess: () => {
      setTexto1o("");
      // Envio síncrono: a mensagem já saiu e a conversa tem a 1ª mensagem.
      qc.invalidateQueries({ queryKey: ["acompanhamento-conv-by-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["acompanhamento-conv-msgs"] });
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success("1ª mensagem enviada! 🎉 O lead já está como contatado.");
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível enviar."),
  });

  // 2. Se tem conversa, busca mensagens reais
  const { data: mensagens, isLoading: loadingMsgs } = useQuery({
    queryKey: ["acompanhamento-conv-msgs", conv?.id],
    enabled: !!conv?.id,
    queryFn: async (): Promise<SigzapMsg[]> => {
      const { data } = await (supabase as any)
        .from("sigzap_messages")
        .select("id, from_me, message_text, message_type, sent_at, message_status")
        .eq("conversation_id", conv!.id)
        .order("sent_at", { ascending: true })
        .limit(500);
      return (data ?? []) as SigzapMsg[];
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // Timeline UNIFICADA: funde sigzap_messages (conversas manuais/SigZap) com
  // campanha_leads.historico_conversa (conversas da IA, que NÃO vão pro SigZap).
  // Bug 11/06: o painel mostrava só a conversa SigZap mais recente — quando o
  // médico tinha conversa IA rica no histórico + uma conversa SigZap curta de
  // OUTRA campanha, a IA sumia. Agora junta as duas por timestamp e deduplica.
  // ─────────────────────────────────────────────────────────────────────
  type TimelineMsg = { id: string; mine: boolean; text: string; ts: Date | null; source: "sigzap" | "historico"; status?: string | null };
  const timeline: TimelineMsg[] = useMemo(() => {
    const items: TimelineMsg[] = [];
    for (const m of mensagens ?? []) {
      items.push({
        id: `s_${m.id}`,
        mine: m.from_me,
        text: m.message_text || (m.message_type ? `[${m.message_type}]` : "—"),
        ts: m.sent_at ? new Date(m.sent_at) : null,
        source: "sigzap",
        status: m.message_status,
      });
    }
    (historicoCampanhaFallback ?? []).forEach((h, i) => {
      const role = (h.role || "").toLowerCase();
      items.push({
        id: `h_${i}`,
        // role 'medico'/'lead' = entrada do médico; resto (ia/gss/humano/assistant) = nosso
        mine: role !== "medico" && role !== "lead",
        text: h.text,
        ts: h.ts ? new Date(h.ts) : null,
        source: "historico",
      });
    });
    // ordena por timestamp (sem ts vai pro fim, preservando ordem de inserção)
    items.sort((a, b) => (a.ts?.getTime() ?? Infinity) - (b.ts?.getTime() ?? Infinity));
    // dedup: mesma direção + mesmo texto a < 2min = mesma mensagem em 2 fontes.
    // Prefere a versão SigZap (tem status de entrega).
    const out: Array<TimelineMsg & { _k: string }> = [];
    for (const it of items) {
      const k = `${it.mine ? "1" : "0"}|${(it.text || "").trim().toLowerCase().slice(0, 80)}`;
      const dup = out.find((o) => o._k === k && o.ts && it.ts && Math.abs(o.ts.getTime() - it.ts.getTime()) < 120000);
      if (dup) {
        if (it.source === "sigzap" && dup.source === "historico") Object.assign(dup, it);
        continue;
      }
      out.push({ ...it, _k: k });
    }
    return out;
  }, [mensagens, historicoCampanhaFallback]);

  // Scroll automático pro fim quando a conversa carrega ou chega mensagem nova
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length, conv?.id]);

  // Loading
  if (loadingConv || (conv?.id && loadingMsgs)) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando conversa...
      </div>
    );
  }

  const temConversa = timeline.length > 0;
  const linkSigzap = conv?.id ? `/disparos/sigzap?conversation=${conv.id}` : null;

  return (
    <>
      {temConversa && (
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <MessageSquare className="h-3 w-3" />
            Conversa unificada
            <span className="text-muted-foreground">· {timeline.length} mensagens</span>
          </Badge>
          {linkSigzap && (
            <a
              href={linkSigzap}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              target="_blank"
              rel="noreferrer"
            >
              Abrir no SigZap
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {!temConversa ? (
        <div className="text-center py-10 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma conversa registrada ainda.</p>
          <p className="text-xs mt-1">
            {campanhaId
              ? "Envie a 1ª mensagem abaixo pra iniciar o contato no WhatsApp."
              : "Quando o médico responder no WhatsApp, as mensagens aparecem aqui."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {timeline.map((msg, i) => {
            const prev = i > 0 ? timeline[i - 1] : null;
            const showSep = !!msg.ts && (!prev || !prev.ts || !isSameDay(prev.ts, msg.ts));
            return (
              <Fragment key={msg.id}>
                {showSep && msg.ts && <DateSeparator iso={msg.ts.toISOString()} />}
                <BubbleTimeline msg={msg} />
              </Fragment>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {/* Caixa de resposta: se há conversa SigZap vinculada, responde por ela (segundos,
          sem gate anti-ban). Senão, e se há campanha, oferece o 1º contato manual. */}
      {conv?.id ? (
        <div className="mt-3 border-t pt-3">
          {/* #5: chip que envia a resposta — transparente e trocável */}
          <div className="flex items-center gap-2 mb-2 text-xs">
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground shrink-0">Enviando pelo chip:</span>
            {chipsCampanha.length > 1 ? (
              <select
                value={instanceAtual ?? ""}
                onChange={(e) => setInstanceEscolhida(e.target.value)}
                className="border rounded px-1.5 py-0.5 text-xs bg-background max-w-[60%]"
              >
                {chipsCampanha.map((c) => (
                  <option key={c.instance_name} value={c.instance_name} disabled={!c.open}>
                    {c.nome}{!c.open ? " (offline)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium truncate">{instanceAtual || "—"}</span>
            )}
            {instanceEscolhida && conv?.instance?.name && instanceEscolhida !== conv.instance.name && (
              <span className="text-amber-600 shrink-0" title="O médico vai receber de um número diferente do que vinha conversando.">⚠ número diferente</span>
            )}
          </div>
          <div className="flex items-end gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Responder pelo WhatsApp... (Enter envia, Shift+Enter quebra linha)"
            rows={2}
            className="resize-none text-sm"
            disabled={enviar.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (texto.trim()) enviar.mutate(texto.trim());
              }
            }}
          />
          <Button
            size="sm"
            className="shrink-0"
            disabled={!texto.trim() || enviar.isPending}
            onClick={() => texto.trim() && enviar.mutate(texto.trim())}
          >
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
          </div>
        </div>
      ) : campanhaId ? (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5 mb-2 flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Enviar 1ª mensagem (disparo manual via WhatsApp)
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={texto1o}
              onChange={(e) => setTexto1o(e.target.value)}
              placeholder="Escreva a 1ª mensagem pro médico... (Enter envia, Shift+Enter quebra linha)"
              rows={2}
              className="resize-none text-sm"
              disabled={enviar1oContato.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (texto1o.trim()) enviar1oContato.mutate(texto1o.trim());
                }
              }}
            />
            <Button
              size="sm"
              className="shrink-0"
              disabled={!texto1o.trim() || enviar1oContato.isPending}
              onClick={() => texto1o.trim() && enviar1oContato.mutate(texto1o.trim())}
            >
              {enviar1oContato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Usa um chip conectado da campanha. Ao enviar, o lead passa pra "contatado".
          </p>
        </div>
      ) : null}
    </>
  );
}

// Bubble da timeline unificada (sigzap + histórico IA), estilo WhatsApp
function BubbleTimeline({ msg }: { msg: { mine: boolean; text: string; ts: Date | null; source: string } }) {
  const mine = msg.mine;
  let hora = "";
  if (msg.ts) { try { hora = format(msg.ts, "HH:mm", { locale: ptBR }); } catch {} }
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
          mine
            ? "bg-emerald-100 text-emerald-950 rounded-br-sm"
            : "bg-background border border-border rounded-bl-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-snug">{msg.text}</p>
        <div className="text-[10px] mt-0.5 opacity-50 text-right">{hora}</div>
      </div>
    </div>
  );
}

// Separador de data entre grupos de mensagens (estilo WhatsApp)
function DateSeparator({ iso }: { iso: string }) {
  let label = "";
  try {
    const d = new Date(iso);
    label = isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "dd 'de' MMMM", { locale: ptBR });
  } catch {}
  return (
    <div className="flex justify-center my-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/70 rounded-full px-2.5 py-0.5">
        {label}
      </span>
    </div>
  );
}

