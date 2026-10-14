import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArchiveRestore, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * Arquivados do quadro da GSS (T2 de docs/arquitetura/licitacoes-contratos-gss.md).
 * Nada é excluído: o card sai do quadro 30 dias depois da última data, ou na hora quando vai
 * para descarte, "não ganhamos" ou fracassado. Aqui a equipe acha qualquer edital antigo pelo
 * número, cidade ou órgão (o mesmo edital pode voltar meses depois) e reabre com um clique.
 */
const MOTIVO: Record<string, string> = {
  prazo: "30 dias após a última data", descarte_edital: "descartado", nao_ganhamos: "não ganhamos", fracassado: "fracassado",
};
const POR_PAGINA = 50;
const dataBr = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

export function LicitacoesArquivadasDialog({ open, onOpenChange, onAbrir }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAbrir: (licitacao: any) => void;
}) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(0);
  const [reabrindo, setReabrindo] = useState<string | null>(null);

  // espera a pessoa parar de digitar antes de buscar
  useEffect(() => { const t = setTimeout(() => { setTermo(busca.trim()); setPagina(0); }, 350); return () => clearTimeout(t); }, [busca]);

  const { data, isLoading } = useQuery({
    queryKey: ["licitacoes-arquivadas", termo, pagina],
    enabled: open,
    queryFn: async () => {
      let q = (supabase as any).from("licitacoes")
        .select("id,titulo,numero_edital,orgao,status,valor_estimado,data_disputa,municipio_uf,tipo_modalidade,responsavel_id,etiquetas,prioridade,arquivado_em,arquivado_motivo", { count: "exact" })
        .eq("board", "effecti").eq("empresa", "GSS").not("arquivado_em", "is", null)
        .order("arquivado_em", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (termo) {
        const t = termo.replace(/[%,()]/g, " ");
        q = q.or(`titulo.ilike.%${t}%,numero_edital.ilike.%${t}%,orgao.ilike.%${t}%,municipio_uf.ilike.%${t}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  const reabrir = async (l: any) => {
    setReabrindo(l.id);
    const { error } = await (supabase as any).from("licitacoes").update({ arquivado_em: null, arquivado_motivo: null }).eq("id", l.id);
    setReabrindo(null);
    if (error) return toast.error("Não reabriu: " + error.message);
    toast.success("Edital de volta ao quadro.");
    qc.invalidateQueries({ queryKey: ["licitacoes-arquivadas"] });
    qc.invalidateQueries({ queryKey: ["licitacoes-kanban"] });
  };

  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editais arquivados</DialogTitle>
          <DialogDescription>
            Saem do quadro 30 dias depois da última data, ou na hora quando vão para descarte, "não ganhamos" ou fracassado. Nada é apagado.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número do edital, cidade ou órgão" className="pl-8" autoFocus />
        </div>
        <p className="text-xs text-muted-foreground">{isLoading ? "Buscando…" : `${total.toLocaleString("pt-BR")} edital(is) arquivado(s)${termo ? ` com "${termo}"` : ""}.`}</p>

        <div className="divide-y rounded-md border">
          {isLoading ? <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            : !(data?.linhas.length) ? <p className="py-8 text-center text-sm text-muted-foreground">Nada encontrado.</p>
            : data!.linhas.map((l) => (
              <div key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { onAbrir(l); onOpenChange(false); }}>
                  <p className="truncate text-sm font-medium hover:underline">{l.titulo || l.numero_edital}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.orgao} · {l.municipio_uf || "—"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{MOTIVO[l.arquivado_motivo] ?? "arquivado"}</Badge>
                    <span>disputa {dataBr(l.data_disputa)} · arquivado {dataBr(l.arquivado_em)}</span>
                  </div>
                </button>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={reabrindo === l.id} onClick={() => reabrir(l)}>
                  {reabrindo === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />} Reabrir
                </Button>
              </div>
            ))}
        </div>

        {paginas > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>Página {pagina + 1} de {paginas}</span>
            <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
