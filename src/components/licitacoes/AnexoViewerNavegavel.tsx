import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";

/**
 * Visualizador de anexos dentro do Sigma, com setas para passar de um arquivo ao outro
 * (pedido da Bianca na reunião de 07/10: "no Trello aparecem duas setinhas"; hoje cada PDF
 * abria numa aba nova do navegador e era preciso fechar e abrir o próximo).
 *
 * O arquivo é baixado pelo SDK e mostrado por blob: (mesma origem do Sigma). Isso evita os dois
 * problemas que fizeram o PDF ir para aba nova em julho: a URL assinada barrada por bloqueador
 * de anúncio e o nome sem extensão vindo do PNCP — o tipo sai do conteúdo, não do nome.
 * Teclado: ← e → trocam de arquivo. Serve para licitação e, depois, para o contrato.
 */
export type AnexoNavegavel = { id: string; arquivo_nome: string; arquivo_url: string; bucket: string };

function chaveNoBucket(a: AnexoNavegavel) {
  if (!a.arquivo_url.startsWith("http")) return a.arquivo_url;
  const marca = `/${a.bucket}/`;
  const i = a.arquivo_url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(a.arquivo_url.substring(i + marca.length).split("?")[0]) : a.arquivo_url;
}

// tipo pelo conteúdo: PDF começa com "%PDF"; imagem pelos bytes iniciais
async function tipoDoConteudo(blob: Blob): Promise<"pdf" | "imagem" | "outro"> {
  if (blob.type === "application/pdf") return "pdf";
  if (blob.type.startsWith("image/")) return "imagem";
  const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const txt = String.fromCharCode(...b);
  if (txt.startsWith("%PDF")) return "pdf";
  if ((b[0] === 0xff && b[1] === 0xd8) || txt.startsWith("\x89PNG") || txt.startsWith("GIF8") || txt.startsWith("RIFF")) return "imagem";
  return "outro";
}

export function AnexoViewerNavegavel({ anexos, indice, onIndiceChange, open, onOpenChange }: {
  anexos: AnexoNavegavel[]; indice: number; onIndiceChange: (i: number) => void;
  open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"pdf" | "imagem" | "outro" | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = anexos[indice];
  const urlAtual = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !atual) return;
    let cancelado = false;
    setCarregando(true); setErro(null); setTipo(null); setUrl(null);
    (async () => {
      try {
        const { data, error } = await supabase.storage.from(atual.bucket).download(chaveNoBucket(atual));
        if (error || !data) throw error || new Error("arquivo não encontrado");
        const t = await tipoDoConteudo(data);
        const blob = t === "pdf" && data.type !== "application/pdf" ? new Blob([data], { type: "application/pdf" }) : data;
        const u = URL.createObjectURL(blob);
        if (cancelado) { URL.revokeObjectURL(u); return; }
        if (urlAtual.current) URL.revokeObjectURL(urlAtual.current);
        urlAtual.current = u;
        setUrl(u); setTipo(t);
      } catch (e: any) {
        if (!cancelado) setErro(e?.message || "Não foi possível abrir o arquivo.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [open, atual?.id, atual?.arquivo_url]); // eslint-disable-line react-hooks/exhaustive-deps

  // libera a memória ao fechar
  useEffect(() => {
    if (open) return;
    if (urlAtual.current) { URL.revokeObjectURL(urlAtual.current); urlAtual.current = null; }
  }, [open]);

  const ir = useCallback((passo: number) => {
    if (!anexos.length) return;
    onIndiceChange((indice + passo + anexos.length) % anexos.length);
  }, [anexos.length, indice, onIndiceChange]);

  useEffect(() => {
    if (!open) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [open, ir]);

  const baixar = () => {
    if (!url || !atual) return;
    const a = document.createElement("a"); a.href = url; a.download = atual.arquivo_nome; a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[96dvh] max-w-[96vw] flex-col gap-2 p-2 sm:p-3">
        <div className="flex items-center gap-2 pr-8">
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => ir(-1)} disabled={anexos.length < 2} title="Anterior (←)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">
            {atual?.arquivo_nome ?? "Anexo"} <span className="font-normal text-muted-foreground">· {indice + 1} de {anexos.length}</span>
          </DialogTitle>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={baixar} disabled={!url} title="Baixar">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => url && window.open(url, "_blank")} disabled={!url} title="Abrir em outra aba">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => ir(1)} disabled={anexos.length < 2} title="Próximo (→)">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
          {carregando && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {erro && <p className="p-6 text-center text-sm text-red-600">{erro}</p>}
          {!carregando && url && tipo === "pdf" && <iframe key={url} src={url} title={atual?.arquivo_nome} className="h-full w-full border-0" />}
          {!carregando && url && tipo === "imagem" && (
            <div className="flex h-full w-full items-center justify-center overflow-auto">
              <img src={url} alt={atual?.arquivo_nome} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {!carregando && url && tipo === "outro" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>Este tipo de arquivo não tem prévia no navegador.</p>
              <Button size="sm" className="gap-1.5" onClick={baixar}><Download className="h-4 w-4" /> Baixar arquivo</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
