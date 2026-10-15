import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Sparkles, ArrowDownToLine, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

/**
 * Análise de edital pelo modelo do Gem da Bianca (T6; modelo dela aplicado em 15/10). A IA lê os PDFs do
 * card (termo de referência e edital primeiro) e escreve nas 5 partes do Gem: dados do edital, precificação,
 * análise geográfica, alertas de risco e apontamentos para esclarecimento, com item e página em cada informação. A análise fica guardada com histórico (licitacao_analises); a equipe
 * decide se leva para a "Decorrência de Análise". A IA apoia, a decisão é da equipe (Ramone, 50:27).
 */
type Analise = {
  id: string; status: "processando" | "pronta" | "erro"; html: string | null; faltou: string[];
  anexos: { nome: string }[]; erro: string | null; criado_em: string; concluido_em: string | null;
};

export function LicitacaoAnaliseEdital({ licitacaoId, onInserir }: { licitacaoId: string; onInserir: (html: string) => Promise<void> | void }) {
  const qc = useQueryClient();
  const [pedindo, setPedindo] = useState(false);
  const [aberta, setAberta] = useState(true);
  const chave = ["licitacao-analises", licitacaoId];

  const { data: analises = [] } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("licitacao_analises")
        .select("id, status, html, faltou, anexos, erro, criado_em, concluido_em")
        .eq("licitacao_id", licitacaoId).order("criado_em", { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as Analise[];
    },
    // enquanto a IA trabalha, confere a cada 5 s
    refetchInterval: (q) => ((q.state.data as Analise[] | undefined)?.[0]?.status === "processando" ? 5000 : false),
  });
  // o servidor encerra a IA que passa do tempo sem gravar o erro; depois de 6 min a tela trata como erro
  const travada = analises[0]?.status === "processando" && Date.now() - new Date(analises[0].criado_em).getTime() > 6 * 60 * 1000;
  const atual = travada ? { ...analises[0], status: "erro" as const, erro: "a leitura demorou demais. Tente de novo; se repetir, anexe só o termo de referência e o edital." } : analises[0];
  const processando = atual?.status === "processando";

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

  const inserir = async () => {
    if (!atual?.html) return;
    const cab = `<p><b>Análise do edital (IA, modelo GSS) · ${format(new Date(atual.concluido_em || atual.criado_em), "dd/MM/yyyy HH:mm")}</b></p>`;
    await onInserir(cab + atual.html);
    toast.success("Análise levada para a Decorrência de Análise");
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">Análise do edital</span>
        <span className="text-[10px] text-muted-foreground">— IA no modelo do Gem da Bianca, com item e página do edital em cada ponto</span>
        <div className="ml-auto flex items-center gap-1.5">
          {atual?.status === "pronta" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={inserir}>
              <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Levar para a Decorrência
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={pedir} disabled={pedindo || processando}>
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
          <div
            className="text-sm prose prose-sm max-w-none bg-background rounded-md p-3 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_.fonte]:text-[11px] [&_.fonte]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_td]:text-xs [&_th]:border [&_th]:border-border [&_th]:p-1.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-muted/50"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(atual.html || "") }}
          />
          {atual.faltou?.length > 0 && (
            <div className="text-xs rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2">
              <b>O edital não informa:</b> {atual.faltou.join("; ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
