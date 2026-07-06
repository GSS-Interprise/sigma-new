import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "financeiro-anexos";

// Viewer enxuto pro bucket privado financeiro-anexos: signed URL (não getPublicUrl).
export function FinanceiroFileViewerDialog({ path, nome, open, onOpenChange }: {
  path: string | null; nome?: string | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ext = (nome || path || "").split(".").pop()?.toLowerCase() || "";

  useEffect(() => {
    if (!open || !path) { setUrl(null); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (!alive) return;
      if (error || !data) { toast.error("Erro ao abrir anexo"); onOpenChange(false); }
      else setUrl(data.signedUrl);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, path, onOpenChange]);

  const download = async () => {
    if (!path) return;
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) { toast.error("Erro ao baixar"); return; }
    const u = URL.createObjectURL(data as Blob);
    const a = document.createElement("a");
    a.href = u; a.download = nome || path.split("/").pop() || "arquivo";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="truncate pr-10">{nome || "Anexo"}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !url ? null : ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? (
          <img src={url} alt={nome || ""} className="max-h-[80vh] mx-auto rounded" />
        ) : ext === "pdf" ? (
          <iframe src={url} title={nome || "pdf"} className="w-full h-[80vh] rounded border" />
        ) : (
          <div className="text-center py-10 space-y-3">
            <p className="text-muted-foreground">Tipo .{ext} — visualização não disponível.</p>
            <Button onClick={download}><Download className="h-4 w-4 mr-2" /> Baixar</Button>
          </div>
        )}
        {url && <div className="flex justify-end mt-2"><Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4 mr-1" /> Baixar</Button></div>}
      </DialogContent>
    </Dialog>
  );
}
