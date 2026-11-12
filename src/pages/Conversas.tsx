import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, CheckCheck, Clock, FileText, Loader2, MessageSquareText, Search, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SigZapAudioPlayer, SigZapVideoPlayer } from "@/components/sigzap/SigZapMediaPlayer";
import { SigZapDocumentCard } from "@/components/sigzap/SigZapDocumentCard";
import { cn } from "@/lib/utils";
import { motivoLegivel, nomeModelo, nomeProprio, trechoModelo } from "@/lib/textoDono";
import {
  useListaConversas, useMensagens, useModelosConversa, useNumerosConversa, useTempoRealConversas,
  type ConversaItem, type FiltroConversa, type Mensagem, type ModeloConversa, type NumeroConversa,
} from "@/components/conversas/useConversas";

/**
 * Conversas — formato WhatsApp Web para todos os números oficiais (Chakra). Plano GSS dono no comando, Fase 3.
 * Pergunta da tela: "quem está esperando resposta e o que eu respondo?". Por cima do layout do WhatsApp fica a
 * barra de números (todos ou um) e os filtros. Fora da janela de 24 h a Meta só aceita modelo aprovado.
 */

const FILTROS: { valor: FiltroConversa; rotulo: string }[] = [
  { valor: "precisa_resposta", rotulo: "Precisa de resposta" },
  { valor: "nao_lidas", rotulo: "Não lidas" },
  { valor: "todas", rotulo: "Todas" },
  { valor: "minhas", rotulo: "Minhas" },
  { valor: "sem_dono", rotulo: "Sem dono" },
];

const fone = (v: string | null | undefined) => {
  const d = String(v || "").replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(v || "");
};
const nomeConversa = (c: ConversaItem) => (c.lead?.nome ? nomeProprio(c.lead.nome) : c.contact?.contact_name || fone(c.contact?.contact_phone));
// Verde do WhatsApp escurecido: o #25d366 original com texto branco fica em 2:1 de contraste.
const BADGE = "rounded-full bg-[#008069] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums";
const iniciais = (nome: string) => nome.replace(/^(dr\.?|dra\.?)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
const horaLista = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM/yy");
};
const rotuloDia = (d: Date) => (isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR }));

async function erroDaFuncao(error: unknown): Promise<string> {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (body?.error === "approved_template_required_outside_service_window") return "A janela de 24 h fechou. Envie um modelo aprovado.";
      return body?.provider_message || body?.error || "Falha no envio.";
    } catch {
      return "Falha no envio.";
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export default function Conversas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [numeroSel, setNumeroSel] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroConversa>("precisa_resposta");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [params] = useSearchParams();
  const [conversaId, setConversaId] = useState<string | null>(params.get("conversa"));

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: numeros = [], isLoading: carregandoNumeros } = useNumerosConversa();
  const instanceIds = useMemo(() => (numeroSel ? [numeroSel] : numeros.map((n) => n.instance_id)), [numeroSel, numeros]);
  const lista = useListaConversas(instanceIds, filtro, buscaAplicada, user?.id || null);
  const conversas = useMemo(() => (lista.data?.pages || []).flat(), [lista.data]);
  const numeroPorInstancia = useMemo(() => new Map(numeros.map((n) => [n.instance_id, n])), [numeros]);
  // Conversa aberta por link pode não estar na página carregada da lista: busca a linha dela.
  const naLista = conversas.find((c) => c.id === conversaId);
  const { data: avulsa } = useQuery({
    queryKey: ["conversa-avulsa", conversaId],
    enabled: !!conversaId && !naLista && !lista.isLoading,
    queryFn: async () => {
      const { data } = await supabase.from("sigzap_conversations")
        .select("id, instance_id, lead_id, last_message_text, last_message_at, unread_count, assigned_user_id, service_window_expires_at, contact:sigzap_contacts(contact_name, contact_phone, profile_picture_url), lead:leads(nome)")
        .eq("id", conversaId as string).maybeSingle();
      return (data || null) as unknown as ConversaItem | null;
    },
  });
  const conversa = naLista || (avulsa?.id === conversaId ? avulsa : null);
  useTempoRealConversas(conversaId);

  const abrir = async (c: ConversaItem) => {
    setConversaId(c.id);
    if (c.unread_count > 0) {
      await supabase.from("sigzap_conversations").update({ unread_count: 0 }).eq("id", c.id);
      qc.invalidateQueries({ queryKey: ["conversas-numeros"] });
    }
  };

  const totalNaoLidas = numeros.reduce((s, n) => s + Number(n.nao_lidas || 0), 0);

  return (
    <AppLayout
      hideFooter
      headerActions={<div><h1 className="text-2xl font-bold">Conversas</h1><p className="text-sm text-muted-foreground">Todos os números oficiais da GSS</p></div>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <BarraNumeros numeros={numeros} carregando={carregandoNumeros} selecionado={numeroSel} total={totalNaoLidas}
          onSelecionar={(id) => { setNumeroSel(id); setConversaId(null); }} />
        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] border-t xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r bg-background">
            <div className="space-y-2 border-b p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="h-9 pl-9" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTROS.map((f) => (
                  <button key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
                    className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      filtro === f.valor ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/70")}>
                    {f.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {lista.isLoading ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando conversas…</div>
              ) : conversas.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {filtro === "precisa_resposta" ? "Ninguém esperando resposta agora." : filtro === "nao_lidas" ? "Nenhuma conversa não lida." : "Nenhuma conversa aqui."}
                </p>
              ) : (
                <ul>
                  {conversas.map((c) => (
                    <LinhaConversa key={c.id} conversa={c} ativa={c.id === conversaId} mostrarNumero={!numeroSel}
                      numero={numeroPorInstancia.get(c.instance_id)} onClick={() => abrir(c)} />
                  ))}
                </ul>
              )}
              {lista.hasNextPage && (
                <div className="p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => lista.fetchNextPage()} disabled={lista.isFetchingNextPage}>
                    {lista.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
                  </Button>
                </div>
              )}
            </div>
          </aside>
          {conversa ? (
            <JanelaConversa key={conversa.id} conversa={conversa} numero={numeroPorInstancia.get(conversa.instance_id)} userId={user?.id || null} />
          ) : (
            <div className="flex min-h-0 flex-col items-center justify-center gap-2 bg-[#f0f2f5] p-6 text-center text-muted-foreground dark:bg-[#0b141a]">
              <MessageSquareText className="h-10 w-10 opacity-40" />
              <p className="text-sm">Escolha uma conversa à esquerda.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function BarraNumeros({ numeros, carregando, selecionado, total, onSelecionar }: {
  numeros: NumeroConversa[]; carregando: boolean; selecionado: string | null; total: number; onSelecionar: (id: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2.5" role="tablist" aria-label="Números">
      <ChipNumero ativo={selecionado === null} onClick={() => onSelecionar(null)} titulo="Todos os números" naoLidas={total} />
      {carregando && <span className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Números…</span>}
      {numeros.map((n) => (
        <ChipNumero key={n.instance_id} ativo={selecionado === n.instance_id} onClick={() => onSelecionar(n.instance_id)}
          titulo={fone(n.phone_e164)} subtitulo={n.uso === "financeiro" ? "Financeiro" : n.responsavel_nome || n.display_name || ""}
          naoLidas={Number(n.nao_lidas || 0)} alerta={n.disponibilidade === "indisponivel"} />
      ))}
    </div>
  );
}

function ChipNumero({ ativo, onClick, titulo, subtitulo, naoLidas, alerta }: {
  ativo: boolean; onClick: () => void; titulo: string; subtitulo?: string; naoLidas: number; alerta?: boolean;
}) {
  return (
    <button type="button" role="tab" aria-selected={ativo} onClick={onClick}
      className={cn("flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
        ativo ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/60")}>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
          {titulo}
          {alerta && <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-label="Número com problema" />}
        </span>
        {subtitulo && <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">{subtitulo}</span>}
      </span>
      {naoLidas > 0 && (
        <span className={BADGE}>
          {naoLidas > 999 ? "999+" : naoLidas}
        </span>
      )}
    </button>
  );
}

function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className?: string }) {
  const [erro, setErro] = useState(false);
  return foto && !erro ? (
    <img src={foto} alt="" onError={() => setErro(true)} className={cn("shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-xs font-semibold text-[#54656f] dark:bg-[#374248] dark:text-[#aebac1]", className)}>
      {iniciais(nome)}
    </span>
  );
}

function LinhaConversa({ conversa, ativa, numero, mostrarNumero, onClick }: {
  conversa: ConversaItem; ativa: boolean; numero?: NumeroConversa; mostrarNumero: boolean; onClick: () => void;
}) {
  const nome = nomeConversa(conversa);
  return (
    <li>
      <button type="button" onClick={onClick}
        className={cn("flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50", ativa && "bg-muted")}>
        <Avatar nome={nome} foto={conversa.contact?.profile_picture_url} className="h-11 w-11" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{nome}</span>
            <span className={cn("shrink-0 text-[11px] tabular-nums", conversa.unread_count > 0 ? "font-semibold text-[#1fa855]" : "text-muted-foreground")}>
              {horaLista(conversa.last_message_at)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{conversa.last_message_text || "—"}</span>
            {conversa.unread_count > 0 && (
              <span className={cn("shrink-0", BADGE)}>{conversa.unread_count}</span>
            )}
          </span>
          {mostrarNumero && numero && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">pelo {fone(numero.phone_e164)}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function JanelaConversa({ conversa, numero, userId }: { conversa: ConversaItem; numero?: NumeroConversa; userId: string | null }) {
  const qc = useQueryClient();
  const msgs = useMensagens(conversa.id);
  const mensagens = useMemo(() => (msgs.data?.pages || []).flat().slice().reverse(), [msgs.data]);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const [texto, setTexto] = useState("");
  const nome = nomeConversa(conversa);

  const ultimaDoMedico = [...mensagens].reverse().find((m) => !m.from_me)?.sent_at;
  const janelaAberta = (conversa.service_window_expires_at && new Date(conversa.service_window_expires_at).getTime() > Date.now())
    || (!!ultimaDoMedico && Date.now() - new Date(ultimaDoMedico).getTime() < 24 * 3600 * 1000);
  const minha = conversa.assigned_user_id === userId;
  const { data: modelos = [] } = useModelosConversa(conversa.id, !janelaAberta);

  const ultimoId = mensagens[mensagens.length - 1]?.id;
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [ultimoId]);

  const posEnvio = async () => {
    // Quem responde pela tela assume a conversa: a IA da campanha para de falar com esse médico.
    if (!minha) await (supabase as any).rpc("conversa_assumir", { p_conversation_id: conversa.id });
    qc.invalidateQueries({ queryKey: ["conversas-mensagens", conversa.id] });
    qc.invalidateQueries({ queryKey: ["conversas-lista"] });
  };

  const enviarTexto = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-oficial-send", { body: { conversation_id: conversa.id, body: texto.trim() } });
      if (error) throw new Error(await erroDaFuncao(error));
      if ((data as { ok?: boolean; error?: string })?.ok === false) throw new Error((data as { error?: string }).error);
    },
    onSuccess: async () => { setTexto(""); await posEnvio(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarModelo = useMutation({
    mutationFn: async ({ modelo, valores }: { modelo: ModeloConversa; valores: Record<string, string> }) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-oficial-send", {
        body: { conversation_id: conversa.id, template_id: modelo.template_id, template_variables: valores },
      });
      if (error) throw new Error(await erroDaFuncao(error));
      if ((data as { ok?: boolean; error?: string })?.ok === false) throw new Error((data as { error?: string }).error);
    },
    onSuccess: async () => { toast.success("Modelo enviado."); await posEnvio(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assumir = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("conversa_assumir", { p_conversation_id: conversa.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conversa é sua. A IA não responde mais este médico."); qc.invalidateQueries({ queryKey: ["conversas-lista"] }); },
    onError: () => toast.error("Não consegui assumir a conversa."),
  });

  let diaAnterior = "";
  return (
    <section className="flex min-h-0 flex-col bg-[#efeae2] dark:bg-[#0b141a]">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2.5">
        <Avatar nome={nome} foto={conversa.contact?.profile_picture_url} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {fone(conversa.contact?.contact_phone)}{numero ? ` · pelo ${fone(numero.phone_e164)}` : ""}
          </p>
        </div>
        {minha ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><UserCheck className="h-4 w-4" /> Sua conversa</span>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => assumir.mutate()} disabled={assumir.isPending}>
            <UserCheck className="mr-1.5 h-4 w-4" /> Assumir
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[6%] py-4">
        {msgs.hasNextPage && (
          <div className="mb-3 text-center">
            <Button size="sm" variant="secondary" onClick={() => msgs.fetchNextPage()} disabled={msgs.isFetchingNextPage}>
              {msgs.isFetchingNextPage ? "Carregando…" : "Ver mensagens anteriores"}
            </Button>
          </div>
        )}
        {msgs.isLoading && <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {mensagens.map((m) => {
          const dia = rotuloDia(new Date(m.sent_at));
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={m.id}>
              {separador && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-md bg-white/90 px-3 py-1 text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">{dia}</span>
                </div>
              )}
              <Balao mensagem={m} />
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      <footer className="border-t bg-[#f0f2f5] px-4 py-3 dark:bg-[#202c33]">
        {janelaAberta ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviarTexto.mutate(); }}>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem" rows={1}
              className="max-h-40 min-h-10 resize-none bg-background"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviarTexto.mutate(); } }} />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={!texto.trim() || enviarTexto.isPending} aria-label="Enviar">
              {enviarTexto.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              {ultimaDoMedico ? "O médico não escreve há mais de 24 h." : "O médico ainda não respondeu."} A Meta só deixa mandar um modelo aprovado.
            </p>
            <EscolherModelo modelos={modelos} nome={nome} enviando={enviarModelo.isPending}
              onEnviar={(modelo, valores) => enviarModelo.mutate({ modelo, valores })} />
          </div>
        )}
      </footer>
    </section>
  );
}

function Balao({ mensagem: m }: { mensagem: Mensagem }) {
  const falhou = m.message_status === "failed";
  const conteudo = (() => {
    const url = m.media_url;
    switch (m.message_type) {
      case "image":
      case "sticker":
        return url ? <img src={url} alt="Imagem" className={cn("rounded-md", m.message_type === "sticker" ? "h-32 w-32 object-contain" : "max-h-72 max-w-full")} /> : <i className="text-muted-foreground">Imagem não baixada</i>;
      case "audio":
        return url ? <SigZapAudioPlayer src={url} isFromMe={m.from_me} /> : <i className="text-muted-foreground">Áudio não baixado</i>;
      case "video":
        return url ? <SigZapVideoPlayer src={url} isFromMe={m.from_me} /> : <i className="text-muted-foreground">Vídeo não baixado</i>;
      case "document":
        return url ? <SigZapDocumentCard url={url} filename={m.media_filename || "Documento"} mimeType={m.media_mime_type || undefined} isFromMe={m.from_me} />
          : <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> {m.media_filename || "Documento"}</span>;
      default:
        return null;
    }
  })();
  const legenda = conteudo ? m.media_caption : m.message_text;
  return (
    <div className={cn("mb-1 flex", m.from_me ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-lg px-2.5 pb-1 pt-1.5 text-sm shadow-sm",
        m.from_me ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "rounded-tl-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]")}>
        {m.quoted_message_text && (
          <div className="mb-1 rounded border-l-4 border-[#06cf9c] bg-black/5 px-2 py-1 text-xs opacity-80">{m.quoted_message_text}</div>
        )}
        {conteudo}
        {legenda && <p className="whitespace-pre-wrap break-words">{legenda}</p>}
        {!conteudo && !legenda && <i className="text-muted-foreground">Mensagem sem texto ({m.message_type || "desconhecida"})</i>}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#667781] dark:text-[#8696a0]">
          {format(new Date(m.sent_at), "HH:mm")}
          {m.from_me && (falhou ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            : m.message_status === "read" ? <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
            : m.message_status === "delivered" ? <CheckCheck className="h-3.5 w-3.5" />
            : <Check className="h-3.5 w-3.5" />)}
        </span>
        {falhou && <p className="text-[11px] text-red-600">Não entregue{m.provider_error_message ? `: ${motivoLegivel(m.provider_error_message)}` : ""}</p>}
      </div>
    </div>
  );
}

function EscolherModelo({ modelos, nome, enviando, onEnviar }: {
  modelos: ModeloConversa[]; nome: string; enviando: boolean; onEnviar: (m: ModeloConversa, valores: Record<string, string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<ModeloConversa | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const posicoes = Object.keys(escolhido?.variables || {}).sort((a, b) => Number(a) - Number(b));
  const primeiroNome = nome.replace(/^(dr\.?|dra\.?)\s+/i, "").split(/\s+/)[0] || "";

  const escolher = (m: ModeloConversa) => {
    setEscolhido(m);
    const pos = Object.keys(m.variables || {}).sort((a, b) => Number(a) - Number(b));
    setValores(Object.fromEntries(pos.map((p, i) => [p, i === 0 ? primeiroNome : ""])));
  };
  const previa = escolhido ? escolhido.body.replace(/\{\{(\d+)\}\}/g, (_x, p) => valores[p] || `{{${p}}}`) : "";
  const completo = posicoes.every((p) => (valores[p] || "").trim());

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={modelos.length === 0} title={modelos.length === 0 ? "Este número não tem modelo aprovado" : undefined}>
          Enviar modelo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] space-y-3">
        <p className="text-sm font-medium">Modelos aprovados deste número</p>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {modelos.map((m) => (
            <button key={m.template_id} type="button" onClick={() => escolher(m)}
              className={cn("w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted/60", escolhido?.template_id === m.template_id && "border-primary bg-primary/5")}>
              <span className="block truncate font-medium">{nomeModelo(m.friendly_name)}</span>
              <span className="block truncate text-muted-foreground">{trechoModelo(m.body)}</span>
            </button>
          ))}
        </div>
        {escolhido && (
          <>
            {posicoes.map((p) => (
              <Input key={p} value={valores[p] || ""} onChange={(e) => setValores({ ...valores, [p]: e.target.value })}
                placeholder={`Campo ${p} (ex.: ${escolhido.variables?.[p] || "texto"})`} className="h-8 text-sm" />
            ))}
            <p className="whitespace-pre-wrap rounded-md bg-[#d9fdd3] p-2 text-xs text-[#111b21]">{previa}</p>
            <Button className="w-full" disabled={!completo || enviando} onClick={() => { onEnviar(escolhido, valores); setAberto(false); }}>
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
