import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

/**
 * Quem converteu × quem assinou (T12 de docs/arquitetura/licitacoes-contratos-gss.md). Ramone,
 * reunião de 07/10: "para a alta gestão, quem converteu e o médico que não assinou, por exemplo por
 * causa da multa". Assinado = aprovação "Contrato assinado" na conversão; "não assinou" = motivo
 * registrado na ficha; o resto fica pendente. Conversões sem responsável registrado aparecem em
 * linha própria (falha antiga de atribuição: só ~40% das conversões têm quem converteu).
 */
type Periodo = "tudo" | "90" | "30" | "mes";

export function IndicadorConversaoAssinatura() {
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [ini, fim] = useMemo(() => {
    if (periodo === "tudo") return [null, null];
    const hoje = new Date();
    if (periodo === "mes") return [new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString(), null];
    return [new Date(Date.now() - Number(periodo) * 864e5).toISOString(), null];
  }, [periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ["indicador-conversao-assinatura", ini, fim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("indicador_conversao_assinatura", { _ini: ini, _fim: fim });
      if (error) throw error;
      return data as any;
    },
  });
  const pessoas = (data?.pessoas ?? []) as any[];
  const total = pessoas.reduce((a, p) => ({ c: a.c + p.convertidos, s: a.s + p.assinados, n: a.n + p.nao_assinaram, p: a.p + p.pendentes }), { c: 0, s: 0, n: 0, p: 0 });
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
        <CardTitle className="text-base">Conversão × assinatura do contrato, por pessoa</CardTitle>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="ml-auto h-8 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tudo">Desde o início</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <div className="py-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Convertidos", total.c, ""], ["Assinaram", total.s, pct(total.s, total.c)], ["Pendentes", total.p, pct(total.p, total.c)], ["Não assinaram", total.n, pct(total.n, total.c)]].map(([r, v, x]) => (
                <div key={r as string} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-2xl font-semibold tabular-nums">{v as number}</p>{x && <p className="text-xs text-muted-foreground">{x}</p>}</div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="p-2 text-left font-medium">Quem converteu</th><th className="p-2 text-right font-medium">Convertidos</th><th className="p-2 text-right font-medium">Assinaram</th><th className="p-2 text-right font-medium">Pendentes</th><th className="p-2 text-right font-medium">Não assinaram</th><th className="p-2 text-right font-medium">% assinatura</th></tr>
                </thead>
                <tbody>
                  {pessoas.map((p) => (
                    <tr key={p.pessoa} className="border-t">
                      <td className={p.pessoa === "Sem responsável registrado" ? "p-2 italic text-muted-foreground" : "p-2"}>{p.pessoa}</td>
                      <td className="p-2 text-right tabular-nums">{p.convertidos}</td>
                      <td className="p-2 text-right tabular-nums">{p.assinados}</td>
                      <td className="p-2 text-right tabular-nums">{p.pendentes}</td>
                      <td className="p-2 text-right tabular-nums">{p.nao_assinaram}</td>
                      <td className="p-2 text-right tabular-nums">{pct(p.assinados, p.convertidos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(data?.motivos ?? []).length > 0 && (
              <div className="text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por que não assinaram</p>
                <div className="flex flex-wrap gap-2">
                  {data.motivos.map((m: any) => <span key={m.motivo} className="rounded-md border px-2 py-1 text-xs">{m.motivo}: <b>{m.n}</b></span>)}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              "Não assinou" é registrado na conversão do lead, com motivo. Conversões sem responsável registrado vêm de antes do Sigma gravar quem converteu.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
