import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Search, Send, BellRing, FileCheck2, Link2, Upload, Eye, X, Mail, MessageCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Notas fiscais — o posto de trabalho da etapa mais maçante do financeiro (reunião com
 * a Mavi, 22/09). Antes só dava para pedir a NF de um médico por vez, abrindo o detalhe
 * dele; aqui a competência inteira sai num clique, com prévia antes e registro de quem
 * foi cobrado. O médico responde pelo link do e-mail, sem precisar responder mensagem.
 */
const BUCKET = "financeiro-anexos";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");

type Linha = {
  id: string; profissional_nome: string; medico_id: string | null; unidade: string | null;
  valor_total: number | null; nf_status: string | null; nf_solicitada_em: string | null;
  nf_lembretes: number | null; nf_recebida_em: string | null; nf_arquivo_path: string | null;
  arquivo_origem: string | null; email: string | null; telefone: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  nao_solicitada: { label: "A pedir", cls: "bg-muted text-muted-foreground" },
  solicitada: { label: "Pedida", cls: "bg-amber-100 text-amber-800" },
  recebida: { label: "Recebida", cls: "bg-emerald-100 text-emerald-800" },
  conferida: { label: "Conferida", cls: "bg-emerald-600 text-white" },
};

export default function FinanceiroNotasFiscais() {
  const qc = useQueryClient();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "a_pedir" | "pedidas" | "recebidas" | "sem_contato">("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [canal, setCanal] = useState<"email" | "whatsapp">("email");
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<any[] | null>(null);
  const [testeOpen, setTesteOpen] = useState(false);
  const [testeEmails, setTesteEmails] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [alvoUpload, setAlvoUpload] = useState<Linha | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["financeiro-nf", mes, ano],
    queryFn: async () => {
      const [pagRes, fechRes] = await Promise.all([
        (supabase as any).from("financeiro_pagamentos")
          .select("id, profissional_nome, medico_id, unidade, valor_total, nf_status, nf_solicitada_em, nf_lembretes, nf_recebida_em, nf_arquivo_path, arquivo_origem")
          .eq("mes_referencia", mes).eq("ano_referencia", ano).order("profissional_nome"),
        (supabase as any).from("financeiro_fechamentos")
          .select("status").eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle(),
      ]);
      const pags = (pagRes.data || []) as any[];
      const ids = [...new Set(pags.map((p) => p.medico_id).filter(Boolean))];
      const { data: meds } = ids.length
        ? await (supabase as any).from("medicos").select("id, email, telefone").in("id", ids)
        : { data: [] };
      const linhas: Linha[] = pags.map((p) => {
        const m = (meds || []).find((x: any) => x.id === p.medico_id);
        return { ...p, email: m?.email ?? null, telefone: m?.telefone ?? null };
      });
      return { linhas, fechamentoStatus: (fechRes.data as any)?.status ?? null };
    },
  });

  const linhas = data?.linhas ?? [];
  const liberado = ["em_nf", "aguardando_aprovacao", "aprovado", "pago"].includes(String(data?.fechamentoStatus));

  const temContato = (l: Linha) => (canal === "email" ? !!l.email : !!l.telefone);
  const indicadores = useMemo(() => ({
    a_pedir: linhas.filter((l) => (l.nf_status ?? "nao_solicitada") === "nao_solicitada").length,
    pedidas: linhas.filter((l) => l.nf_status === "solicitada").length,
    recebidas: linhas.filter((l) => l.nf_status === "recebida" || l.nf_status === "conferida").length,
    sem_contato: linhas.filter((l) => !temContato(l)).length,
  }), [linhas, canal]);

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return linhas.filter((l) => {
      const st = l.nf_status ?? "nao_solicitada";
      if (filtro === "a_pedir" && st !== "nao_solicitada") return false;
      if (filtro === "pedidas" && st !== "solicitada") return false;
      if (filtro === "recebidas" && !["recebida", "conferida"].includes(st)) return false;
      if (filtro === "sem_contato" && temContato(l)) return false;
      if (termo && !semAcento(l.profissional_nome || "").includes(termo)) return false;
      return true;
    });
  }, [linhas, busca, filtro, canal]);

  const selecionados = visiveis.filter((l) => sel.has(l.id));
  const alternar = (id: string) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const todosMarcados = visiveis.length > 0 && visiveis.every((l) => sel.has(l.id));

  const chamarEdge = async (body: Record<string, unknown>) => {
    const { data: r, error } = await supabase.functions.invoke("financeiro-nf-enviar", { body });
    if (error) throw new Error(error.message);
    if (r && r.ok === false) throw new Error(r.detalhe || r.error || "falha no envio");
    return r;
  };

  const verPrevia = async () => {
    if (!selecionados.length) return;
    setEnviando(true);
    try {
      const r = await chamarEdge({ pagamento_ids: selecionados.slice(0, 3).map((l) => l.id), canal, preview: true });
      setPrevia(r.resultados || []);
    } catch (e: any) {
      toast.error(e.message);
    }
    setEnviando(false);
  };

  const enviar = async (tipo: "solicitacao" | "lembrete") => {
    if (!selecionados.length) return;
    setEnviando(true);
    try {
      const r = await chamarEdge({ pagamento_ids: selecionados.map((l) => l.id), canal, tipo });
      const partes = [`${r.enviados} enviado(s)`];
      if (r.erros) partes.push(`${r.erros} com erro`);
      if (r.sem_contato) partes.push(`${r.sem_contato} sem contato`);
      (r.erros || r.sem_contato) ? toast.warning(partes.join(" · ")) : toast.success(partes.join(" · "));
      setSel(new Set());
      setPrevia(null);
      qc.invalidateQueries({ queryKey: ["financeiro-nf"] });
    } catch (e: any) {
      toast.error(e.message);
    }
    setEnviando(false);
  };

  // teste sem tocar no status do médico: mesma mensagem, destinatário nosso
  const enviarTeste = async () => {
    const destinos = testeEmails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!selecionados.length || !destinos.length) return;
    setEnviando(true);
    try {
      for (const destino of destinos) {
        await chamarEdge({
          pagamento_ids: [selecionados[0].id], canal, tipo: "solicitacao",
          destino_override: destino, teste: true,
        });
      }
      toast.success(`Teste enviado para ${destinos.length} destinatário(s).`);
      setTesteOpen(false);
      qc.invalidateQueries({ queryKey: ["financeiro-nf"] });
    } catch (e: any) {
      toast.error(e.message);
    }
    setEnviando(false);
  };

  const copiarLink = async (l: Linha) => {
    const { data: s } = await (supabase as any).from("financeiro_nf_solicitacoes")
      .select("token").eq("pagamento_id", l.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!s?.token) return toast.error("Esse médico ainda não recebeu solicitação — peça a NF primeiro.");
    await navigator.clipboard.writeText(`${window.location.origin}/nf/${s.token}`);
    toast.success("Link de envio copiado.");
  };

  const verNota = async (l: Linha) => {
    if (!l.nf_arquivo_path) return;
    const { data: s, error } = await supabase.storage.from(BUCKET).createSignedUrl(l.nf_arquivo_path, 300);
    if (error || !s) return toast.error("Não consegui abrir o arquivo.");
    window.open(s.signedUrl, "_blank");
  };

  const anexarManual = async (arquivo: File) => {
    if (!alvoUpload) return;
    setEnviando(true);
    try {
      const path = `nf/${ano}-${String(mes).padStart(2, "0")}/${alvoUpload.id}/${Date.now()}_${sanitize(arquivo.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) throw upErr;
      const agora = new Date().toISOString();
      await (supabase as any).from("financeiro_anexos").insert({
        pagamento_id: alvoUpload.id, tipo: "nf", arquivo_path: path,
        arquivo_nome: arquivo.name, mime: arquivo.type, status: "recebido",
      });
      await (supabase as any).from("financeiro_pagamentos")
        .update({ nf_status: "recebida", nf_recebida_em: agora, nf_arquivo_path: path })
        .eq("id", alvoUpload.id);
      toast.success(`Nota de ${alvoUpload.profissional_nome} anexada.`);
      qc.invalidateQueries({ queryKey: ["financeiro-nf"] });
    } catch (e: any) {
      toast.error("Erro ao anexar: " + (e?.message || ""));
    }
    setAlvoUpload(null);
    setEnviando(false);
  };

  const CHIPS: { k: typeof filtro; label: string; n: number }[] = [
    { k: "todos", label: "Todos", n: linhas.length },
    { k: "a_pedir", label: "A pedir", n: indicadores.a_pedir },
    { k: "pedidas", label: "Pedidas", n: indicadores.pedidas },
    { k: "recebidas", label: "Recebidas", n: indicadores.recebidas },
    { k: "sem_contato", label: "Sem contato", n: indicadores.sem_contato },
  ];

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold truncate">Notas fiscais</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Pedir, receber e cobrar a NF de cada médico do fechamento
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-[92px] h-9" />
            <Select value={canal} onValueChange={(v) => setCanal(v as any)}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Por e-mail</SelectItem>
                <SelectItem value="whatsapp">Por WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!liberado && linhas.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <span>Esta competência ainda não foi liberada no fechamento. Dá para testar o envio, mas o normal é liberar antes.</span>
          </div>
        )}

        <Card>
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base">
                Competência {String(mes).padStart(2, "0")}/{ano}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{linhas.length} médico(s)</span>
              </CardTitle>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar médico…" className="pl-8 h-9" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button key={c.k} onClick={() => setFiltro(c.k)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro === c.k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                  {c.label} <span className="tabular-nums opacity-80">{c.n}</span>
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </p>
            ) : linhas.length === 0 ? (
              <div className="text-center py-10">
                <FileCheck2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="font-medium mt-3">Nenhum lançamento nesta competência</p>
                <p className="text-sm text-muted-foreground mt-0.5">Importe e libere o fechamento antes de pedir as notas.</p>
              </div>
            ) : (
              <div className="relative overflow-auto rounded-md border max-h-[min(65vh,42rem)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="[&>th]:h-8 [&>th]:py-1 hover:bg-transparent">
                      <TableHead className="w-8">
                        <Checkbox checked={todosMarcados}
                          onCheckedChange={(v) => setSel(v ? new Set(visiveis.map((l) => l.id)) : new Set())} />
                      </TableHead>
                      <TableHead>Médico</TableHead>
                      <TableHead className="hidden md:table-cell">Contato</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Pedida</TableHead>
                      <TableHead className="text-center hidden sm:table-cell w-16">Cobr.</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.map((l) => {
                      const st = STATUS[l.nf_status ?? "nao_solicitada"] ?? STATUS.nao_solicitada;
                      const contato = canal === "email" ? l.email : l.telefone;
                      return (
                        <TableRow key={l.id} className="[&>td]:py-1 odd:bg-muted/20">
                          <TableCell className="py-1">
                            <Checkbox checked={sel.has(l.id)} onCheckedChange={() => alternar(l.id)} />
                          </TableCell>
                          <TableCell className="font-medium leading-tight">
                            {l.profissional_nome}
                            <span className="block text-[10px] text-muted-foreground truncate max-w-[14rem]">{l.unidade || "—"}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs">
                            {contato ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                {canal === "email" ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                                <span className="truncate max-w-[14rem]">{contato}</span>
                              </span>
                            ) : (
                              <span className="text-amber-700 border border-amber-400 rounded px-1 text-[10px]">sem contato</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{brl(Number(l.valor_total))}</TableCell>
                          <TableCell>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">
                            {dataHora(l.nf_solicitada_em)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-center text-xs tabular-nums text-muted-foreground">
                            {l.nf_lembretes || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {l.nf_arquivo_path && (
                                <button title="Ver a nota" onClick={() => verNota(l)} className="text-muted-foreground hover:text-foreground">
                                  <Eye className="h-4 w-4" />
                                </button>
                              )}
                              <button title="Copiar link de envio" onClick={() => copiarLink(l)} className="text-muted-foreground hover:text-foreground">
                                <Link2 className="h-4 w-4" />
                              </button>
                              <button title="Anexar a nota que chegou por fora"
                                onClick={() => { setAlvoUpload(l); uploadRef.current?.click(); }}
                                className="text-muted-foreground hover:text-foreground">
                                <Upload className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {visiveis.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                          Nada neste filtro.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {selecionados.length > 0 && (
              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm">
                <span className="text-sm font-medium">{selecionados.length} selecionado(s)</span>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={() => setSel(new Set())}>
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="outline" disabled={enviando} onClick={verPrevia}>Ver prévia</Button>
                <Button size="sm" variant="outline" disabled={enviando}
                  onClick={() => { setTesteEmails(""); setTesteOpen(true); }}>
                  Enviar teste
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={enviando}
                  onClick={() => enviar("lembrete")}>
                  <BellRing className="h-4 w-4" /> Cobrar
                </Button>
                <Button size="sm" className="gap-1.5" disabled={enviando} onClick={() => enviar("solicitacao")}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Pedir NF
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <input ref={uploadRef} type="file" accept=".pdf,.xml,image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexarManual(f); }} />

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Prévia do envio</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {(previa ?? []).map((p, i) => (
              <div key={i} className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{p.medico}</p>
                <p className="text-xs text-muted-foreground break-all">{p.destino || "sem contato"}</p>
                {canal === "email"
                  ? <p className="text-xs"><b>Assunto:</b> {p.assunto}</p>
                  : <p className="text-xs">{p.texto_whatsapp}</p>}
                <p className="text-xs text-muted-foreground break-all">{p.link}</p>
              </div>
            ))}
            {selecionados.length > 3 && (
              <p className="text-xs text-muted-foreground">
                Mostrando 3 de {selecionados.length}. O texto é o mesmo, muda nome, competência e valor.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)}>Fechar</Button>
            <Button disabled={enviando} onClick={() => enviar("solicitacao")} className="gap-1.5">
              <Send className="h-4 w-4" /> Enviar para {selecionados.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testeOpen} onOpenChange={setTesteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enviar teste</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Manda a mensagem de <b>{selecionados[0]?.profissional_nome}</b> para os endereços abaixo, sem
            mexer no status do médico. Separe por vírgula.
          </p>
          <Input value={testeEmails} onChange={(e) => setTesteEmails(e.target.value)}
            placeholder={canal === "email" ? "eu@empresa.com, mavi@…" : "5547999999999, 5547988888888"} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTesteOpen(false)}>Cancelar</Button>
            <Button disabled={enviando || !testeEmails.trim()} onClick={enviarTeste} className="gap-1.5">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
