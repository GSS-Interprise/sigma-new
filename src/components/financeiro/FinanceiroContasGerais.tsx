import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Loader2, CheckCircle2, Pencil, Trash2, Repeat, CalendarClock } from "lucide-react";
import { toast } from "sonner";

/**
 * Contas gerais da empresa — o que não vem do fechamento dos médicos: aluguel,
 * fornecedor, imposto, serviço, e do outro lado o que a GSS tem a receber fora do
 * contrato. Antes isso só existia em planilha (reunião 24/09).
 *
 * Recorrência mensal é materializada na hora, uma linha por mês até a data limite:
 * a equipe precisa ENXERGAR o compromisso dos próximos meses no fluxo, não descobrir
 * quando o mês chega.
 */
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => new Date().toISOString().slice(0, 10);
const MAX_RECORRENCIAS = 24;

const CATEGORIAS: Record<"pagar" | "receber", string[]> = {
  pagar: ["Aluguel", "Folha e encargos", "Fornecedor", "Imposto", "Serviço", "Software", "Despesa administrativa", "Outros"],
  receber: ["Contrato", "Serviço avulso", "Reembolso", "Outros"],
};

type Conta = {
  id: string; tipo: string; descricao: string; categoria: string | null; favorecido: string | null;
  documento: string | null; valor: number; vencimento: string; status: string;
  data_liquidacao: string | null; valor_liquidado: number | null; forma_pagamento: string | null;
  observacoes: string | null; recorrencia: string; recorrencia_ate: string | null;
  recorrencia_origem_id: string | null;
};

const vazio = (tipo: "pagar" | "receber") => ({
  id: "", tipo, descricao: "", categoria: "", favorecido: "", documento: "",
  valor: "", vencimento: hojeISO(), forma_pagamento: "", observacoes: "",
  recorrencia: "nenhuma", recorrencia_ate: "",
});

export function FinanceiroContasGerais({ tipo, mes, ano }: { tipo: "pagar" | "receber"; mes: number; ano: number }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(vazio(tipo));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Conta | null>(null);

  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["financeiro-contas", tipo, mes, ano],
    queryFn: async () => {
      const { data } = await (supabase as any).from("financeiro_contas")
        .select("*").eq("tipo", tipo)
        .eq("mes_referencia", mes).eq("ano_referencia", ano)
        .order("vencimento");
      return (data || []) as Conta[];
    },
  });

  const totais = useMemo(() => {
    const abertas = contas.filter((c) => c.status === "aberta");
    const hoje = hojeISO();
    return {
      aberto: abertas.reduce((s, c) => s + Number(c.valor || 0), 0),
      liquidado: contas.filter((c) => c.status === "liquidada").reduce((s, c) => s + Number(c.valor_liquidado ?? c.valor ?? 0), 0),
      vencidas: abertas.filter((c) => c.vencimento < hoje).length,
    };
  }, [contas]);

  const editar = (c: Conta) => {
    setForm({
      id: c.id, tipo: c.tipo as any, descricao: c.descricao, categoria: c.categoria ?? "",
      favorecido: c.favorecido ?? "", documento: c.documento ?? "", valor: String(c.valor ?? ""),
      vencimento: c.vencimento, forma_pagamento: c.forma_pagamento ?? "", observacoes: c.observacoes ?? "",
      recorrencia: "nenhuma", recorrencia_ate: "",   // recorrência é decidida na criação
    });
    setAberto(true);
  };

  const salvar = async () => {
    if (!form.descricao.trim()) return toast.error("Descreva o lançamento.");
    const valor = Number(String(form.valor).replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) return toast.error("Informe um valor.");
    if (!form.vencimento) return toast.error("Informe o vencimento.");

    setSalvando(true);
    try {
      const { data: uRes } = await supabase.auth.getUser();
      const base = {
        tipo, descricao: form.descricao.trim(), categoria: form.categoria || null,
        favorecido: form.favorecido || null, documento: form.documento || null,
        valor, forma_pagamento: form.forma_pagamento || null, observacoes: form.observacoes || null,
        mes_referencia: mes, ano_referencia: ano,   // o trigger recalcula pelo vencimento
        criado_por: uRes?.user?.id ?? null,
      };

      if (form.id) {
        const { error } = await (supabase as any).from("financeiro_contas")
          .update({ ...base, vencimento: form.vencimento }).eq("id", form.id);
        if (error) throw error;
        toast.success("Lançamento atualizado.");
      } else {
        const { data: criada, error } = await (supabase as any).from("financeiro_contas")
          .insert({
            ...base, vencimento: form.vencimento,
            recorrencia: form.recorrencia,
            recorrencia_ate: form.recorrencia === "mensal" ? (form.recorrencia_ate || null) : null,
          }).select("id").single();
        if (error) throw error;

        let repeticoes = 0;
        if (form.recorrencia === "mensal" && form.recorrencia_ate) {
          const limite = new Date(form.recorrencia_ate + "T12:00:00");
          const filhas: any[] = [];
          const d = new Date(form.vencimento + "T12:00:00");
          while (filhas.length < MAX_RECORRENCIAS) {
            d.setMonth(d.getMonth() + 1);
            if (d > limite) break;
            const iso = d.toISOString().slice(0, 10);
            filhas.push({
              ...base, vencimento: iso,
              mes_referencia: d.getMonth() + 1, ano_referencia: d.getFullYear(),
              recorrencia: "mensal", recorrencia_ate: form.recorrencia_ate,
              recorrencia_origem_id: criada.id,
            });
          }
          if (filhas.length) {
            const { error: errFilhas } = await (supabase as any).from("financeiro_contas").insert(filhas);
            if (errFilhas) throw errFilhas;
            repeticoes = filhas.length;
          }
        }
        toast.success(repeticoes ? `Lançado + ${repeticoes} meses seguintes.` : "Lançamento criado.");
      }

      setAberto(false);
      setForm(vazio(tipo));
      qc.invalidateQueries({ queryKey: ["financeiro-contas"] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || ""));
    }
    setSalvando(false);
  };

  const liquidar = async (c: Conta) => {
    const { error } = await (supabase as any).from("financeiro_contas").update({
      status: "liquidada", data_liquidacao: hojeISO(), valor_liquidado: c.valor,
    }).eq("id", c.id);
    if (error) return toast.error("Erro ao dar baixa: " + error.message);
    toast.success(tipo === "pagar" ? "Conta marcada como paga." : "Recebimento registrado.");
    qc.invalidateQueries({ queryKey: ["financeiro-contas"] });
  };

  const reabrir = async (c: Conta) => {
    const { error } = await (supabase as any).from("financeiro_contas")
      .update({ status: "aberta", data_liquidacao: null, valor_liquidado: null }).eq("id", c.id);
    if (error) return toast.error("Erro ao reabrir: " + error.message);
    qc.invalidateQueries({ queryKey: ["financeiro-contas"] });
  };

  const excluir = async (c: Conta, todasAsFuturas: boolean) => {
    const query = (supabase as any).from("financeiro_contas").delete();
    const { error } = todasAsFuturas && (c.recorrencia_origem_id || c.recorrencia === "mensal")
      ? await query.or(`id.eq.${c.id},recorrencia_origem_id.eq.${c.recorrencia_origem_id ?? c.id}`).gte("vencimento", c.vencimento)
      : await query.eq("id", c.id);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Lançamento excluído.");
    setExcluindo(null);
    qc.invalidateQueries({ queryKey: ["financeiro-contas"] });
  };

  const rotulo = tipo === "pagar" ? "conta a pagar" : "conta a receber";

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">
            {tipo === "pagar" ? "Outras contas a pagar" : "Outras contas a receber"}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tipo === "pagar"
              ? "Aluguel, fornecedor, imposto, serviço — o que não vem do fechamento dos médicos."
              : "O que a GSS tem a receber fora do faturamento por contrato."}
          </p>
        </div>
        <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setForm(vazio(tipo)); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Lançar {rotulo}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar lançamento" : `Lançar ${rotulo}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder={tipo === "pagar" ? "Aluguel da sala 10" : "Serviço avulso — Hospital X"} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS[tipo].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</Label>
                  <Input value={form.favorecido} onChange={(e) => setForm({ ...form, favorecido: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" inputMode="decimal" />
                </div>
                <div>
                  <Label className="text-xs">Vencimento</Label>
                  <Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Documento (NF, boleto)</Label>
                  <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Input value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} placeholder="PIX, boleto, TED" />
                </div>
              </div>

              {!form.id && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs">Repetir todo mês</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={form.recorrencia} onValueChange={(v) => setForm({ ...form, recorrencia: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Lançamento único</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.recorrencia === "mensal" && (
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Repetir até</Label>
                        <Input type="date" value={form.recorrencia_ate}
                          onChange={(e) => setForm({ ...form, recorrencia_ate: e.target.value })} />
                      </div>
                    )}
                  </div>
                  {form.recorrencia === "mensal" && (
                    <p className="text-[11px] text-muted-foreground">
                      Os meses seguintes já entram no fluxo, um lançamento por mês (máximo de {MAX_RECORRENCIAS}).
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} className="gap-1.5">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-3 py-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">Em aberto</p>
            <p className="text-base tabular-nums leading-tight">{brl(totais.aberto)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">
              {tipo === "pagar" ? "Pago no mês" : "Recebido no mês"}
            </p>
            <p className="text-base tabular-nums leading-tight text-emerald-700">{brl(totais.liquidado)}</p>
          </div>
          {totais.vencidas > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">Vencidas</p>
              <p className="text-base tabular-nums leading-tight text-red-600 flex items-center gap-1">
                <CalendarClock className="h-4 w-4" /> {totais.vencidas}
              </p>
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : contas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma {rotulo} lançada nesta competência.
          </p>
        ) : (
          <div className="overflow-auto rounded-md border max-h-[min(50vh,32rem)]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow className="[&>th]:h-8 [&>th]:py-1 hover:bg-transparent">
                  <TableHead>Descrição</TableHead>
                  <TableHead className="hidden sm:table-cell">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</TableHead>
                  <TableHead className="hidden md:table-cell">Categoria</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((c) => {
                  const vencida = c.status === "aberta" && c.vencimento < hojeISO();
                  return (
                    <TableRow key={c.id} className="[&>td]:py-1 odd:bg-muted/20">
                      <TableCell className="font-medium leading-tight">
                        {c.descricao}
                        {(c.recorrencia === "mensal" || c.recorrencia_origem_id) && (
                          <Repeat className="inline h-3 w-3 ml-1.5 text-muted-foreground" />
                        )}
                        {c.documento && <span className="block text-[10px] text-muted-foreground">{c.documento}</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{c.favorecido || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{c.categoria || "—"}</TableCell>
                      <TableCell className={`tabular-nums ${vencida ? "text-red-600 font-medium" : ""}`}>{dataBR(c.vencimento)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(Number(c.valor))}</TableCell>
                      <TableCell>
                        {c.status === "liquidada" ? (
                          <span className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-800">
                            {tipo === "pagar" ? "Paga" : "Recebida"} {dataBR(c.data_liquidacao)}
                          </span>
                        ) : vencida ? (
                          <span className="rounded-full px-2 py-0.5 text-[11px] bg-red-100 text-red-700">Vencida</span>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 text-[11px] bg-muted text-muted-foreground">Em aberto</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "aberta" ? (
                            <button title={tipo === "pagar" ? "Marcar como paga" : "Registrar recebimento"}
                              onClick={() => liquidar(c)} className="text-muted-foreground hover:text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button title="Reabrir" onClick={() => reabrir(c)} className="text-muted-foreground hover:text-foreground">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </button>
                          )}
                          <button title="Editar" onClick={() => editar(c)} className="text-muted-foreground hover:text-foreground">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button title="Excluir" onClick={() => setExcluindo(c)} className="text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.descricao} — {brl(Number(excluindo?.valor || 0))}, vencimento {dataBR(excluindo?.vencimento ?? null)}.
              {(excluindo?.recorrencia === "mensal" || excluindo?.recorrencia_origem_id) &&
                " Este lançamento faz parte de uma recorrência."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {(excluindo?.recorrencia === "mensal" || excluindo?.recorrencia_origem_id) && (
              <Button variant="outline" onClick={() => excluindo && excluir(excluindo, true)}>
                Excluir este e os próximos
              </Button>
            )}
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => excluindo && excluir(excluindo, false)}>
              Excluir só este
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
