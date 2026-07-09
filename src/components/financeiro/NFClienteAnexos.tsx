import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FinanceiroFileViewerDialog } from "./FinanceiroFileViewerDialog";

const BUCKET = "financeiro-anexos";
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");

const fmtBRL = (v: any) => {
  const n = Number(v);
  if (!isFinite(n) || v == null) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// NF POR CLIENTE — a NF que a GSS emite ao cliente (contas a receber). Bucket privado + signed URL.
export function NFClienteAnexos({
  clienteId, contratoId, receberId, mes, ano,
}: { clienteId: string; contratoId?: string; receberId?: string; mes?: number; ano?: number }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{ path: string; nome: string } | null>(null);
  const [numeroNf, setNumeroNf] = useState("");
  const [valor, setValor] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: anexos = [] } = useQuery({
    queryKey: ["nf-cliente-anexos", clienteId, receberId ?? null, mes ?? null, ano ?? null],
    queryFn: async () => {
      // Escopo: dentro de uma linha de conta a receber, mostra só as NFs daquele receber;
      // fora dele, por cliente (+ competência se informada). Evita listar NF de outra competência.
      let q = (supabase as any).from("nf_cliente_anexos").select("*");
      if (receberId) {
        q = q.eq("receber_id", receberId);
      } else {
        q = q.eq("cliente_id", clienteId);
        if (mes) q = q.eq("mes_referencia", mes);
        if (ano) q = q.eq("ano_referencia", ano);
      }
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `nf-cliente/${clienteId}/${Date.now()}_${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const primeira = anexos.length === 0;
      const { error: insErr } = await (supabase as any).from("nf_cliente_anexos").insert({
        cliente_id: clienteId,
        contrato_id: contratoId ?? null,
        receber_id: receberId ?? null,
        mes_referencia: mes ?? null,
        ano_referencia: ano ?? null,
        numero_nf: numeroNf.trim() || null,
        valor: valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null,
        arquivo_path: path,
        arquivo_nome: file.name,
        mime: file.type,
        criado_por: u?.user?.id ?? null,
      });
      if (insErr) throw insErr;

      // best-effort: ao anexar a 1a NF de um receber, marca a saída como emitida.
      if (receberId && primeira) {
        await (supabase as any).from("financeiro_receber").update({ nf_saida_status: "emitida" }).eq("id", receberId);
        qc.invalidateQueries({ queryKey: ["financeiro-receber"] });
      }

      setNumeroNf(""); setValor("");
      qc.invalidateQueries({ queryKey: ["nf-cliente-anexos"] });
      toast.success("NF anexada.");
    } catch (e: any) {
      toast.error("Erro ao anexar NF: " + (e?.message || ""));
    }
    setUploading(false);
  };

  const remover = async (a: any) => {
    await supabase.storage.from(BUCKET).remove([a.arquivo_path]);
    await (supabase as any).from("nf_cliente_anexos").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["nf-cliente-anexos", clienteId] });
    toast.success("NF removida.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">NF por cliente (contas a receber)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* form opcional + botão anexar — coluna no mobile, linha no desktop */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="nf-cliente-numero" className="text-xs text-muted-foreground">Número da NF (opcional)</Label>
            <Input id="nf-cliente-numero" value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} placeholder="Ex: 1234" className="text-base" inputMode="numeric" />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="nf-cliente-valor" className="text-xs text-muted-foreground">Valor (opcional)</Label>
            <Input id="nf-cliente-valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 1500,00" className="text-base" inputMode="decimal" />
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <Button className="w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />} Anexar NF
          </Button>
        </div>

        {anexos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">Nenhuma NF anexada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {anexos.map((a) => {
              const valorFmt = fmtBRL(a.valor);
              return (
                <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{a.arquivo_nome || a.arquivo_path.split("/").pop()}</span>
                    </div>
                    {(a.numero_nf || valorFmt) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 pl-6">
                        {a.numero_nf ? `NF ${a.numero_nf}` : ""}{a.numero_nf && valorFmt ? " · " : ""}{valorFmt || ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewer({ path: a.arquivo_path, nome: a.arquivo_nome })}><Eye className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => remover(a)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <FinanceiroFileViewerDialog path={viewer?.path ?? null} nome={viewer?.nome} open={!!viewer} onOpenChange={(o) => !o && setViewer(null)} />
    </Card>
  );
}
