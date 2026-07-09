import { useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, Eye, CheckCircle2, AlertTriangle, Receipt, FileText } from "lucide-react";
import { toast } from "sonner";
import { FinanceiroFileViewerDialog } from "@/components/financeiro/FinanceiroFileViewerDialog";

const BUCKET = "financeiro-anexos";
// Copiado de FinanceiroAnexos.tsx — remove acentos e chars inválidos pra chave de storage.
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");

const fmtBRL = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ProcResult {
  casados: { pagamento?: string; medico?: string; valor?: number }[];
  pendentes: { arquivo_nome?: string; motivo?: string }[];
}

export default function FinanceiroComprovantes() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ProcResult | null>(null);
  const [viewer, setViewer] = useState<{ path: string; nome: string } | null>(null);
  const [casando, setCasando] = useState<string | null>(null);

  // Fila de revisão: comprovantes que a edge não conseguiu casar sozinha.
  const { data: pendentes = [], isLoading: loadingPend } = useQuery({
    queryKey: ["comprovantes-pendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_comprovantes_pendentes")
        .select("*")
        .eq("resolvido", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Pagamentos ainda não pagos do fechamento aprovado — opções pro casamento manual.
  const { data: pagamentosPendentes = [] } = useQuery({
    queryKey: ["pagamentos-nao-pagos-aprovados"],
    queryFn: async () => {
      const { data: fechamentos } = await (supabase as any)
        .from("financeiro_fechamentos")
        .select("id")
        .eq("status", "aprovado");
      const ids = (fechamentos ?? []).map((f: any) => f.id);
      if (!ids.length) return [] as any[];
      const { data, error } = await (supabase as any)
        .from("financeiro_pagamentos")
        .select("id, profissional_nome, profissional_crm, valor_total, status, fechamento_id")
        .in("fechamento_id", ids)
        .neq("status", "pago")
        .order("profissional_nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
    setResultado(null);
  };

  const enviar = async () => {
    if (!files.length) return;
    setEnviando(true);
    setResultado(null);
    try {
      const paths: { path: string; nome: string; mime: string }[] = [];
      for (const file of files) {
        const path = `comprovantes/${Date.now()}_${sanitize(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        paths.push({ path, nome: file.name, mime: file.type });
      }
      const { data, error } = await supabase.functions.invoke("financeiro-processar-comprovantes", {
        body: { paths },
      });
      if (error || (data as any)?.ok === false) {
        throw new Error(error?.message || (data as any)?.error || "Erro ao processar comprovantes");
      }
      const res = data as ProcResult;
      setResultado(res);
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      const nCasados = res?.casados?.length ?? 0;
      const nPend = res?.pendentes?.length ?? 0;
      toast.success(`${nCasados} comprovante(s) casado(s), ${nPend} pra revisão.`);
      qc.invalidateQueries({ queryKey: ["comprovantes-pendentes"] });
      qc.invalidateQueries({ queryKey: ["pagamentos-nao-pagos-aprovados"] });
      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || ""));
    }
    setEnviando(false);
  };

  const casarManual = async (pendente: any, pagamentoId: string) => {
    if (!pagamentoId) return;
    setCasando(pendente.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error: pagErr } = await (supabase as any)
        .from("financeiro_pagamentos")
        .update({ status: "pago", comprovante_status: "recebido", data_pagamento: new Date().toISOString(), conferido_por: u?.user?.id ?? null })
        .eq("id", pagamentoId);
      if (pagErr) throw pagErr;
      const { error: pendErr } = await (supabase as any)
        .from("financeiro_comprovantes_pendentes")
        .update({ resolvido: true, pagamento_id: pagamentoId })
        .eq("id", pendente.id);
      if (pendErr) throw pendErr;
      toast.success("Comprovante casado e pagamento marcado como pago.");
      qc.invalidateQueries({ queryKey: ["comprovantes-pendentes"] });
      qc.invalidateQueries({ queryKey: ["pagamentos-nao-pagos-aprovados"] });
      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    } catch (e: any) {
      toast.error("Erro ao casar: " + (e?.message || ""));
    }
    setCasando(null);
  };

  const headerActions = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold truncate">Comprovantes</h1>
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Suba os comprovantes e o sistema casa cada um ao médico</p>
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Enviar comprovantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={onPick}
              className="block w-full text-base file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 text-muted-foreground"
            />
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full h-12 text-base" onClick={enviar} disabled={enviando || files.length === 0}>
              {enviando ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Upload className="h-5 w-5 mr-2" />}
              {enviando ? "Processando..." : `Enviar ${files.length || ""} comprovante${files.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>

        {/* Resultado do processamento */}
        {resultado && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span><strong>{resultado.casados?.length ?? 0}</strong> casado(s) — marcados como pagos e enviados à contabilidade.</span>
              </div>
              {(resultado.casados?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  {resultado.casados.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="truncate">{c.medico || c.pagamento || "Médico"}</span>
                      <span className="shrink-0 font-medium">{c.valor != null ? fmtBRL(c.valor) : ""}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span><strong>{resultado.pendentes?.length ?? 0}</strong> pra revisão manual (abaixo).</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fila de revisão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Fila de revisão
              {pendentes.length > 0 && <Badge variant="outline">{pendentes.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPend ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nada pra revisar. Tudo casou automaticamente.</p>
            ) : (
              <div className="space-y-3">
                {pendentes.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.arquivo_nome || p.arquivo_path?.split("/").pop()}</p>
                        {p.motivo && <p className="text-xs text-amber-600 mt-0.5">{p.motivo}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1"
                        onClick={() => setViewer({ path: p.arquivo_path, nome: p.arquivo_nome })}
                      >
                        <Eye className="h-4 w-4" /> Ver
                      </Button>
                    </div>
                    {p.texto_extraido && (
                      <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/50 rounded p-2">
                        {p.texto_extraido}
                      </p>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Casar com médico (marca pago):</label>
                      <Select
                        disabled={casando === p.id}
                        onValueChange={(v) => casarManual(p, v)}
                      >
                        <SelectTrigger className="h-11 text-base">
                          <SelectValue placeholder={casando === p.id ? "Salvando..." : "Escolher médico..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {pagamentosPendentes.length === 0 ? (
                            <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum pagamento pendente no fechamento aprovado.</div>
                          ) : (
                            pagamentosPendentes.map((pg: any) => (
                              <SelectItem key={pg.id} value={pg.id}>
                                {pg.profissional_nome}
                                {pg.profissional_crm ? ` — CRM ${pg.profissional_crm}` : ""} · {fmtBRL(pg.valor_total)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <FinanceiroFileViewerDialog
        path={viewer?.path ?? null}
        nome={viewer?.nome}
        open={!!viewer}
        onOpenChange={(o) => !o && setViewer(null)}
      />
    </AppLayout>
  );
}
