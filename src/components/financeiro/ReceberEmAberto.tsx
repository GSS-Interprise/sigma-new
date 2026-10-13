import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Em aberto por cliente — não segue o filtro de mês: mostra tudo o que ainda não foi recebido.
 * Duas origens, somadas no banco (fin_receber_em_aberto): as notas emitidas que entraram no
 * Sigma e as contas a receber que o Conta Azul ainda mostra sem baixa. "Saldo de recebimento
 * parcial" costuma ser diferença pequena de imposto retido que ficou sem baixa: por isso vem
 * separado e não entra como atraso.
 */
type Linha = {
  origem: "sigma" | "conta_azul"; ref: string; cliente: string; cliente_id: string | null;
  descricao: string | null; vencimento: string | null; valor: number; situacao: string; competencia: string | null;
};

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "sem vencimento");
const hojeIso = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const dias = (venc: string | null) => venc ? Math.floor((Date.parse(hojeIso()) - Date.parse(venc)) / 86400000) : 0;

export function ReceberEmAberto() {
  const [aberto, setAberto] = useState<string | null>(null);
  const { data: linhas = [], isLoading, error } = useQuery({
    queryKey: ["financeiro-receber-em-aberto"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fin_receber_em_aberto");
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const { clientes, totalAberto, totalVencido, totalParcial } = useMemo(() => {
    const mapa = new Map<string, { cliente: string; itens: Linha[]; aberto: number; vencido: number; parcial: number; maisAntigo: number }>();
    for (const l of linhas) {
      const c = mapa.get(l.cliente) ?? { cliente: l.cliente, itens: [], aberto: 0, vencido: 0, parcial: 0, maisAntigo: 0 };
      const v = Number(l.valor || 0);
      const parcial = l.situacao.startsWith("saldo");
      c.itens.push(l);
      if (parcial) c.parcial += v;
      else {
        c.aberto += v;
        const d = dias(l.vencimento);
        if (d > 0) { c.vencido += v; c.maisAntigo = Math.max(c.maisAntigo, d); }
      }
      mapa.set(l.cliente, c);
    }
    const lista = [...mapa.values()].sort((a, b) => b.vencido - a.vencido || b.aberto - a.aberto);
    return {
      clientes: lista,
      totalAberto: lista.reduce((s, c) => s + c.aberto, 0),
      totalVencido: lista.reduce((s, c) => s + c.vencido, 0),
      totalParcial: lista.reduce((s, c) => s + c.parcial, 0),
    };
  }, [linhas]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Em aberto por cliente</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tudo o que ainda não foi recebido, de qualquer mês: notas emitidas enviadas ao Sigma e contas a receber sem baixa no Conta Azul.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          : error ? <p className="py-4 text-center text-sm text-red-600">Não foi possível carregar: {(error as any)?.message}</p>
          : clientes.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nada em aberto.</p>
          : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-lg font-bold">{brl(totalAberto)}</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Vencido</p><p className="text-lg font-bold text-red-600">{brl(totalVencido)}</p>
                  <p className="text-[11px] text-muted-foreground">{clientes.filter((c) => c.vencido > 0).length} cliente(s) em atraso</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Saldo de recebimento parcial</p><p className="text-lg font-bold text-muted-foreground">{brl(totalParcial)}</p>
                  <p className="text-[11px] text-muted-foreground">diferenças pequenas que ficaram sem baixa no Conta Azul</p></div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6" />
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                      <TableHead className="text-right">Vencido</TableHead>
                      <TableHead className="text-right">Atraso mais antigo</TableHead>
                      <TableHead className="text-right">Saldo parcial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientes.map((c) => (
                      <Fragment key={c.cliente}>
                        <TableRow className="cursor-pointer [&>td]:py-1.5" onClick={() => setAberto(aberto === c.cliente ? null : c.cliente)}>
                          <TableCell>{aberto === c.cliente ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">{c.cliente}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{c.itens.length} título(s)</span></TableCell>
                          <TableCell className="text-right tabular-nums">{c.aberto ? brl(c.aberto) : "—"}</TableCell>
                          <TableCell className={`text-right tabular-nums ${c.vencido ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{c.vencido ? brl(c.vencido) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.maisAntigo ? `${c.maisAntigo} dias` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{c.parcial ? brl(c.parcial) : "—"}</TableCell>
                        </TableRow>
                        {aberto === c.cliente && c.itens
                          .slice().sort((a, b) => String(a.vencimento || "").localeCompare(String(b.vencimento || "")))
                          .map((l) => {
                            const d = dias(l.vencimento);
                            return (
                              <TableRow key={l.origem + l.ref} className="bg-muted/30 [&>td]:py-1 text-xs">
                                <TableCell />
                                <TableCell>
                                  {l.descricao || "—"}
                                  <span className="ml-2 text-muted-foreground">{l.origem === "sigma" ? "nota no Sigma" : "Conta Azul"} · {l.situacao}</span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{brl(l.valor)}</TableCell>
                                <TableCell className="text-right">{dataBr(l.vencimento)}</TableCell>
                                <TableCell className="text-right">{d > 0 && !l.situacao.startsWith("saldo") ? `${d} dias` : "—"}</TableCell>
                                <TableCell />
                              </TableRow>
                            );
                          })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
      </CardContent>
    </Card>
  );
}
