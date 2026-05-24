import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  leadId: string;
  /** Histórico legado (campanha_leads.historico_conversa) — usado como fallback. */
  historicoCampanhaFallback: Array<{ role: string; text: string; ts: string }>;
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
export function LeadConversaUnificada({ leadId, historicoCampanhaFallback }: Props) {
  // 1. Acha a conversa SigZap vinculada a este lead
  const { data: conv, isLoading: loadingConv } = useQuery({
    queryKey: ["acompanhamento-conv-by-lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sigzap_conversations")
        .select("id, instance_id, last_message_at")
        .eq("lead_id", leadId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; instance_id: string | null; last_message_at: string | null } | null;
    },
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

  // Loading
  if (loadingConv || (conv?.id && loadingMsgs)) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando conversa...
      </div>
    );
  }

  // Sem conversa SigZap vinculada — usa fallback do histórico de campanha
  if (!conv?.id) {
    if (historicoCampanhaFallback.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma conversa registrada ainda.</p>
          <p className="text-xs mt-1">
            Quando o médico responder no WhatsApp, as mensagens aparecem aqui.
          </p>
        </div>
      );
    }
    return (
      <>
        <div className="mb-3 text-xs flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          Mostrando histórico desta campanha (lead ainda sem vínculo com a conversa unificada do SigZap).
        </div>
        <div className="space-y-2">
          {historicoCampanhaFallback.map((msg, i) => (
            <BubbleLegacy key={i} msg={msg} />
          ))}
        </div>
      </>
    );
  }

  // Tem conversa vinculada — mostra mensagens reais (cross-campanha)
  const linkSigzap = `/disparos/sigzap?conversation=${conv.id}`;

  return (
    <>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <Badge variant="outline" className="gap-1.5 text-xs">
          <MessageSquare className="h-3 w-3" />
          Conversa unificada
          <span className="text-muted-foreground">· {mensagens?.length ?? 0} mensagens</span>
        </Badge>
        <a
          href={linkSigzap}
          className="text-xs text-primary hover:underline flex items-center gap-1"
          target="_blank"
          rel="noreferrer"
        >
          Abrir no SigZap
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {(!mensagens || mensagens.length === 0) ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Conversa vinculada mas sem mensagens ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {mensagens.map((msg) => (
            <BubbleSigzap key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </>
  );
}

// Bubble do formato sigzap_messages (canônico)
function BubbleSigzap({ msg }: { msg: SigzapMsg }) {
  const mine = msg.from_me;
  const text = msg.message_text || (msg.message_type ? `[${msg.message_type}]` : "—");

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-md px-3 py-1.5 text-sm",
          mine
            ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
            : "bg-muted text-foreground"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <div className={cn("text-[10px] mt-0.5 opacity-60", mine ? "text-right" : "text-left")}>
          {format(new Date(msg.sent_at), "dd/MM HH:mm", { locale: ptBR })}
        </div>
      </div>
    </div>
  );
}

// Bubble do formato legado (campanha_leads.historico_conversa) — fallback
function BubbleLegacy({ msg }: { msg: { role: string; text: string; ts: string } }) {
  const mine = msg.role === "ia" || msg.role === "assistant" || msg.role === "humano";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-md px-3 py-1.5 text-sm",
          mine ? "bg-emerald-100 text-emerald-900 border border-emerald-200" : "bg-muted"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        <div className={cn("text-[10px] mt-0.5 opacity-60", mine ? "text-right" : "text-left")}>
          {msg.ts && format(new Date(msg.ts), "dd/MM HH:mm", { locale: ptBR })}
        </div>
      </div>
    </div>
  );
}
