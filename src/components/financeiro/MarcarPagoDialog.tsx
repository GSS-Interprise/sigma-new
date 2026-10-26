import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const METODOS: Record<string, string> = {
  PIX_PAGAMENTO_INSTANTANEO: "Pix", TRANSFERENCIA_BANCARIA: "Transferência", BOLETO_BANCARIO: "Boleto",
  DEPOSITO_BANCARIO: "Depósito", OUTRO: "Outro",
};

/**
 * Marcar como pago sem passar pelo envio de comprovantes do canal (Raul, 26/10): pagamento feito por fora,
 * comprovante que chega depois ou banco que não gera o PDF. Grava a data do pagamento e, para o que o Sigma
 * já lançou no Conta Azul, dá a baixa junto (mesma ação da tela "Dar baixa no Conta Azul"). O comprovante
 * pode ser anexado depois na ficha do médico e segue para ele como no caminho normal.
 */
export function MarcarPagoDialog({ open, onOpenChange, pagamentoIds, onPago }: {
  open: boolean; onOpenChange: (o: boolean) => void; pagamentoIds: string[]; onPago?: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [metodo, setMetodo] = useState("PIX_PAGAMENTO_INSTANTANEO");
  const [baixar, setBaixar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [noContaAzul, setNoContaAzul] = useState<string[]>([]);

  // quais destes já têm lançamento do Sigma no Conta Azul e ainda não têm baixa
  useEffect(() => {
    if (!open || !pagamentoIds.length) { setNoContaAzul([]); return; }
    (supabase as any).from("financeiro_pagamentos").select("id").in("id", pagamentoIds)
      .not("ca_parcela_id", "is", null).is("ca_baixa_id", null)
      .then(({ data: r }: any) => setNoContaAzul((r ?? []).map((x: any) => x.id)));
  }, [open, pagamentoIds.join(",")]);

  const confirmar = async () => {
    if (!pagamentoIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
    setSalvando(true);
    const { data: alterados, error } = await (supabase as any).from("financeiro_pagamentos")
      .update({ status: "pago", data_pagamento: data })
      .in("id", pagamentoIds).neq("status", "pago").select("id");
    if (error) { setSalvando(false); toast.error("Erro ao marcar como pago: " + error.message); return; }
    const n = (alterados ?? []).length;
    const ja = pagamentoIds.length - n;
    let msgBaixa = "";
    if (baixar && noContaAzul.length) {
      const ajustes = Object.fromEntries(noContaAzul.map((id) => [id, { data, metodo }]));
      const { data: r, error: e } = await supabase.functions.invoke("financeiro-conta-azul", {
        body: { acao: "baixa_lancar", pagamento_ids: noContaAzul, ajustes, confirmar: true },
      });
      const res: any[] = (r as any)?.resultados ?? [];
      const ok = res.filter((x) => x.ok).length;
      msgBaixa = e || (r as any)?.ok === false
        ? " A baixa no Conta Azul falhou: use Dar baixa no Conta Azul."
        : ` Baixa no Conta Azul: ${ok} de ${noContaAzul.length}.`;
    }
    setSalvando(false);
    toast.success(`${n} pagamento(s) marcado(s) como pago${ja ? `; ${ja} já estava(m) pago(s)` : ""}.${msgBaixa}`);
    onPago?.();
    onOpenChange(false);
  };

  const plural = pagamentoIds.length !== 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar como pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {plural ? `Os ${pagamentoIds.length} pagamentos ficam como pagos` : "O pagamento fica como pago"} sem comprovante.
            Se o comprovante chegar depois, anexe na ficha do médico que ele segue para o médico.
          </p>
          <div>
            <label className="text-xs text-muted-foreground">Data do pagamento</label>
            <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className="mt-1" />
          </div>
          {noContaAzul.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={baixar} onCheckedChange={(v) => setBaixar(v === true)} />
                <span>Dar baixa no Conta Azul também ({noContaAzul.length} lançado{noContaAzul.length === 1 ? "" : "s"} pelo Sigma)</span>
              </label>
              {baixar && (
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METODOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || !pagamentoIds.length}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Marcar como pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
