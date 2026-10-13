import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";

/**
 * Painéis do financeiro — leitura do espelho do Conta Azul (atualizado todo dia de manhã).
 * A conta é feita no banco (fin_painel_conta_azul) por mês de competência.
 *
 * ⚠ Receita: a GSS parou de lançar as contas a receber no Conta Azul em fev/2026 (as notas
 * passaram a ser emitidas no Portal Nacional). De lá para cá a receita aqui fica incompleta
 * até as notas emitidas entrarem pelo Sigma. O aviso na tela existe por isso.
 */
type Fatia = { nome: string; valor: number; n: number };
type Painel = {
  mensal: { mes: string; despesa: number | null; despesa_medicos: number | null; receita: number | null }[];
  categorias: Fatia[]; centros: Fatia[]; fornecedores: Fatia[]; clientes: Fatia[];
  totais: { despesa: number; despesa_medicos: number; receita: number }; perdas: number;
  caixa: { semana: string; a_pagar: number; a_receber: number }[];
  vencido: { a_pagar: number; a_pagar_n: number; a_receber: number; a_receber_n: number };
  ultima_receita: string | null; sincronizado_em: string | null;
};

const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const curto = (v: number) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesRotulo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const dataBr = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

function periodoDe(p: string): [string, string] {
  const hoje = new Date(Date.now() - 3 * 3600 * 1000);
  if (/^\d{4}$/.test(p)) return [`${p}-01-01`, `${p}-12-31`];
  // últimos 12 meses fechados + o mês corrente
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 11, 1));
  return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
}

function Ranking({ titulo, itens, total }: { titulo: string; itens: Fatia[]; total: number }) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? itens : itens.slice(0, 10);
  const maior = itens[0]?.valor || 1;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {lista.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sem lançamentos no período.</p>}
        {lista.map((i) => (
          <div key={i.nome} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={i.nome}>{i.nome}</span>
              <span className="shrink-0 tabular-nums">{brl(i.valor)} <span className="text-muted-foreground">· {total ? Math.round((i.valor / total) * 100) : 0}%</span></span>
            </div>
            <div className="mt-0.5 h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary/70" style={{ width: `${Math.max(2, (i.valor / maior) * 100)}%` }} /></div>
          </div>
        ))}
        {itens.length > 10 && (
          <button className="pt-1 text-xs text-primary hover:underline" onClick={() => setTudo(!tudo)}>
            {tudo ? "Mostrar só os 10 maiores" : `Ver os ${itens.length} maiores`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceiroPaineis() {
  const anoAtual = new Date().getFullYear();
  const [periodo, setPeriodo] = useState("12m");
  const [de, ate] = periodoDe(periodo);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ["financeiro-painel-conta-azul", de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fin_painel_conta_azul", { _de: de, _ate: ate });
      if (error) throw error;
      return data as Painel;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mensal = useMemo(() => (p?.mensal ?? []).map((m) => ({
    mes: mesRotulo(m.mes), Receita: Number(m.receita || 0), "Despesa com médicos": Number(m.despesa_medicos || 0),
    "Outras despesas": Number(m.despesa || 0) - Number(m.despesa_medicos || 0),
  })), [p]);
  const semReceita = (p?.mensal ?? []).filter((m) => !m.receita && Number(m.despesa || 0) > 0).map((m) => mesRotulo(m.mes));
  const caixa = (p?.caixa ?? []).map((c) => ({ semana: dataBr(c.semana).slice(0, 5), "A pagar": Number(c.a_pagar), "A receber": Number(c.a_receber) }));

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Carregando painéis…</p>;
  if (error || !p) return <p className="py-10 text-center text-sm text-red-600">Não foi possível carregar os painéis: {(error as any)?.message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Dados do Conta Azul, por mês de competência. Última leitura: {p.sincronizado_em ? new Date(p.sincronizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}.
        </p>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="12m">Últimos 12 meses</SelectItem>
            {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {semReceita.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <b>Receita incompleta neste período.</b> Não há contas a receber lançadas no Conta Azul em {semReceita.length} mês(es): {semReceita.join(", ")}.
            Nesses meses o resultado abaixo mostra só a despesa.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Receita</p><p className="text-xl font-bold text-emerald-600">{brl(p.totais.receita)}</p>
          {p.perdas > 0 && <p className="text-[11px] text-muted-foreground">fora {brl(p.perdas)} dados como perda</p>}</CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Despesa total</p><p className="text-xl font-bold">{brl(p.totais.despesa)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Despesa com médicos</p><p className="text-xl font-bold">{brl(p.totais.despesa_medicos)}</p>
          <p className="text-[11px] text-muted-foreground">{p.totais.despesa ? Math.round((p.totais.despesa_medicos / p.totais.despesa) * 100) : 0}% da despesa</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Receita menos despesa</p>
          <p className={`text-xl font-bold ${p.totais.receita - p.totais.despesa < 0 ? "text-red-600" : "text-emerald-600"}`}>{brl(p.totais.receita - p.totais.despesa)}</p>
          {semReceita.length > 0 && <p className="text-[11px] text-amber-700">receita incompleta: não é o resultado real</p>}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Receita e despesa por mês</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={curto} tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receita" fill="#10b981" />
                <Bar dataKey="Despesa com médicos" stackId="d" fill="#1e3a5f" />
                <Bar dataKey="Outras despesas" stackId="d" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Ranking titulo="Despesa por categoria (unidade)" itens={p.categorias} total={p.totais.despesa} />
        <Ranking titulo="Despesa por centro de custo" itens={p.centros} total={p.totais.despesa} />
        <Ranking titulo="Despesa por fornecedor" itens={p.fornecedores} total={p.totais.despesa} />
        <Ranking titulo="Receita por cliente" itens={p.clientes} total={p.totais.receita} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Previsão de caixa · próximas 8 semanas</CardTitle>
          <p className="text-xs text-muted-foreground">O que está lançado no Conta Azul sem baixa, pela semana do vencimento. Não depende do período escolhido acima.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Já vencido, a pagar</p>
              <p className="text-lg font-bold text-red-600">{brl(p.vencido.a_pagar)}</p><p className="text-[11px] text-muted-foreground">{p.vencido.a_pagar_n} lançamento(s) sem baixa</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Já vencido, a receber</p>
              <p className="text-lg font-bold text-amber-600">{brl(p.vencido.a_receber)}</p><p className="text-[11px] text-muted-foreground">{p.vencido.a_receber_n} lançamento(s) sem baixa</p></div>
          </div>
          {caixa.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nada lançado para as próximas semanas.</p> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={caixa} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={curto} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => brl(v)} labelFormatter={(l) => `Semana de ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="A receber" fill="#10b981" />
                  <Bar dataKey="A pagar" fill="#1e3a5f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
