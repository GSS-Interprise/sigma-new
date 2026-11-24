// Assistente de IA do Sigma (docs/arquitetura/assistente-ia-sigma.md, T5, 21/11/2026).
// Pergunta da tela: "o que eu quero saber ou mudar no Sigma agora?" Quem usa: só a lista de assistente_liberados
// (Configurações › Agente do Sigma); cada uma só recebe resposta do que já vê nas telas. Decisão principal: confirmar
// ou descartar a proposta que a IA montou. A IA nunca grava: a edge sigma-assistente monta uma proposta e só o clique
// em Confirmar chama assistente_confirmar, com o login da pessoa.
// Robô redondo no canto inferior direito, dentro do rodapé do AppLayout (ali não cobre botão de tela), e atalho Ctrl+J.
// Responde conforme a tela: dentro de uma campanha (?campanha=<id>), pergunta sem campanha citada é sobre ela.
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Loader2, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Linha = { rotulo: string; antes: string | null; depois: string };
type Proposta = { id: string; tipo: "criar_campanha" | "editar_campanha"; resumo: { titulo: string; linhas: Linha[]; aviso?: string } };
type Msg = {
  id: string; papel: "usuario" | "assistente"; texto: string; proposta?: Proposta | null;
  decisao?: { estado: "confirmando" | "confirmada" | "descartada" | "erro"; texto?: string; campanhaId?: string };
};

const SUGESTOES: { rota: RegExp; itens: string[] }[] = [
  { rota: /^\/(prospeccao|campanhas|disparos)/, itens: ["Como estão as campanhas ativas?", "Quantos médicos receberam mensagem hoje?", "Quero criar uma campanha nova"] },
  { rota: /^\/contratos/, itens: ["Quais contratos vencem nos próximos 60 dias?", "Como estão os contratos?", "Quanto cobramos de ultrassonografia?"] },
  { rota: /^\/licitacoes/, itens: ["Quais disputas temos esta semana?", "Chegou licitação nova hoje?", "Como está o quadro de licitações?"] },
  { rota: /^\/(bi|escalas|radiologia)/,itens: ["Onde tem furo na escala esta semana?", "Quem está de plantão no CEPON amanhã?", "Como estão as campanhas ativas?"] },
  { rota: /.*/, itens: ["Como estão as campanhas ativas?", "Onde tem furo na escala esta semana?", "Quero criar uma campanha nova"] },
];
const SUGESTOES_CAMPANHA = ["Quantos disparos esta campanha teve hoje?", "Como está o funil desta campanha?", "Quantos médicos desta campanha estão em atendimento?"];

/** Campanha aberta na tela: ?campanha=<id> da Prospecção ou a rota antiga de propostas (mesma regra da edge). */
function campanhaDaTela(pathname: string, search: string): string | null {
  const id = new URLSearchParams(search).get("campanha") ?? pathname.match(/^\/disparos\/campanhas\/([^/]+)\/propostas/)?.[1] ?? null;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// Markdown mínimo da resposta (negrito, listas, parágrafos), montado como elementos React: nada vira HTML cru.
function negrito(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p.replace(/_([^_]+)_/g, "$1")}</Fragment>));
}
function Texto({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) blocos.push(<ul key={`l${blocos.length}`} className="ml-4 list-disc space-y-0.5">{lista.map((l, i) => <li key={i}>{negrito(l)}</li>)}</ul>);
    lista = [];
  };
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^\s*[-*•]\s+(.*)$/);
    if (m) { lista.push(m[1]); continue; }
    fecharLista();
    if (linha.trim()) blocos.push(<p key={`p${blocos.length}`}>{negrito(linha)}</p>);
  }
  fecharLista();
  return <div className="space-y-2 break-words">{blocos}</div>;
}

function CartaoProposta({ m, onConfirmar, onDescartar }: { m: Msg; onConfirmar: () => void; onDescartar: () => void }) {
  const navigate = useNavigate();
  const p = m.proposta!;
  const d = m.decisao;
  return (
    <div className="mt-2 rounded-md border bg-card p-3 text-sm">
      <p className="font-semibold">{p.resumo.titulo}</p>
      <dl className="mt-2 space-y-1.5">
        {p.resumo.linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2">
            <dt className="text-muted-foreground">{l.rotulo}</dt>
            <dd className="min-w-0 break-words">
              {l.antes !== null && <span className="text-muted-foreground line-through decoration-muted-foreground/60">{l.antes}</span>}
              {l.antes !== null && <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" aria-label="passa para" />}
              <span className="font-medium">{l.depois}</span>
            </dd>
          </div>
        ))}
      </dl>
      {p.resumo.aviso && <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">{p.resumo.aviso}</p>}
      {!d && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDescartar}>Descartar</Button>
          <Button size="sm" onClick={onConfirmar}>Confirmar</Button>
        </div>
      )}
      {d?.estado === "confirmando" && <p className="mt-3 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Gravando…</p>}
      {d?.estado === "descartada" && <p className="mt-3 text-muted-foreground">Descartada. Nada foi mudado.</p>}
      {d?.estado === "erro" && <p className="mt-3 text-red-700">{d.texto}</p>}
      {d?.estado === "confirmada" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-emerald-700">{d.texto}</p>
          {d.campanhaId && <Button variant="outline" size="sm" onClick={() => navigate(`/prospeccao?campanha=${d.campanhaId}`)}>Abrir campanha</Button>}
        </div>
      )}
    </div>
  );
}

const ERRO_RPC: Record<string, string> = {
  sem_permissao: "Você não tem acesso a isso.",
  proposta_expirada: "A proposta venceu (2 h). Peça de novo ao assistente.",
  proposta_ja_decidida: "Essa proposta já foi decidida.",
  modelo_nao_aprovado_em_algum_numero: "Um dos números não tem esse modelo aprovado. Peça outro número ou modelo.",
};
const erroLegivel = (m: string) => Object.entries(ERRO_RPC).find(([k]) => m.includes(k))?.[1] ?? `Não gravou: ${m}`;

export function AssistenteSigma() {
  const { pathname, search } = useLocation();
  const campanhaId = campanhaDaTela(pathname, search);
  const { data: campanhaNome } = useQuery({
    queryKey: ["assistente-campanha-nome", campanhaId],
    enabled: !!campanhaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("campanhas").select("nome").eq("id", campanhaId!).maybeSingle();
      return (data?.nome as string | undefined)?.trim() ?? null;
    },
  });
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const sugestoes = useMemo(
    () => (campanhaId ? SUGESTOES_CAMPANHA : SUGESTOES.find((s) => s.rota.test(pathname))!.itens),
    [pathname, campanhaId],
  );

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setAberto((a) => !a); }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, enviando]);
  useEffect(() => { if (aberto) setTimeout(() => campo.current?.focus(), 50); }, [aberto]);

  const muda = (id: string, p: Partial<Msg>) => setMsgs((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function enviar(t: string) {
    const mensagem = t.trim();
    if (!mensagem || enviando) return;
    setTexto("");
    setMsgs((ms) => [...ms, { id: crypto.randomUUID(), papel: "usuario", texto: mensagem }]);
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("sigma-assistente", { body: { mensagem, conversa_id: conversaId, pagina: pathname + search, campanha_id: campanhaId } });
      if (error) throw error;
      setConversaId(data.conversa_id);
      setMsgs((ms) => [...ms, { id: crypto.randomUUID(), papel: "assistente", texto: data.texto, proposta: data.proposta }]);
    } catch (e) {
      setMsgs((ms) => [...ms, { id: crypto.randomUUID(), papel: "assistente", texto: `Não consegui responder agora (${(e as Error).message}). Tente de novo.` }]);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(m: Msg) {
    muda(m.id, { decisao: { estado: "confirmando" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos tipos gerados
    const { data, error } = await (supabase as any).rpc("assistente_confirmar", { p_proposta_id: m.proposta!.id });
    if (error || !data?.ok) { muda(m.id, { decisao: { estado: "erro", texto: erroLegivel(error?.message || data?.erro || "erro") } }); return; }
    const r = data.resultado ?? {};
    const textoOk = m.proposta!.tipo === "criar_campanha"
      ? `Campanha criada ${r.status === "ativa" ? "e disparando" : "pausada"} com ${Number(r.leads ?? 0).toLocaleString("pt-BR")} médicos.`
      : "Feito. A campanha já está com as mudanças.";
    muda(m.id, { decisao: { estado: "confirmada", texto: textoOk, campanhaId: r.campanha_id } });
  }

  async function descartar(m: Msg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos tipos gerados
    await (supabase as any).rpc("assistente_descartar", { p_proposta_id: m.proposta!.id });
    muda(m.id, { decisao: { estado: "descartada" } });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" className="h-10 w-10 shrink-0 rounded-full shadow-md" onClick={() => setAberto(true)} aria-label="Perguntar ao Sigma (Ctrl+J)">
            <Bot className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Perguntar ao Sigma (Ctrl+J)</TooltipContent>
      </Tooltip>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" />Assistente do Sigma</SheetTitle>
              {msgs.length > 0 && (
                <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={enviando} onClick={() => { setMsgs([]); setConversaId(null); }}>
                  <RotateCcw className="h-3.5 w-3.5" />Nova conversa
                </Button>
              )}
            </div>
            <SheetDescription className="text-xs">
              {campanhaId
                ? <>Respondendo sobre a campanha <span className="font-medium text-foreground">{campanhaNome ?? "aberta"}</span>. Para outra, cite o nome.</>
                : "Responde com os dados do Sigma que você já vê. Mudança só com o seu clique."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">Pergunte sobre campanhas, escalas e licitações, ou peça para criar ou mudar uma campanha.</p>
                {sugestoes.map((s) => (
                  <button key={s} type="button" onClick={() => enviar(s)}
                    className="block w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.papel === "usuario" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[92%] rounded-lg px-3 py-2", m.papel === "usuario" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {m.papel === "usuario" ? <p className="whitespace-pre-wrap break-words">{m.texto}</p> : <Texto texto={m.texto} />}
                  {m.proposta && <CartaoProposta m={m} onConfirmar={() => confirmar(m)} onDescartar={() => descartar(m)} />}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando o Sigma…</div>
            )}
            <div ref={fim} />
          </div>

          <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
            <Textarea ref={campo} value={texto} rows={2} maxLength={2000} placeholder="Escreva sua pergunta…" className="min-h-[44px] resize-none"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={enviando || !texto.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
