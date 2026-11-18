import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Loader2, X } from "lucide-react";
import {
  useFinanceiroAjustes, useFinanceiroAjusteCategorias, useSalvarAjuste,
  useRemoverAjuste, useCriarAjusteCategoria, FinanceiroAjuste,
} from "@/hooks/useFinanceiroData";
import { exigeHoras, fmtHoras, lerValor, minutosPrevistos as preverMinutos, pendenteDeHoras, validarAjuste } from "./ajusteHoras";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * E2 — lançamentos a mais/a menos no fechamento do médico (ex.: R$200 de gestão).
 * Categoria é fixa mas cadastrável pela própria Mavi. Justificativa é obrigatória —
 * o `check` no banco recusa vazio, então a validação aqui é só pra não ir e voltar.
 * O valor_total do pagamento é recalculado por trigger; não some nada na tela.
 */
const NOVA_CATEGORIA = "__nova_categoria__";

export function FinanceiroAjustes({ pagamentoId, bloqueado, base = 0, minutosAtuais = 0 }: { pagamentoId: string; bloqueado?: boolean; base?: number; minutosAtuais?: number }) {
  const { data: ajustes = [], isLoading } = useFinanceiroAjustes(pagamentoId);
  const { data: categorias = [] } = useFinanceiroAjusteCategorias();
  const salvar = useSalvarAjuste();
  const remover = useRemoverAjuste();
  const criarCategoria = useCriarAjusteCategoria();

  // horas: correção de escala (Mavi, 18/11: lançado 72 h, fez 74 h). Mesmo sinal do valor; vão no pedido de NF.
  const [form, setForm] = useState<{ id?: string; categoria_id: string; sinal: "mais" | "menos"; valor: string; horas: string; justificativa: string } | null>(null);
  const [novaCat, setNovaCat] = useState<{ nome: string; sinal: string } | null>(null);

  const total = ajustes.reduce((s, a) => s + Number(a.valor), 0);
  // prévia do resultado enquanto ela digita — o valor a pagar não pode ser surpresa
  const nomeCat = (id: string) => categorias.find((c) => c.id === id)?.nome ?? "—";
  const validacao = form ? validarAjuste({ ...form, categoria_nome: nomeCat(form.categoria_id) }) : null;
  const formValido = !!validacao?.ok;
  const brutoForm = lerValor(form?.valor || "");
  const deltaForm = isFinite(brutoForm)
    ? (form?.sinal === "menos" ? -Math.abs(brutoForm) : Math.abs(brutoForm))
    : 0;
  const jaLancado = form?.id ? Number(ajustes.find((a) => a.id === form.id)?.valor ?? 0) : 0;
  const totalPrevisto = base + total - jaLancado + deltaForm;
  const deltaMin = validacao?.minutos ?? 0;
  const minJaLancado = form?.id ? Number(ajustes.find((a) => a.id === form.id)?.minutos ?? 0) : 0;
  const minutosPrevistos = preverMinutos(minutosAtuais, minJaLancado, deltaMin);
  const horasObrigatorias = exigeHoras(form ? nomeCat(form.categoria_id) : "");
  // correção de escala lançada sem horas (as de 18/11, antes desta trava) aparece marcada para a equipe completar
  const semHoras = (a: FinanceiroAjuste) => pendenteDeHoras(nomeCat(a.categoria_id), a.minutos, !!bloqueado);
  const temHoras = ajustes.some((a) => Number(a.minutos ?? 0) !== 0 || semHoras(a));

  const abrirNovo = () => setForm({ categoria_id: "", sinal: "mais", valor: "", horas: "", justificativa: "" });
  const abrirEdicao = (a: FinanceiroAjuste) =>
    setForm({
      id: a.id, categoria_id: a.categoria_id,
      sinal: (Number(a.valor) || Number(a.minutos ?? 0)) < 0 ? "menos" : "mais",
      valor: Number(a.valor) ? String(Math.abs(Number(a.valor))).replace(".", ",") : "",
      horas: Number(a.minutos ?? 0) ? fmtHoras(Math.abs(Number(a.minutos))) : "",
      justificativa: a.justificativa,
    });

  const confirmar = async () => {
    if (!form || !validacao?.ok) return;
    await salvar.mutateAsync({
      id: form.id, pagamento_id: pagamentoId, categoria_id: form.categoria_id,
      valor: validacao.valor, minutos: validacao.minutos,
      justificativa: form.justificativa,
    });
    setForm(null);
  };

  const confirmarCategoria = async () => {
    if (!novaCat?.nome.trim()) return;
    const cat = await criarCategoria.mutateAsync({ nome: novaCat.nome, sinal: novaCat.sinal });
    setForm((f) => (f ? { ...f, categoria_id: cat.id } : f));
    setNovaCat(null);
  };


  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Ajustes</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valores e horas a mais ou a menos deste médico no mês (gestão, desconto, correção de escala…).
          </p>
        </div>
        {!bloqueado && (
          <Button size="sm" onClick={abrirNovo} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> Lançar ajuste
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4 text-sm">Carregando…</p>
        ) : ajustes.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">Nenhum ajuste lançado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Justificativa</TableHead>
                  {temHoras && <TableHead className="text-right">Horas</TableHead>}
                  <TableHead className="text-right">Valor</TableHead>
                  {!bloqueado && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ajustes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{nomeCat(a.categoria_id)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[18rem] truncate" title={a.justificativa}>
                      {a.justificativa}
                    </TableCell>
                    {temHoras && (
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {semHoras(a) ? (
                          <span className="text-amber-700 font-medium" title="Edite e informe as horas: sem elas o pedido de NF sai com a carga antiga.">
                            sem horas
                          </span>
                        ) : Number(a.minutos ?? 0) ? `${Number(a.minutos) > 0 ? "+" : ""}${fmtHoras(Number(a.minutos))}` : "—"}
                      </TableCell>
                    )}
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${Number(a.valor) < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {Number(a.valor) ? `${Number(a.valor) > 0 ? "+" : ""}${fmt(Number(a.valor))}` : "—"}
                    </TableCell>
                    {!bloqueado && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => abrirEdicao(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600"
                            onClick={() => remover.mutate({ id: a.id, pagamento_id: pagamentoId })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2}>Total de ajustes</TableCell>
                  {temHoras && (
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {(() => { const m = ajustes.reduce((x, a) => x + Number(a.minutos ?? 0), 0); return m ? `${m > 0 ? "+" : ""}${fmtHoras(m)}` : "—"; })()}
                    </TableCell>
                  )}
                  <TableCell className={`text-right whitespace-nowrap ${total < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {total > 0 ? "+" : ""}{fmt(total)}
                  </TableCell>
                  {!bloqueado && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Editar ajuste" : "Lançar ajuste"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs"
                  onClick={() => setNovaCat({ nome: "", sinal: "ambos" })}>
                  + nova categoria
                </Button>
              </div>
              {/* último item da lista abre o cadastro de categoria, sem sair do lançamento */}
              <Select value={form?.categoria_id}
                onValueChange={(v) => (v === NOVA_CATEGORIA
                  ? setNovaCat({ nome: "", sinal: "ambos" })
                  : setForm((f) => (f ? { ...f, categoria_id: v } : f)))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  <SelectItem value={NOVA_CATEGORIA} className="border-t mt-1 pt-2 font-medium text-primary">
                    + Criar uma categoria nova
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[10.5rem_1fr_1fr] gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form?.sinal} onValueChange={(v) => setForm((f) => (f ? { ...f, sinal: v as "mais" | "menos" } : f))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mais">Acrescentar (+)</SelectItem>
                    <SelectItem value="menos">Descontar (−)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input inputMode="decimal" placeholder="200,00" value={form?.valor ?? ""}
                  onChange={(e) => setForm((f) => (f ? { ...f, valor: e.target.value } : f))} />
              </div>
              <div>
                <Label>Horas</Label>
                <Input placeholder="2 ou 2:30" value={form?.horas ?? ""} aria-invalid={!!validacao?.horasInvalidas}
                  aria-required={horasObrigatorias}
                  onChange={(e) => setForm((f) => (f ? { ...f, horas: e.target.value } : f))} />
                {validacao?.horasInvalidas
                  ? <p className="text-[11px] text-red-600 mt-1">Use 2, 2:30 ou 2h30.</p>
                  : validacao?.faltaHoras && <p className="text-[11px] text-amber-700 mt-1">Obrigatório (diferente de 0).</p>}
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Produção (menos o já pago à vista)</span><span>{fmt(base)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ajustes com este lançamento</span><span>{fmt(total - jaLancado + deltaForm)}</span></div>
              {(deltaMin !== 0 || minJaLancado !== 0 || horasObrigatorias) && (
                <div className="flex justify-between"><span className="text-muted-foreground">Horas no pedido de NF</span><span className="tabular-nums">{fmtHoras(minutosAtuais)} → {fmtHoras(minutosPrevistos)}</span></div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>A pagar ficará</span>
                <span className={totalPrevisto < 0 ? "text-red-600" : ""}>{fmt(totalPrevisto)}</span>
              </div>
              {totalPrevisto < 0 && (
                <p className="text-red-600">O desconto é maior que o valor produzido — confira antes de salvar.</p>
              )}
            </div>
            <div>
              <Label>Justificativa</Label>
              <Input placeholder="Ex.: gestão da escala de julho" value={form?.justificativa ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, justificativa: e.target.value } : f))} />
              <p className="text-[11px] text-muted-foreground mt-1">Obrigatória — fica no histórico do fechamento.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!formValido || salvar.isPending}>
              {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!novaCat} onOpenChange={(o) => !o && setNovaCat(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova categoria de ajuste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input placeholder="Ex.: Plantão extra" value={novaCat?.nome ?? ""}
                onChange={(e) => setNovaCat((c) => (c ? { ...c, nome: e.target.value } : c))} />
            </div>
            <div>
              <Label>Costuma ser</Label>
              <Select value={novaCat?.sinal} onValueChange={(v) => setNovaCat((c) => (c ? { ...c, sinal: v } : c))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mais">Acréscimo</SelectItem>
                  <SelectItem value="menos">Desconto</SelectItem>
                  <SelectItem value="ambos">Os dois</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovaCat(null)}><X className="h-4 w-4 mr-1.5" />Cancelar</Button>
            <Button onClick={confirmarCategoria} disabled={!novaCat?.nome.trim() || criarCategoria.isPending}>
              {criarCategoria.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
