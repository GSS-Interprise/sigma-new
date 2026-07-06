import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Eye, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { FinanceiroFileViewerDialog } from "./FinanceiroFileViewerDialog";

const BUCKET = "financeiro-anexos";
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");

// T03 — anexos (NF do médico + comprovante) por pagamento. Bucket privado + signed URL.
export function FinanceiroAnexos({ pagamentoId }: { pagamentoId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ path: string; nome: string } | null>(null);
  const nfRef = useRef<HTMLInputElement>(null);
  const compRef = useRef<HTMLInputElement>(null);

  const { data: anexos = [] } = useQuery({
    queryKey: ["financeiro-anexos", pagamentoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_anexos").select("*").eq("pagamento_id", pagamentoId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upload = async (file: File, tipo: "nf" | "comprovante") => {
    setUploading(tipo);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${pagamentoId}/${Date.now()}_${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("financeiro_anexos").insert({
        pagamento_id: pagamentoId, tipo, arquivo_path: path, arquivo_nome: file.name, mime: file.type, criado_por: u?.user?.id ?? null,
      });
      if (insErr) throw insErr;
      if (tipo === "nf") await (supabase as any).from("financeiro_pagamentos").update({ nf_status: "recebida" }).eq("id", pagamentoId);
      qc.invalidateQueries({ queryKey: ["financeiro-anexos", pagamentoId] });
      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      toast.success(`${tipo === "nf" ? "NF" : "Comprovante"} anexado.`);
    } catch (e: any) {
      toast.error("Erro ao anexar: " + (e?.message || ""));
    }
    setUploading(null);
  };

  const remover = async (a: any) => {
    await supabase.storage.from(BUCKET).remove([a.arquivo_path]);
    await (supabase as any).from("financeiro_anexos").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["financeiro-anexos", pagamentoId] });
    toast.success("Anexo removido.");
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-base">Anexos (NF e comprovante)</CardTitle>
        <div className="flex gap-2">
          <input ref={nfRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "nf"); e.target.value = ""; }} />
          <Button size="sm" variant="outline" onClick={() => nfRef.current?.click()} disabled={!!uploading}>
            {uploading === "nf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />} Anexar NF
          </Button>
          <input ref={compRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "comprovante"); e.target.value = ""; }} />
          <Button size="sm" variant="outline" onClick={() => compRef.current?.click()} disabled={!!uploading}>
            {uploading === "comprovante" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Receipt className="h-4 w-4 mr-1" />} Anexar comprovante
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {anexos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nenhum anexo ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {anexos.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={a.tipo === "nf" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}>
                    {a.tipo === "nf" ? "NF" : "Comprovante"}
                  </Badge>
                  <span className="truncate">{a.arquivo_nome || a.arquivo_path.split("/").pop()}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewer({ path: a.arquivo_path, nome: a.arquivo_nome })}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remover(a)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <FinanceiroFileViewerDialog path={viewer?.path ?? null} nome={viewer?.nome} open={!!viewer} onOpenChange={(o) => !o && setViewer(null)} />
    </Card>
  );
}
