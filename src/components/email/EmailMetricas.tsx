import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";

export type EmailMetricasRow = {
  campanha_id: string;
  total: number; na_fila: number; enviados: number; entregues: number; abertos: number;
  cliques: number; rejeitados: number; spam: number; descadastros: number; erros: number;
  ultimo_envio: string | null;
};

export const STATUS_ENVIO: Record<string, { label: string; cls: string }> = {
  fila:          { label: "Na fila",       cls: "bg-slate-100 text-slate-600" },
  enviado:       { label: "Enviado",       cls: "bg-sky-50 text-sky-700" },
  entregue:      { label: "Entregue",      cls: "bg-blue-50 text-blue-700" },
  aberto:        { label: "Abriu",         cls: "bg-emerald-50 text-emerald-700" },
  clicado:       { label: "Clicou",        cls: "bg-emerald-100 text-emerald-800" },
  rejeitado:     { label: "Rejeitado",     cls: "bg-amber-50 text-amber-700" },
  spam:          { label: "Marcou spam",   cls: "bg-red-50 text-red-700" },
  descadastrado: { label: "Descadastrou",  cls: "bg-orange-50 text-orange-700" },
  erro:          { label: "Erro",          cls: "bg-red-50 text-red-700" },
  bloqueado:     { label: "Bloqueado",     cls: "bg-slate-100 text-slate-500" },
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const POR_PAGINA = 50;

export function useEmailMetricas(campanhaId: string | null) {
  return useQuery({
    queryKey: ["email-metricas", campanhaId],
    enabled: !!campanhaId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_email_campanha_metricas")
        .select("*").eq("campanha_id", campanhaId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as EmailMetricasRow | null;
    },
  });
}

/** Números do envio + lista de quem recebeu, com filtro por situação. */
export function EmailMetricas({ campanhaId }: { campanhaId: string }) {
  const { data: m } = useEmailMetricas(campanhaId);
  const [filtro, setFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const { data: envios, isLoading } = useQuery({
    queryKey: ["email-envios", campanhaId, filtro, busca, pagina],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = (supabase as any).from("email_envios")
        .select("id, email, nome, status, erro, enviado_em, aberto_em, clicado_em", { count: "exact" })
        .eq("campanha_id", campanhaId)
        .order("enviado_em", { ascending: false, nullsFirst: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (filtro === "abriu") q = q.not("aberto_em", "is", null);
      else if (filtro === "clicou") q = q.not("clicado_em", "is", null);
      else if (filtro === "problema") q = q.in("status", ["rejeitado", "spam", "erro", "bloqueado"]);
      else if (filtro !== "todos") q = q.eq("status", filtro);
      if (busca.trim()) q = q.or(`email.ilike.%${busca.trim()}%,nome.ilike.%${busca.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  if (!m) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Nenhum e-mail enviado nesta campanha ainda.</p>;
  }

  const kpis = [
    { label: "Na fila", valor: m.na_fila, sub: `de ${m.total}` },
    { label: "Enviados", valor: m.enviados, sub: pct(m.enviados, m.total) },
    { label: "Entregues", valor: m.entregues, sub: pct(m.entregues, m.enviados) },
    { label: "Abriram", valor: m.abertos, sub: pct(m.abertos, m.entregues) },
    { label: "Clicaram", valor: m.cliques, sub: pct(m.cliques, m.entregues) },
    { label: "Descadastros", valor: m.descadastros, sub: pct(m.descadastros, m.entregues) },
    { label: "Rejeitados / spam", valor: m.rejeitados + m.spam, sub: pct(m.rejeitados + m.spam, m.enviados),
      alerta: m.enviados > 50 && (m.spam / m.enviados > 0.003 || m.rejeitados / m.enviados > 0.04) },
  ];
  const filtros = [
    ["todos", "Todos"], ["fila", "Na fila"], ["entregue", "Entregues"], ["abriu", "Abriram"],
    ["clicou", "Clicaram"], ["descadastrado", "Descadastros"], ["problema", "Com problema"],
  ];
  const totalPaginas = Math.max(1, Math.ceil((envios?.total ?? 0) / POR_PAGINA));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-md border px-3 py-2 ${k.alerta ? "border-red-300 bg-red-50" : ""}`}>
            <p className="text-lg font-semibold tabular-nums leading-tight">{k.valor.toLocaleString("pt-BR")}</p>
            <p className="text-[11px] text-muted-foreground">{k.label} · {k.sub}</p>
          </div>
        ))}
      </div>
      {kpis[6].alerta && (
        <p className="text-xs text-red-700">
          Taxa de rejeição/spam acima do seguro. Pause a campanha e revise a lista — acima de 0,3% de spam o Gmail passa a
          mandar os e-mails da GSS direto para o lixo.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {filtros.map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setFiltro(v); setPagina(0); }}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === v ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
            placeholder="Buscar nome ou e-mail" className="pl-8 h-9" />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Médico</th>
              <th className="text-left font-medium px-3 py-2">E-mail</th>
              <th className="text-left font-medium px-3 py-2">Situação</th>
              <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Enviado em</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
            ) : !envios?.linhas.length ? (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Ninguém nesta situação.</td></tr>
            ) : envios.linhas.map((e) => {
              const s = STATUS_ENVIO[e.status] ?? { label: e.status, cls: "" };
              return (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-1.5">{e.nome || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{e.email}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className={`border-0 ${s.cls}`} title={e.erro || undefined}>{s.label}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                    {e.enviado_em ? new Date(e.enviado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Página {pagina + 1} de {totalPaginas} · {envios?.total.toLocaleString("pt-BR")} pessoas</span>
          <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
