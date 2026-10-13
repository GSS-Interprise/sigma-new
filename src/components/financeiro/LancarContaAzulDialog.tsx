import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Lançar no Conta Azul — a Maria Vitória seleciona as notas conferidas e vê, antes de enviar,
 * exatamente o que vai virar conta a pagar: fornecedor, categoria da unidade, centro de custo,
 * valor líquido da nota, descrição "REF. mês - NF nº" e vencimento.
 *
 * ⚠ O Conta Azul não deixa apagar conta a pagar pela integração. Por isso nada sai sem a prévia
 * e sem o clique de confirmação, e o envio pode ficar desligado (modo simulação): aí a tela
 * mostra o que seria lançado e o botão não envia.
 */
type Item = {
  id: string; medico: string; unidade: string | null; a_pagar: number;
  nf_numero: string | null; nf_bruto: number | null; nf_retencoes: number | null;
  valor: number | null; vencimento: string; competencia: string; descricao: string;
  fornecedor: { id: string; nome: string } | null;
  fornecedores_possiveis?: { id: string; nome: string }[];
  categoria: { id: string; nome: string; sugerida: boolean } | null;
  centro_custo: string | null; conta: string | null;
  ja_lancado: boolean; problemas: string[]; avisos: string[]; pronto: boolean;
};
type Ajuste = { valor?: number; vencimento?: string; categoria_id?: string; fornecedor_id?: string; nf_numero?: string };

const brl = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string) => s ? s.split("-").reverse().join("/") : "—";

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("financeiro-conta-azul", { body });
  if (error) {
    // o corpo do erro vem dentro do contexto da resposta
    const corpo = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(corpo?.detalhe || corpo?.error || error.message);
  }
  if (data?.ok === false) throw new Error(data.detalhe || data.error || "falha");
  return data;
}

export function LancarContaAzulDialog({ pagamentoIds, open, onOpenChange, onLancado }: {
  pagamentoIds: string[]; open: boolean; onOpenChange: (o: boolean) => void; onLancado: () => void;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [escrita, setEscrita] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = async (aj: Record<string, Ajuste>) => {
    setCarregando(true);
    try {
      const r = await chamar({ acao: "previa", pagamento_ids: pagamentoIds, ajustes: aj });
      setItens(r.itens || []); setEscrita(!!r.escrita_ligada);
    } catch (e: any) { toast.error("Não foi possível montar a prévia: " + e.message); }
    setCarregando(false);
  };

  useEffect(() => {
    if (!open) return;
    setAjustes({});
    carregar({});
    chamar({ acao: "categorias" }).then((r) => setCategorias(r.categorias || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pagamentoIds.join(",")]);

  const ajustar = (id: string, patch: Ajuste) => {
    const novo = { ...ajustes, [id]: { ...ajustes[id], ...patch } };
    setAjustes(novo);
    carregar(novo);
  };

  const prontos = itens.filter((i) => i.pronto);
  const total = prontos.reduce((s, i) => s + Number(i.valor || 0), 0);

  const lancar = async () => {
    setEnviando(true);
    try {
      const r = await chamar({ acao: "lancar", pagamento_ids: prontos.map((i) => i.id), ajustes, confirmar: true });
      if (r.erros) toast.warning(`${r.lancados} lançado(s), ${r.erros} com erro. Veja o detalhe em cada linha.`);
      else toast.success(`${r.lancados} conta(s) a pagar lançada(s) no Conta Azul.`);
      onLancado();
      await carregar(ajustes);
    } catch (e: any) { toast.error(e.message); }
    setEnviando(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lançar no Conta Azul</DialogTitle></DialogHeader>

        {!escrita && !carregando && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><b>Modo simulação.</b> O envio ao Conta Azul está desligado: esta tela mostra exatamente o que seria lançado, mas nada é enviado.</span>
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
                  {i.ja_lancado
                    ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">No Conta Azul</span>
                    : i.pronto
                      ? <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Falta resolver</span>}
                </div>

                {!i.ja_lancado && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div><p className="text-[11px] text-muted-foreground">Descrição</p><p>{i.descricao}</p></div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Valor a lançar (líquido)</p>
                      <Input className="h-8" inputMode="decimal" placeholder="0,00" key={`${i.id}-${i.valor}`}
                        defaultValue={i.valor != null ? i.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace(/\./g, "").replace(",", "."));
                          if (Number.isFinite(n) && n > 0 && n !== i.valor) ajustar(i.id, { valor: n });
                        }} />
                      {i.nf_bruto != null && <p className="text-[10px] text-muted-foreground">nota {brl(i.nf_bruto)} · retido {brl(i.nf_retencoes)}</p>}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Vencimento</p>
                      <Input className="h-8" type="date" value={i.vencimento} onChange={(e) => e.target.value && ajustar(i.id, { vencimento: e.target.value })} />
                    </div>
                    <div><p className="text-[11px] text-muted-foreground">Conta · centro de custo</p><p className="text-xs">{i.conta || "—"} · {i.centro_custo || "—"}</p></div>

                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground">Fornecedor no Conta Azul</p>
                      {i.fornecedores_possiveis?.length ? (
                        <Select value={i.fornecedor?.id ?? ""} onValueChange={(v) => ajustar(i.id, { fornecedor_id: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Escolha o fornecedor" /></SelectTrigger>
                          <SelectContent>{i.fornecedores_possiveis.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <p>{i.fornecedor?.nome || <span className="text-amber-700">não encontrado</span>}</p>}
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground">Categoria {i.categoria?.sugerida && <span className="text-amber-700">(sugerida: confira)</span>}</p>
                      <Select value={i.categoria?.id ?? ""} onValueChange={(v) => ajustar(i.id, { categoria_id: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Escolha a categoria MED." /></SelectTrigger>
                        <SelectContent className="max-h-72">{categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {i.problemas.map((p) => <p key={p} className="mt-1.5 text-xs text-red-600">• {p}</p>)}
                {!i.ja_lancado && i.avisos.map((a) => <p key={a} className="mt-1 text-xs text-amber-700">• {a}</p>)}
              </div>
            ))}
            {!itens.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pagamento selecionado.</p>}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-muted-foreground">
            {prontos.length} de {itens.length} pronto(s) · {brl(total)}
            {prontos[0] && <> · vencimento {dataBr(prontos[0].vencimento)}</>}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!escrita || enviando || carregando || !prontos.length} onClick={lancar} className="gap-1.5">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {escrita ? `Lançar ${prontos.length} no Conta Azul` : "Envio desligado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
