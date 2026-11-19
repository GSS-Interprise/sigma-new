import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Sparkles, ArrowDownToLine, AlertTriangle, ChevronDown, ChevronUp, Pencil, Undo2, Redo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { EditorComGrifo, GRIFO_EQUIPE, type EditorComGrifoRef } from "./EditorComGrifo";
import { temConteudo } from "./pendenciasAoFechar";

/**
 * Análise de edital pelo modelo do Gem da Bianca (T6; modelo dela aplicado em 15/10). A IA lê os PDFs do
 * card (termo de referência e edital primeiro) e escreve nas 5 partes do Gem: dados do edital, precificação,
 * análise geográfica, alertas de risco e apontamentos para esclarecimento, com item e página em cada informação. A análise fica guardada com histórico (licitacao_analises); a equipe
 * decide se leva para a "Decorrência de Análise". A IA apoia, a decisão é da equipe (Ramone, 50:27).
 */
type Analise = {
  id: string; status: "processando" | "pronta" | "erro"; html: string | null; faltou: string[];
  anexos: { nome: string }[]; erro: string | null; criado_em: string; concluido_em: string | null;
  // correção da equipe (18/11): o original da IA continua em `html`
  html_editado: string | null; editado_em: string | null; editor: { nome_completo: string | null } | null;
};

const CAIXA_DO_TEXTO =
  "text-sm prose prose-sm max-w-none bg-background rounded-md p-3 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_.fonte]:text-[11px] [&_.fonte]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_td]:text-xs [&_th]:border [&_th]:border-border [&_th]:p-1.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-muted/50";

/** HTML como o navegador o escreve de volta: o editor devolve `innerHTML`, que pode diferir do texto salvo só na forma. */
function comoNoEditor(html: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = sanitizeHtml(html);
  return caixa.innerHTML;
}

/**
 * Usado pelo card antes de fechar (Luiz, 19/11: a correção sumia ao fechar o card sem clicar em Salvar).
 * `temPendente` diz se há correção em andamento com mudança; `salvarPendente` grava (erro sobe para o card não fechar).
 */
export type LicitacaoAnaliseEditalRef = {
  temPendente: () => boolean;
  salvarPendente: () => Promise<boolean>;
};

export const LicitacaoAnaliseEdital = forwardRef<LicitacaoAnaliseEditalRef, {
  licitacaoId: string;
  onInserir: (html: string) => Promise<void> | void;
}>(function LicitacaoAnaliseEdital({ licitacaoId, onInserir }, refExterno) {
  const qc = useQueryClient();
  const [pedindo, setPedindo] = useState(false);
  const [aberta, setAberta] = useState(true);
  const [corrigindo, setCorrigindo] = useState(false);
  const [rascunho, setRascunho] = useState("");
  // texto ao clicar em Corrigir: base para saber se há mudança a gravar ao fechar o card
  const [baseCorrecao, setBaseCorrecao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verOriginal, setVerOriginal] = useState(false);
  const editorRef = useRef<EditorComGrifoRef>(null);
  const [historico, setHistorico] = useState({ podeDesfazer: false, podeRefazer: false });
  const chave = ["licitacao-analises", licitacaoId];

  const { data: analises = [] } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("licitacao_analises")
        .select("id, status, html, faltou, anexos, erro, criado_em, concluido_em, html_editado, editado_em, editado_por")
        .eq("licitacao_id", licitacaoId).order("criado_em", { ascending: false }).limit(5);
      if (error) throw error;
      // nome de quem corrigiu (editado_por aponta para auth.users; o nome mora em profiles)
      const ids = [...new Set((data ?? []).map((a: any) => a.editado_por).filter(Boolean))];
      const nomes = new Map<string, string | null>();
      if (ids.length) {
        const { data: perfis } = await supabase.from("profiles").select("id, nome_completo").in("id", ids as string[]);
        (perfis ?? []).forEach((p: any) => nomes.set(p.id, p.nome_completo));
      }
      return (data ?? []).map((a: any) => ({
        ...a, editor: a.editado_por ? { nome_completo: nomes.get(a.editado_por) ?? null } : null,
      })) as Analise[];
    },
    // enquanto a IA trabalha, confere a cada 5 s
    refetchInterval: (q) => ((q.state.data as Analise[] | undefined)?.[0]?.status === "processando" ? 5000 : false),
  });
  // o servidor encerra a IA que passa do tempo sem gravar o erro; depois de 6 min a tela trata como erro
  const travada = analises[0]?.status === "processando" && Date.now() - new Date(analises[0].criado_em).getTime() > 6 * 60 * 1000;
  const atual = travada ? { ...analises[0], status: "erro" as const, erro: "a leitura demorou demais. Tente de novo; se repetir, anexe só o termo de referência e o edital." } : analises[0];
  const processando = atual?.status === "processando";
  // o que vale para a equipe: a versão corrigida, quando existe
  const htmlVigente = atual?.html_editado || atual?.html || "";

  // html vazio = volta para o texto da IA (a correção salva é descartada; o original nunca foi alterado)
  const gravarCorrecao = async (analiseId: string, html: string) => {
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("licitacao_analise_salvar_edicao", { p_analise_id: analiseId, p_html: html });
      if (error) throw error;
      setCorrigindo(false);
      setVerOriginal(false);
      // a reabertura do card lê do banco, não do cache antigo
      await qc.invalidateQueries({ queryKey: chave });
    } finally {
      setSalvando(false);
    }
  };

  const salvarCorrecao = async (html = rascunho) => {
    if (!atual) return;
    try {
      await gravarCorrecao(atual.id, html);
      toast.success(html ? "Correção salva. O que a equipe escreveu aparece grifado em amarelo." : "Voltou para o texto original da IA.");
    } catch (e: any) {
      toast.error(`Não salvei a correção: ${e.message}`);
    }
  };

  const temPendente = () =>
    corrigindo && atual?.status === "pronta" && !salvando &&
    // apagar tudo e fechar não pode virar "voltar ao texto da IA": isso só pelo botão, com confirmação
    temConteudo(rascunho) &&
    comoNoEditor(rascunho) !== comoNoEditor(baseCorrecao);

  useImperativeHandle(refExterno, () => ({
    temPendente,
    salvarPendente: async () => {
      if (!atual || !temPendente()) return false;
      await gravarCorrecao(atual.id, rascunho);
      return true;
    },
  }));

  const pedir = async () => {
    setPedindo(true);
    try {
      const { data, error } = await supabase.functions.invoke("licitacao-analise-edital", { body: { licitacao_id: licitacaoId } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Não foi possível pedir a análise");
      toast.success("Análise pedida. A IA leva de 1 a 3 minutos para ler o edital.");
      qc.invalidateQueries({ queryKey: chave });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPedindo(false);
    }
  };

  const cancelarCorrecao = () => {
    if (historico.podeDesfazer && !window.confirm("Descartar as mudanças que você fez? O texto volta a ficar como estava.")) return;
    setCorrigindo(false);
  };

  const voltarAoOriginal = () => {
    if (!window.confirm("Voltar para o texto original da IA? A correção da equipe será apagada.")) return;
    salvarCorrecao("");
  };

  const inserir = async () => {
    if (!htmlVigente || !atual) return;
    const cab = `<p><b>Análise do edital (IA, modelo GSS${atual.html_editado ? ", corrigida pela equipe" : ""}) · ${format(new Date(atual.concluido_em || atual.criado_em), "dd/MM/yyyy HH:mm")}</b></p>`;
    await onInserir(cab + htmlVigente);
    toast.success("Análise levada para a Decorrência de Análise");
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">Análise do edital</span>
        <span className="text-[10px] text-muted-foreground">— IA no modelo do Gem da Bianca, com item e página do edital em cada ponto</span>
        <div className="ml-auto flex items-center gap-1.5">
          {atual?.status === "pronta" && !corrigindo && (
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => { setRascunho(htmlVigente); setBaseCorrecao(htmlVigente); setHistorico({ podeDesfazer: false, podeRefazer: false }); setCorrigindo(true); setAberta(true); setVerOriginal(false); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Corrigir texto
            </Button>
          )}
          {atual?.status === "pronta" && !corrigindo && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={inserir}>
              <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Levar para a Decorrência
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={pedir} disabled={pedindo || processando || corrigindo}>
            {pedindo || processando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {processando ? "Lendo o edital…" : atual ? "Analisar de novo" : "Analisar edital"}
          </Button>
          {atual?.status === "pronta" && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAberta((v) => !v)} title={aberta ? "Recolher" : "Mostrar"}>
              {aberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {!atual && (
        <p className="text-xs text-muted-foreground">
          Anexe o edital e o termo de referência em PDF e clique em Analisar edital. A IA lê até 3 arquivos (até 30 MB) e não inventa: o que o edital não informa aparece como "Não consta no edital".
        </p>
      )}
      {processando && <p className="text-xs text-muted-foreground">A IA está lendo o edital. Pode continuar usando o card; a análise aparece aqui sozinha.</p>}
      {atual?.status === "erro" && (
        <p className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Não deu para analisar: {atual.erro}</p>
      )}
      {atual?.status === "pronta" && aberta && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Lido em {format(new Date(atual.concluido_em || atual.criado_em), "dd/MM/yyyy HH:mm")} · arquivos: {atual.anexos.map((a) => a.nome).join(", ")}. Confira cada ponto no edital antes de decidir.
          </p>
          {corrigindo ? (
            <>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Clique no texto e corrija. O que você escrever fica <mark className="bg-amber-200 dark:bg-amber-500/40 text-foreground rounded-sm px-0.5">grifado em amarelo</mark>.
              </p>
              <EditorComGrifo
                ref={editorRef}
                htmlInicial={sanitizeHtml(rascunho)}
                onChange={setRascunho}
                onHistorico={setHistorico}
                className={`${CAIXA_DO_TEXTO} ${GRIFO_EQUIPE} outline-none ring-2 ring-amber-300 focus:ring-amber-400`}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" title="Desfazer (Ctrl+Z)"
                  onClick={() => editorRef.current?.desfazer()} disabled={!historico.podeDesfazer || salvando}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" title="Refazer (Ctrl+Y)"
                  onClick={() => editorRef.current?.refazer()} disabled={!historico.podeRefazer || salvando}>
                  <Redo2 className="h-3.5 w-3.5 mr-1" /> Refazer
                </Button>
                <span className="ml-auto" />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelarCorrecao} disabled={salvando}>Cancelar</Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => salvarCorrecao()} disabled={salvando}>
                  {salvando && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Salvar correção
                </Button>
              </div>
            </>
          ) : (
            <>
              {atual.html_editado && (
                <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1">
                  <span>
                    Corrigida por {atual.editor?.nome_completo || "alguém da equipe"}
                    {atual.editado_em ? ` em ${format(new Date(atual.editado_em), "dd/MM/yyyy HH:mm")}` : ""}.
                    {" "}Em amarelo, o que a equipe escreveu.
                  </span>
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setVerOriginal((v) => !v)}>
                    {verOriginal ? "Ver a versão corrigida" : "Ver o original da IA"}
                  </button>
                  <span aria-hidden>·</span>
                  <button type="button" className="underline underline-offset-2 hover:text-foreground disabled:opacity-50" onClick={voltarAoOriginal} disabled={salvando}>
                    Voltar ao texto da IA
                  </button>
                </p>
              )}
              <div
                className={`${CAIXA_DO_TEXTO} ${GRIFO_EQUIPE}`}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(verOriginal ? atual.html || "" : htmlVigente) }}
              />
            </>
          )}
          {atual.faltou?.length > 0 && (
            <div className="text-xs rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2">
              <b>O edital não informa:</b> {atual.faltou.join("; ")}
            </div>
          )}
        </>
      )}
    </div>
  );
});
