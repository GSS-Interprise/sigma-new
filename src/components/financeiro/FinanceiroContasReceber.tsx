import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2, Info, Pencil } from "lucide-react";
import {
  useFinanceiroReceber, useSyncFinanceiroReceber, useAtualizarReceber,
  type FinanceiroReceber, type ReceberPatch,
} from "@/hooks/useFinanceiroData";
import { NFClienteAnexos } from "@/components/financeiro/NFClienteAnexos";

const fmt = (v: number | null | undefined) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// T08 — contas a receber dos contratos. Valor previsto = rateio MENSAL (valor do
// contrato ÷ prazo em meses). Fluxo: a_faturar → faturado (valor real) → recebido.
export function FinanceiroContasReceber({ mes, ano }: { mes: number; ano: number }) {
  const { data: itens = [], isLoading } = useFinanceiroReceber(mes, ano);
  const sync = useSyncFinanceiroReceber();

  const totalPrevisto = itens.reduce((s, i) => s + Number(i.valor_previsto || 0), 0);
  const totalFaturado = itens.filter((i) => i.status !== "a_faturar").reduce((s, i) => s + Number(i.valor_faturado ?? (i.valor_previsto || 0)), 0);
  const totalRecebido = itens.filter((i) => i.status === "recebido").reduce((s, i) => s + Number(i.valor_faturado ?? (i.valor_previsto || 0)), 0);
  const temTotalCru = itens.some((i) => i.regra_rateio === "total");

  const badge = (s: string) => (s === "recebido" ? "default" : s === "faturado" ? "secondary" : "outline");
  const statusLabel = (s: string) => (s === "recebido" ? "Recebido" : s === "faturado" ? "Faturado" : "A faturar");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Previsto no mês</p><p className="text-xl font-bold">{fmt(totalPrevisto)}</p><p className="text-xs text-muted-foreground">{itens.length} contrato(s)</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Faturado</p><p className="text-xl font-bold text-blue-600">{fmt(totalFaturado)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Recebido</p><p className="text-xl font-bold text-emerald-600">{fmt(totalRecebido)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Contratos ativos vigentes na competência {String(mes).padStart(2, "0")}/{ano}.</p>
        <Button size="sm" variant="outline" onClick={() => sync.mutate({ mes, ano })} disabled={sync.isPending || !mes}>
          {sync.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Sincronizar contratos do mês
        </Button>
      </div>

      {temTotalCru && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Alguns contratos <b>não têm prazo em meses</b> cadastrado, então o previsto usa o <b>valor total</b> (marcado como "total"). Edite o valor previsto na linha para o mensal correto.</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contas a Receber</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-6">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nada ainda. Clique em "Sincronizar contratos do mês".</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Previsto (mês)</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                    <TableHead>NF saída</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="truncate">{i.descricao || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {i.condicao_pagamento || "—"}
                          {i.regra_rateio === "linear" && i.prazo_meses ? ` · rateio ${fmt(i.valor_contrato_total)}÷${i.prazo_meses}m` : i.regra_rateio === "total" ? " · valor total (revisar)" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(i.valor_previsto)}</TableCell>
                      <TableCell className="text-right">{i.valor_faturado != null ? fmt(i.valor_faturado) : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{i.nf_saida_status === "emitida" ? "Emitida" : "Pendente"}</Badge></TableCell>
                      <TableCell><Badge variant={badge(i.status)} className="text-[11px]">{statusLabel(i.status)}</Badge></TableCell>
                      <TableCell className="text-right"><GerenciarReceber item={i} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GerenciarReceber({ item }: { item: FinanceiroReceber }) {
  const [open, setOpen] = useState(false);
  const atualizar = useAtualizarReceber();
  const [status, setStatus] = useState(item.status);
  const [previsto, setPrevisto] = useState(String(item.valor_previsto ?? ""));
  const [faturado, setFaturado] = useState(item.valor_faturado != null ? String(item.valor_faturado) : "");
  const [nfSaida, setNfSaida] = useState(item.nf_saida_status);
  const [obs, setObs] = useState(item.observacoes ?? "");

  const salvar = () => {
    const patch: ReceberPatch = {
      status,
      nf_saida_status: nfSaida,
      valor_previsto: Number(previsto) || 0,
      valor_faturado: faturado === "" ? null : Number(faturado) || 0,
      observacoes: obs || null,
    };
    // editar o previsto à mão vira rateio manual
    if (Number(previsto) !== Number(item.valor_previsto)) patch.regra_rateio = "manual";
    atualizar.mutate({ id: item.id, patch }, { onSuccess: () => setOpen(false) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8"><Pencil className="h-3.5 w-3.5 mr-1" /> Gerenciar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">{item.descricao || "Conta a receber"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_faturar">A faturar</SelectItem>
                <SelectItem value="faturado">Faturado</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor previsto (mês)</Label>
              <Input type="number" step="0.01" value={previsto} onChange={(e) => setPrevisto(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Valor faturado (real)</Label>
              <Input type="number" step="0.01" value={faturado} onChange={(e) => setFaturado(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div>
            <Label className="text-xs">NF de saída</Label>
            <Select value={nfSaida} onValueChange={setNfSaida}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="emitida">Emitida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: faturar por hora, aguardando medição..." />
          </div>
          {item.cliente_id && (
            <div className="pt-3 border-t">
              <NFClienteAnexos
                clienteId={item.cliente_id}
                contratoId={item.contrato_id ?? undefined}
                receberId={item.id}
                mes={item.mes_referencia}
                ano={item.ano_referencia}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={atualizar.isPending}>
            {atualizar.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
