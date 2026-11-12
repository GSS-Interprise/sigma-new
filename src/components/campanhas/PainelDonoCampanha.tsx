import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { AlertTriangle, Mail, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motivoLegivel, nomeProprio } from "@/lib/textoDono";

/**
 * Resumo da campanha para o dono (plano GSS dono no comando, Fase 6).
 * Pergunta da tela: "esta campanha está dando resultado, e o que está travando?"
 * Funil do mercado (CFM) até o convertido; por número; motivo de falha só quando há falha.
 * Dados: RPC campanha_painel_dono (supabase/migrations/20261108220000_campanha_painel_dono.sql).
 */

type Painel = {
  funil: {
    universo_cfm: number | null; na_lista: number; enviados: number; entregues: number; responderam: number;
    interessados: number; convertidos: number; falharam: number; sem_whatsapp: number; aguardando_envio: number;
    ultimo_envio: string | null;
  };
  numeros: { numero: string; nome: string | null; enviados: number; entregues: number; responderam: number; falharam: number }[];
  email: { enviados: number; entregues: number; abertos: number; cliques: number } | null;
  respostas: { nome: string | null; texto: string; em: string }[];
  erros: { motivo: string; n: number }[];
};

const mil = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const fone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : e164;
};

// A RPC devolve todos os motivos brutos (somam 'falharam'); aqui viram até 4 linhas em português,
// e o resto entra em "Outros motivos" para a soma continuar batendo com o título.
function agruparMotivos(erros: { motivo: string; n: number }[]) {
  const por = new Map<string, number>();
  for (const e of erros) por.set(motivoLegivel(e.motivo), (por.get(motivoLegivel(e.motivo)) ?? 0) + e.n);
  const outros = por.get("Outros motivos") ?? 0;
  por.delete("Outros motivos");
  const lista = [...por].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);
  const resto = lista.slice(4).reduce((t, x) => t + x.n, 0) + outros;
  return [...lista.slice(0, 4), ...(resto > 0 ? [{ motivo: "Outros motivos", n: resto }] : [])];
}

export function PainelDonoCampanha({ campanhaId }: { campanhaId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["campanha-painel-dono", campanhaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("campanha_painel_dono", { p_campanha_id: campanhaId });
      if (error) throw error;
      return data as Painel;
    },
    refetchInterval: 120_000,
  });

  // Atalho para o Raio-X (Fase 7) com a especialidade e a UF da campanha (só quando há uma UF).
  const { data: alvo } = useQuery({
    queryKey: ["campanha-alvo-raiox", campanhaId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("campanhas")
        .select("especialidade_id, especialidade_ids, regiao_estado, regiao_estados").eq("id", campanhaId).maybeSingle();
      return data as { especialidade_id: string | null; especialidade_ids: string[] | null; regiao_estado: string | null; regiao_estados: string[] | null } | null;
    },
  });
  const espAlvo = alvo?.especialidade_id || alvo?.especialidade_ids?.[0];
  const ufsAlvo = alvo?.regiao_estados?.length ? alvo.regiao_estados : alvo?.regiao_estado ? [alvo.regiao_estado] : [];
  const raiox = espAlvo ? `/bi?tab=raiox&esp=${espAlvo}${ufsAlvo.length === 1 ? `&uf=${ufsAlvo[0]}` : ""}` : null;

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (error || !data) return <Card className="p-6 text-sm text-red-600">Não consegui montar o resumo. Recarregue a página.</Card>;

  const f = data.funil;
  const etapas: { rotulo: string; valor: number | null; base?: string }[] = [
    { rotulo: "Mercado (CFM)", valor: f.universo_cfm },
    { rotulo: "Na lista", valor: f.na_lista, base: f.universo_cfm ? `${pct(f.na_lista, f.universo_cfm)} do mercado` : undefined },
    { rotulo: "Enviados", valor: f.enviados, base: `${pct(f.enviados, f.na_lista)} da lista` },
    { rotulo: "Entregues", valor: f.entregues, base: `${pct(f.entregues, f.enviados)} dos enviados` },
    { rotulo: "Responderam", valor: f.responderam, base: `${pct(f.responderam, f.entregues)} dos entregues` },
    { rotulo: "Interessados", valor: f.interessados, base: `${pct(f.interessados, f.responderam)} das respostas` },
    { rotulo: "Convertidos", valor: f.convertidos, base: `${pct(f.convertidos, f.interessados)} dos interessados` },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {/* Funil numa linha só a partir de 1024 px: quebrar 4 + 3 corta a leitura da esquerda para a direita. */}
        <ol className="grid grid-cols-4 gap-2 lg:grid-cols-7">
          {etapas.map((e, i) => (
            <li key={e.rotulo} className="min-w-0 rounded-md bg-muted/40 px-3 py-2.5">
              <p className="truncate text-xs text-muted-foreground">{e.rotulo}</p>
              <p className={`text-lg font-semibold tabular-nums xl:text-xl ${i === etapas.length - 1 && (e.valor ?? 0) > 0 ? "text-emerald-700" : ""}`}>
                {e.valor === null ? "—" : mil(e.valor)}
              </p>
              <p className="truncate text-xs text-muted-foreground">{e.base || (e.valor === null ? "sem especialidade" : " ")}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          {mil(f.aguardando_envio)} ainda aguardam o primeiro envio
          {f.sem_whatsapp > 0 && ` · ${mil(f.sem_whatsapp)} sem WhatsApp`}
          {f.ultimo_envio && ` · último envio ${formatDistanceToNow(new Date(f.ultimo_envio), { addSuffix: true, locale: ptBR })}`}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Por canal</h3>
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-[36%] pb-1.5 font-medium">Canal</th>
                <th className="pb-1.5 text-right font-medium">Enviados</th>
                <th className="pb-1.5 text-right font-medium">Entregues</th>
                <th className="pb-1.5 text-right font-medium">Responderam</th>
                <th className="pb-1.5 text-right font-medium">Falharam</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.numeros.length === 0 && !data.email && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum envio ainda.</td></tr>
              )}
              {data.numeros.map((n) => (
                <tr key={n.numero}>
                  <td className="py-2 pr-2">
                    <p className="flex items-center gap-1.5 truncate"><MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />{n.numero.startsWith("+") ? fone(n.numero) : n.numero}</p>
                    {n.nome && <p className="truncate pl-5 text-xs text-muted-foreground">{n.nome}</p>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{mil(n.enviados)}</td>
                  <td className="py-2 text-right tabular-nums">{mil(n.entregues)}</td>
                  <td className="py-2 text-right tabular-nums">{mil(n.responderam)}</td>
                  <td className={`py-2 text-right tabular-nums ${n.falharam > 0 ? "text-red-600" : ""}`}>{mil(n.falharam)}</td>
                </tr>
              ))}
              {data.email && (
                <tr>
                  <td className="py-2 pr-2"><p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-sky-600" />E-mail</p>
                    <p className="pl-5 text-xs text-muted-foreground">{mil(data.email.abertos)} abriram</p></td>
                  <td className="py-2 text-right tabular-nums">{mil(data.email.enviados)}</td>
                  <td className="py-2 text-right tabular-nums">{mil(data.email.entregues)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">—</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {data.erros.length > 0 ? (
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Por que {mil(f.falharam)} não receberam
            </h3>
            <ul className="space-y-2 text-sm">
              {agruparMotivos(data.erros).map((e) => (
                <li key={e.motivo} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">{e.motivo}</span>
                  <span className="shrink-0 tabular-nums font-medium">{mil(e.n)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold">Entrega</h3>
            <p className="text-sm text-muted-foreground">Nenhuma falha de envio nesta campanha.</p>
          </Card>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">O que os médicos estão respondendo</h3>
          {raiox && (
            <Link to={raiox} className="shrink-0 text-xs text-primary hover:underline">Ver Raio-X desta especialidade</Link>
          )}
        </div>
        {data.respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém respondeu ainda.</p>
        ) : (
          <ul className="divide-y">
            {data.respostas.map((r, i) => (
              <li key={i} className="grid grid-cols-[180px_minmax(0,1fr)_110px] gap-3 py-2 text-sm">
                <span className="truncate font-medium">{r.nome ? nomeProprio(r.nome) : "Sem nome"}</span>
                <span className="line-clamp-2 text-muted-foreground">{r.texto}</span>
                <span className="text-right text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.em), { addSuffix: true, locale: ptBR })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
