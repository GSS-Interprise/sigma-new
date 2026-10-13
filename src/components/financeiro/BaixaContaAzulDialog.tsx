import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Dar baixa no Conta Azul — quem paga só sobe o comprovante no Sigma; a baixa no Conta Azul
 * era dada à mão depois. Aqui o pagamento que já consta como pago no Sigma (comprovante casado)
 * vira a baixa da parcela, com data, valor, conta e forma de pagamento conferidos antes.
 *
 * Só serve para o que o Sigma lançou no Conta Azul: é ele que guarda qual parcela é a do médico.
 * Com o envio desligado (modo simulação) a tela mostra a baixa que seria dada e não envia.
 */
type Item = {
  id: string; medico: string; unidade: string | null; valor: number | null; data: string | null;
  metodo: string; conta: string | null; ja_baixado: boolean; baixa_lida_do_conta_azul: boolean;
  erro_anterior: string | null; problemas: string[]; pronto: boolean;
};
type Ajuste = { data?: string; metodo?: string };

const METODO_ROTULO: Record<string, string> = {
  PIX_PAGAMENTO_INSTANTANEO: "Pix", TRANSFERENCIA_BANCARIA: "Transferência", BOLETO_BANCARIO: "Boleto",
  DEPOSITO_BANCARIO: "Depósito", OUTRO: "Outro",
};
const brl = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("financeiro-conta-azul", { body });
  if (error) {
    const corpo = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(corpo?.detalhe || corpo?.error || error.message);
  }
  if (data?.ok === false) throw new Error(data.detalhe || data.error || "falha");
  return data;
}

export function BaixaContaAzulDialog({ pagamentoIds, open, onOpenChange, onBaixado }: {
  pagamentoIds: string[]; open: boolean; onOpenChange: (o: boolean) => void; onBaixado: () => void;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [metodos, setMetodos] = useState<string[]>([]);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [escrita, setEscrita] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = async (aj: Record<string, Ajuste>) => {
    setCarregando(true);
    try {
      const r = await chamar({ acao: "baixa_previa", pagamento_ids: pagamentoIds, ajustes: aj });
      setItens(r.itens || []); setMetodos(r.metodos || []); setEscrita(!!r.escrita_ligada);
    } catch (e: any) { toast.error("Não foi possível montar a prévia da baixa: " + e.message); }
    setCarregando(false);
  };

  useEffect(() => {
    if (!open) return;
    setAjustes({});
    carregar({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pagamentoIds.join(",")]);

  const ajustar = (id: string, patch: Ajuste) => {
    const novo = { ...ajustes, [id]: { ...ajustes[id], ...patch } };
    setAjustes(novo);
    carregar(novo);
  };

  const prontos = itens.filter((i) => i.pronto);
  const total = prontos.reduce((s, i) => s + Number(i.valor || 0), 0);

  const baixar = async () => {
    setEnviando(true);
    try {
      const r = await chamar({ acao: "baixa_lancar", pagamento_ids: prontos.map((i) => i.id), ajustes, confirmar: true });
      if (r.erros) toast.warning(`${r.baixados} baixa(s) dada(s), ${r.erros} com erro. Veja o detalhe em cada linha.`);
      else toast.success(`${r.baixados} baixa(s) dada(s) no Conta Azul.`);
      onBaixado();
      await carregar(ajustes);
    } catch (e: any) { toast.error(e.message); }
    setEnviando(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Dar baixa no Conta Azul</DialogTitle></DialogHeader>

        {!escrita && !carregando && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><b>Modo simulação.</b> O envio ao Conta Azul está desligado: esta tela mostra a baixa que seria dada, mas nada é enviado.</span>
          </div>
        )}

        {carregando && !itens.length ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="space-y-2">
            {itens.map((i) => (
              <div key={i.id} className={`rounded-md border p-3 text-sm ${i.pronto ? "" : "bg-muted/30"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{i.medico}
                    <span className="block text-xs font-normal text-muted-foreground">{i.unidade || "—"}</span>
                  </div>
                  {i.ja_baixado
                    ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">{i.baixa_lida_do_conta_azul ? "Baixa já estava no Conta Azul" : "Baixa dada"}</span>
                    : i.pronto
                      ? <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Falta resolver</span>}
                </div>

                {!i.ja_baixado && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div><p className="text-[11px] text-muted-foreground">Valor da baixa</p><p>{brl(i.valor)}</p></div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Data do pagamento</p>
                      <Input className="h-8" type="date" value={i.data ?? ""} onChange={(e) => e.target.value && ajustar(i.id, { data: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Forma de pagamento</p>
                      <Select value={i.metodo} onValueChange={(v) => ajustar(i.id, { metodo: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{metodos.map((m) => <SelectItem key={m} value={m}>{METODO_ROTULO[m] ?? m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><p className="text-[11px] text-muted-foreground">Conta</p><p className="text-xs">{i.conta || "—"}</p></div>
                  </div>
                )}

                {i.problemas.map((p) => <p key={p} className="mt-1.5 text-xs text-red-600">• {p}</p>)}
                {!i.ja_baixado && i.erro_anterior && <p className="mt-1 text-xs text-amber-700">• Tentativa anterior: {i.erro_anterior}</p>}
              </div>
            ))}
            {!itens.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pagamento selecionado.</p>}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-muted-foreground">{prontos.length} de {itens.length} pronto(s) · {brl(total)}</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!escrita || enviando || carregando || !prontos.length} onClick={baixar} className="gap-1.5">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {escrita ? `Dar baixa em ${prontos.length}` : "Envio desligado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
