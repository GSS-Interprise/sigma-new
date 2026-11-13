import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Instagram, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { JANELA_META_MS as JANELA_MS, janelaAberta } from "../../../../supabase/functions/_shared/redes";

/**
 * Conversa do Instagram do médico, dentro do painel do lead (acima da do WhatsApp). Só existe quando o médico respondeu
 * a uma mensagem enviada pela fila do Instagram: a edge instagram-zernio traz a conversa do Zernio a cada 3 min e só
 * grava a de médico da fila (a conta é o Instagram pessoal do Dr. Maikon, que também fala com pacientes).
 * A Meta só deixa responder até 24 h depois da última mensagem do médico; fora disso a caixa explica e fica travada.
 */


type Conversa = { zernio_conversation_id: string; handle: string; ultima_do_medico_em: string | null };
type Msg = { id: string; direcao: "recebida" | "enviada"; texto: string; tipo: string; enviado_em: string };

export function ConversaInstagram({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const { data } = useQuery({
    queryKey: ["instagram-conversa", leadId],
    enabled: !!leadId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: conv } = await (supabase as any).from("instagram_conversas")
        .select("zernio_conversation_id, handle, ultima_do_medico_em").eq("lead_id", leadId)
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (!conv) return null;
      const { data: msgs } = await (supabase as any).from("instagram_mensagens")
        .select("id, direcao, texto, tipo, enviado_em").eq("zernio_conversation_id", conv.zernio_conversation_id)
        .order("enviado_em", { ascending: true }).limit(100);
      return { conv: conv as Conversa, msgs: (msgs ?? []) as Msg[] };
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.functions.invoke("instagram-zernio", { body: { action: "enviar", lead_id: leadId, texto: texto.trim() } });
      if (error) throw new Error(error.message);
      if (!r?.ok) throw new Error(r?.error || "Não deu para enviar.");
    },
    onSuccess: () => { setTexto(""); toast.success("Resposta enviada no Instagram."); qc.invalidateQueries({ queryKey: ["instagram-conversa", leadId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;
  const { conv, msgs } = data;
  const fechaEm = conv.ultima_do_medico_em ? new Date(new Date(conv.ultima_do_medico_em).getTime() + JANELA_MS) : null;
  const aberta = janelaAberta(conv.ultima_do_medico_em);

  return (
    <section className="mb-4 rounded-lg border bg-background" aria-label="Conversa no Instagram">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Instagram className="h-4 w-4 text-pink-600" />Instagram · @{conv.handle}
        </span>
        <span className={cn("text-xs", aberta ? "text-emerald-700" : "text-muted-foreground")}>
          {aberta ? `Pode responder até ${format(fechaEm!, "dd/MM 'às' HH:mm", { locale: ptBR })}` : "Janela de 24 h fechada"}
        </span>
      </header>
      <div className="max-h-72 space-y-1.5 overflow-y-auto p-3">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.direcao === "enviada" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[78%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
              m.direcao === "enviada" ? "bg-pink-50 text-foreground" : "bg-muted")}>
              <p className="whitespace-pre-wrap break-words">{m.texto || (m.tipo === "texto" ? "" : `[${m.tipo}]`)}</p>
              <p className="mt-0.5 text-right text-[11px] text-muted-foreground">{format(new Date(m.enviado_em), "dd/MM HH:mm")}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        {aberta ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviar.mutate(); }}>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={1000}
              placeholder="Responder no Instagram como @maikonmadeira" className="min-h-0 flex-1 resize-none text-sm" disabled={enviar.isPending}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviar.mutate(); } }} />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!texto.trim() || enviar.isPending} aria-label="Enviar no Instagram">
              {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">O Instagram só deixa responder depois que o médico escrever de novo.</p>
        )}
      </div>
    </section>
  );
}
