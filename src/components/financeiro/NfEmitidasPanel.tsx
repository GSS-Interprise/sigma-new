import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Eye, Loader2, Send, Upload } from "lucide-react";
import { toast } from "sonner";

/**
 * Notas emitidas pela GSS → contas a receber.
 *
 * A nota é emitida no Portal Nacional; aqui entra o arquivo dela (vários de uma vez). O Sigma
 * lê cliente, valor, impostos retidos e mês, liga ao contrato pelo CNPJ do tomador e marca o
 * "a receber" do mês como faturado. Lançar no Conta Azul é um passo separado, com prévia.
 * Substitui digitar a nota de novo e a planilha de acompanhamento.
 */
const BUCKET = "financeiro-anexos";
const brl = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");
const ST: Record<string, { label: string; cls: string }> = {
  lida: { label: "Lida", cls: "bg-muted text-muted-foreground" },
  conferir: { label: "Conferir", cls: "bg-amber-100 text-amber-800" },
  vinculada: { label: "No a receber", cls: "bg-emerald-100 text-emerald-800" },
  lancada: { label: "No Conta Azul", cls: "bg-sky-100 text-sky-800" },
  recebida: { label: "Recebida", cls: "bg-emerald-600 text-white" },
  descartada: { label: "Descartada", cls: "bg-muted text-muted-foreground line-through" },
};

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("financeiro-conta-azul", { body });
  if (error) {
    const corpo = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(corpo?.detalhe || corpo?.error || error.message);
  }
  if (data?.ok === false) throw new Error(data.detalhe || data.error || "falha");
  return data;
}

export function NfEmitidasPanel({ mes, ano }: { mes: number; ano: number }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<{ itens: any[]; escrita: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-nf-emitidas", mes, ano],
    queryFn: async () => {
      // notas do mês (pela competência; sem competência lida, pela data em que entraram)
      const { data: notas } = await (supabase as any).from("financeiro_nf_emitidas")
        .select("*").or(`and(competencia.gte.${ini},competencia.lte.${fim}),and(competencia.is.null,created_at.gte.${ini},created_at.lte.${fim}T23:59:59)`)
        .neq("status", "descartada").order("created_at", { ascending: false });
      const clienteIds = [...new Set((notas ?? []).map((n: any) => n.cliente_id).filter(Boolean))];
      const { data: contratos } = clienteIds.length
        ? await (supabase as any).from("contratos").select("id, cliente_id, codigo_interno, codigo_contrato, status_contrato, unidades:unidade_id(nome)").in("cliente_id", clienteIds)
        : { data: [] };
      return { notas: (notas ?? []) as any[], contratos: (contratos ?? []) as any[] };
    },
  });
  const notas = data?.notas ?? [];
  const contratosDe = (clienteId: string | null) => (data?.contratos ?? []).filter((c) => c.cliente_id === clienteId);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["financeiro-nf-emitidas"] });
    qc.invalidateQueries({ queryKey: ["financeiro-receber"] });
  };

  const subir = async (arquivos: FileList) => {
    const lista = [...arquivos].filter((f) => /\.pdf$/i.test(f.name));
    if (!lista.length) { toast.error("Envie os arquivos PDF das notas."); return; }
    let ok = 0, repetidas = 0, conferir = 0; const erros: string[] = [];
    for (const [i, f] of lista.entries()) {
      setSubindo(`${i + 1} de ${lista.length}`);
      try {
        const path = `nf-emitidas/${ano}-${String(mes).padStart(2, "0")}/${Date.now()}_${sanitize(f.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: "application/pdf" });
        if (error) throw error;
        const r = await chamar({ acao: "nf_emitida_registrar", arquivo_path: path, arquivo_nome: f.name });
        if (r.duplicada) { repetidas++; await supabase.storage.from(BUCKET).remove([path]); }
        else { ok++; if (r.status === "conferir") conferir++; }
      } catch (e: any) { erros.push(`${f.name}: ${e.message}`); }
    }
    setSubindo(null);
    const partes = [`${ok} nota(s) lida(s)`];
    if (conferir) partes.push(`${conferir} para conferir`);
    if (repetidas) partes.push(`${repetidas} já estavam no Sigma`);
    if (erros.length) partes.push(`${erros.length} com erro`);
    (erros.length || conferir) ? toast.warning(partes.join(" · ")) : toast.success(partes.join(" · "));
    if (erros.length) console.warn("[nf emitidas]", erros);
    recarregar();
  };

  const atualizar = async (id: string, patch: Record<string, unknown>) => {
    try { await chamar({ acao: "nf_emitida_atualizar", id, ...patch }); recarregar(); }
    catch (e: any) { toast.error(e.message); }
  };

  const verNota = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível abrir a nota.");
  };

  const abrirPrevia = async () => {
    setEnviando(true);
    try { const r = await chamar({ acao: "receber_previa", ids: [...sel] }); setPrevia({ itens: r.itens || [], escrita: !!r.escrita_ligada }); }
    catch (e: any) { toast.error(e.message); }
    setEnviando(false);
  };

  const lancar = async () => {
    if (!previa) return;
    setEnviando(true);
    try {
      const r = await chamar({ acao: "receber_lancar", ids: previa.itens.filter((i) => i.pronto).map((i) => i.id), confirmar: true });
      r.erros ? toast.warning(`${r.lancados} lançada(s), ${r.erros} com erro.`) : toast.success(`${r.lancados} conta(s) a receber lançada(s) no Conta Azul.`);
      setPrevia(null); setSel(new Set()); recarregar();
    } catch (e: any) { toast.error(e.message); }
    setEnviando(false);
  };

  const totalBruto = notas.reduce((s, n) => s + Number(n.valor_bruto || 0), 0);
  const totalLiquido = notas.reduce((s, n) => s + Number(n.valor_liquido || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">Notas emitidas no mês</CardTitle>
          <p className="text-xs text-muted-foreground">
            Envie os PDFs das notas emitidas no Portal Nacional. O Sigma lê e monta o contas a receber.
            {notas.length > 0 && <> · {notas.length} nota(s) · bruto {brl(totalBruto)} · líquido {brl(totalLiquido)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sel.size > 0 && (
            <Button size="sm" variant="outline" disabled={enviando} onClick={abrirPrevia} className="gap-1.5">
              <Send className="h-4 w-4" /> Lançar {sel.size} no Conta Azul
            </Button>
          )}
          <Button size="sm" disabled={!!subindo} onClick={() => inputRef.current?.click()} className="gap-1.5">
            {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {subindo ? `Lendo ${subindo}…` : "Enviar notas (PDF)"}
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
            onChange={(e) => { const fs = e.target.files; if (fs?.length) subir(fs); e.target.value = ""; }} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          : notas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma nota emitida enviada para este mês.</p>
          : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Nota</TableHead>
                    <TableHead>Cliente e contrato</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Retido</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notas.map((n) => {
                    const st = ST[n.status] ?? ST.lida;
                    const cs = contratosDe(n.cliente_id);
                    return (
                      <TableRow key={n.id} className="[&>td]:py-1.5">
                        <TableCell>
                          <Checkbox checked={sel.has(n.id)} disabled={!!n.ca_evento_id}
                            onCheckedChange={() => { const s = new Set(sel); s.has(n.id) ? s.delete(n.id) : s.add(n.id); setSel(s); }} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <button className="flex items-center gap-1 font-medium hover:underline" onClick={() => verNota(n.arquivo_path)}>
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" /> NF {n.numero_nota || "s/ nº"}
                          </button>
                          <span className="block text-[11px] text-muted-foreground">emitida {dataBr(n.emissao)}</span>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <span className="block truncate text-sm">{n.tomador_nome || "—"}</span>
                          {cs.length > 1 || (!n.contrato_id && cs.length > 0) ? (
                            <Select value={n.contrato_id ?? ""} onValueChange={(v) => atualizar(n.id, { contrato_id: v })}>
                              <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue placeholder="Escolha o contrato" /></SelectTrigger>
                              <SelectContent>
                                {cs.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo_interno} · {c.codigo_contrato} · {c.unidades?.nome ?? ""}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : n.contrato_id ? (
                            <span className="block truncate text-[11px] text-muted-foreground">{cs[0]?.codigo_contrato} · {cs[0]?.unidades?.nome}</span>
                          ) : null}
                          {n.motivo && <span className="block text-[11px] text-amber-700">{n.motivo}</span>}
                          {n.ca_erro && n.ca_erro !== "enviando" && <span className="block text-[11px] text-red-600">Conta Azul: {n.ca_erro}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(n.valor_bruto)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{brl(n.total_retencoes)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n.valor_liquido != null ? brl(n.valor_liquido) : (
                            <Input className="h-7 w-28 text-xs ml-auto" placeholder="líquido" inputMode="decimal"
                              onBlur={(e) => {
                                const v = Number(e.target.value.replace(/\./g, "").replace(",", "."));
                                if (Number.isFinite(v) && v > 0) atualizar(n.id, { valor_liquido: v });
                              }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="date" className="h-7 w-36 text-xs" defaultValue={n.vencimento ?? ""} disabled={!!n.ca_evento_id}
                            onBlur={(e) => e.target.value && e.target.value !== n.vencimento && atualizar(n.id, { vencimento: e.target.value })} />
                        </TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${st.cls}`}>{st.label}</span></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
      </CardContent>

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lançar contas a receber no Conta Azul</DialogTitle></DialogHeader>
          {previa && !previa.escrita && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span><b>Modo simulação.</b> O envio ao Conta Azul está desligado: esta tela mostra o que seria lançado, mas nada é enviado.</span>
            </div>
          )}
          <div className="space-y-2">
            {(previa?.itens ?? []).map((i) => (
              <div key={i.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">NF {i.numero_nota || "s/ nº"} · {i.cliente}</span>
                  {i.pronto ? <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto</span>
                    : <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Falta resolver</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {i.descricao}<br />
                  Valor {brl(i.valor)} · vencimento {dataBr(i.vencimento)} · categoria {i.categoria || "—"} · centro {i.centro_custo || "sem centro"} · conta {i.conta || "—"}
                </p>
                {i.problemas.map((p: string) => <p key={p} className="mt-1 text-xs text-red-600">• {p}</p>)}
                {i.avisos.map((a: string) => <p key={a} className="mt-1 text-xs text-amber-700">• {a}</p>)}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)}>Fechar</Button>
            <Button disabled={!previa?.escrita || enviando || !(previa?.itens ?? []).some((i) => i.pronto)} onClick={lancar} className="gap-1.5">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {previa?.escrita ? `Lançar ${(previa?.itens ?? []).filter((i) => i.pronto).length} no Conta Azul` : "Envio desligado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
