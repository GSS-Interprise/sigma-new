import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronDown, Copy, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Configurações › Agente do Sigma (só admin). Pergunta da tela: "quem da GSS está usando o Claude no Sigma, o que ele
 * enxerga e ele está respondendo certo?". Decisões: liberar um assunto para um papel, desligar uma conexão e comparar
 * duas respostas que divergiram. Desenho: docs/arquitetura/protocolo-agente-sigma.md §3g.
 * Dados: RPC agente_admin_painel (pessoas, conexões, chamadas) e GET sigma-mcp/admin/protocolo (guia e regras pelo
 * MESMO código que o agente lê, para o admin ver o texto exato que chega ao Claude).
 */

const MCP = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sigma-mcp";
const DIAS = 7;
const PAPEIS: Record<string, string> = { admin: "Admin", diretoria: "Diretoria" };
const CONVITE =
  `Para perguntar ao Claude sobre a operação da GSS: no Claude, abra Configurações › Conectores › Adicionar conector ` +
  `personalizado, cole ${MCP} e entre com o seu login do Sigma. Depois é só perguntar, por exemplo: ` +
  `"quais plantões estão descobertos esta semana?"`;

type Pessoa = { id: string; nome: string; email?: string };
type Conexao = {
  id: string; user_id: string; pessoa: string; nome: string; origem: string; prefixo: string;
  cliente: string | null; criado_em: string; ultimo_uso_em: string | null;
};
type Chamada = {
  id: number; criado_em: string; pessoa: string; metodo: string; ferramenta: string | null; dominio: string | null;
  argumentos: Record<string, unknown> | null; ok: boolean; erro: string | null; duracao_ms: number | null;
  protocolo_versao: string | null; resultado_hash: string | null; fonte_atualizada_em: string | null;
};
type Painel = {
  papeis: { papel: string; pessoas: Pessoa[] }[];
  acessos: { papel: string; dominio: string }[];
  conexoes: Conexao[];
  chamadas: Chamada[];
  totais: { conectadas: number; usando: number; perguntas: number; erros: number };
};
type Dominio = {
  id: string; titulo: string; status: "ativo" | "em_breve"; versao: string; resumo: string;
  guia: string; fonte: { nome: string; atualizado_em: string | null } | null;
};
type Protocolo = { protocolo: string; constituicao: string; dominios: Dominio[] };

// Mesma pessoa com duas contas (ex.: e-mail pessoal e da GSS): o e-mail desfaz a dúvida.
const nomesUnicos = (ps: Pessoa[]) =>
  ps.map((x) => (ps.filter((y) => y.nome === x.nome).length > 1 && x.email ? `${x.nome} (${x.email})` : x.nome));
const dataHora = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM HH:mm", { locale: ptBR }) : "—");
const args = (a: Record<string, unknown> | null) =>
  a && Object.keys(a).length ? Object.entries(a).map(([k, v]) => `${k}=${String(v)}`).join(", ") : "sem argumentos";

function Copiar({ texto, rotulo, principal }: { texto: string; rotulo: string; principal?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant={principal ? "default" : "outline"} size="sm" className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          toast.error("O navegador não deixou copiar. Selecione o texto e copie à mão.");
        }
      }}
    >
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {ok ? "Copiado" : rotulo}
    </Button>
  );
}

function Numero({ valor, rotulo, alerta }: { valor: number | undefined; rotulo: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-2xl font-semibold tabular-nums leading-none", alerta && "text-destructive")}>{valor ?? "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function AgenteSigmaTab() {
  const qc = useQueryClient();
  const [desligar, setDesligar] = useState<Conexao | null>(null);
  const [marcadas, setMarcadas] = useState<number[]>([]);

  const painel = useQuery({
    queryKey: ["agente-sigma", "painel", DIAS],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("agente_admin_painel", { p_dias: DIAS });
      if (error) throw new Error(error.message);
      return data as Painel;
    },
  });
  const protocolo = useQuery({
    queryKey: ["agente-sigma", "protocolo"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sigma-mcp/admin/protocolo", { method: "GET" });
      if (error) throw new Error(error.message);
      return data as Protocolo;
    },
    staleTime: 60_000,
  });

  const acesso = useMutation({
    mutationFn: async (v: { papel: string; dominio: string; liberado: boolean }) => {
      const { error } = await (supabase as any).rpc("agente_definir_acesso", { p_papel: v.papel, p_dominio: v.dominio, p_liberado: v.liberado });
      if (error) throw new Error(error.message);
      return v;
    },
    onSuccess: (v) => {
      toast.success(`${PAPEIS[v.papel] ?? v.papel} ${v.liberado ? "passa a ver" : "deixa de ver"} ${v.dominio} na próxima pergunta.`);
      qc.invalidateQueries({ queryKey: ["agente-sigma", "painel"] });
    },
    onError: (e: Error) => toast.error(`Não mudou o acesso: ${e.message}`),
  });
  const revogar = useMutation({
    mutationFn: async (c: Conexao) => {
      const { error } = await (supabase as any).rpc("agente_admin_revogar", { p_token: c.id });
      if (error) throw new Error(error.message);
      return c;
    },
    onSuccess: (c) => {
      setDesligar(null);
      toast.success(`Conexão de ${c.pessoa} desligada. Esse Claude parou de ler o Sigma.`);
      qc.invalidateQueries({ queryKey: ["agente-sigma", "painel"] });
    },
    onError: (e: Error) => toast.error(`Não desligou: ${e.message}`),
  });

  const p = painel.data;
  const dominios = protocolo.data?.dominios ?? [];
  const ativos = dominios.filter((d) => d.status === "ativo");
  const emBreve = dominios.filter((d) => d.status === "em_breve");
  const liberado = (papel: string, dominio: string) => !!p?.acessos.some((a) => a.papel === papel && a.dominio === dominio);
  const papeis = p?.papeis.length ? p.papeis : Object.keys(PAPEIS).map((papel) => ({ papel, pessoas: [] }));
  const comparar = useMemo(
    () => (p?.chamadas ?? []).filter((c) => marcadas.includes(c.id)).sort((a, b) => a.id - b.id),
    [p, marcadas],
  );
  const marcar = (id: number) =>
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m.slice(-1), id]));

  return (
    <div className="space-y-4">
      {/* Topo: conectar alguém + os 3 números que dizem se está em uso e saudável. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 basis-96 space-y-2">
            <h2 className="font-semibold">Conectar o Claude de alguém da GSS</h2>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 basis-64 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{MCP}</code>
              <Copiar texto={CONVITE} rotulo="Copiar convite" principal />
              <Copiar texto={MCP} rotulo="Copiar endereço" />
            </div>
            <p className="text-xs text-muted-foreground">
              O convite já explica o passo a passo. A pessoa entra com o login do Sigma e precisa ser admin ou diretoria.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-6">
            <Numero valor={p?.totais.conectadas} rotulo="pessoas conectadas" />
            <Numero valor={p?.totais.perguntas} rotulo={`perguntas em ${DIAS} dias`} />
            <Numero valor={p?.totais.erros} rotulo={`erros em ${DIAS} dias`} alerta={!!p?.totais.erros} />
          </div>
        </div>
      </Card>

      {painel.isError && (
        <Card className="p-4 text-sm text-destructive">
          Não carregou os dados do agente: {(painel.error as Error).message}. Recarregue a página.
        </Card>
      )}

      {/* Quem acessa: papel × assunto. */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">O que cada papel enxerga</h2>
          <p className="text-sm text-muted-foreground">Vale na próxima pergunta. Pessoas do mesmo papel recebem as mesmas respostas.</p>
        </div>
        {(painel.isLoading || protocolo.isLoading) && <Skeleton className="h-32 w-full" />}
        {protocolo.isError && (
          <p className="text-sm text-destructive">Não carregou a lista de assuntos: {(protocolo.error as Error).message}.</p>
        )}
        {p && ativos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Assunto</th>
                  {papeis.map((pp) => (
                    <th key={pp.papel} className="w-32 py-2 pr-4 font-medium">
                      {PAPEIS[pp.papel] ?? pp.papel} · {pp.pessoas.length}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ativos.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{d.titulo}</td>
                    {papeis.map((pp) => (
                      <td key={pp.papel} className="py-2.5 pr-4">
                        <Switch
                          checked={liberado(pp.papel, d.id)}
                          disabled={acesso.isPending}
                          aria-label={`${PAPEIS[pp.papel] ?? pp.papel} vê ${d.titulo}`}
                          onCheckedChange={(v) => acesso.mutate({ papel: pp.papel, dominio: d.id, liberado: v })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {emBreve.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Em breve (nascem desligados): {emBreve.map((d) => d.titulo).join(", ")}.
          </p>
        )}
        {p && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {papeis.map((pp) => (
              <li key={pp.papel}>
                <span className="font-medium text-foreground">{PAPEIS[pp.papel] ?? pp.papel}:</span>{" "}
                {pp.pessoas.length ? nomesUnicos(pp.pessoas).join(", ") : "ninguém com esse papel"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Conexões ativas. */}
      <Card className="p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Claudes conectados</h2>
          {p && <span className="text-sm text-muted-foreground">{p.conexoes.length} {p.conexoes.length === 1 ? "conexão" : "conexões"}</span>}
        </div>
        {painel.isLoading && <Skeleton className="h-12 w-full" />}
        {p && p.conexoes.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguém conectou ainda. Mande o convite acima.</p>
        )}
        {p && p.conexoes.length > 0 && (
          <ul className="divide-y">
            {p.conexoes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.pessoa}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.origem === "oauth" ? (c.cliente || "Login do Sigma") : `Token ${c.prefixo}… (${c.nome})`} ·{" "}
                    {c.ultimo_uso_em
                      ? `usado ${formatDistanceToNow(new Date(c.ultimo_uso_em), { locale: ptBR, addSuffix: true })}`
                      : "ainda não usado"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setDesligar(c)}>
                  <Unplug className="h-4 w-4" /> Desligar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Perguntas recentes e comparação de duas. */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Perguntas dos últimos {DIAS} dias</h2>
          <p className="text-sm text-muted-foreground">Respostas diferentes para a mesma pergunta? Marque as duas para comparar.</p>
        </div>
        {comparar.length === 2 && <Comparacao a={comparar[0]} b={comparar[1]} limpar={() => setMarcadas([])} />}
        {painel.isLoading && <Skeleton className="h-24 w-full" />}
        {p && p.chamadas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma pergunta nos últimos {DIAS} dias.</p>
        )}
        {p && p.chamadas.length > 0 && (
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-10 py-2 pl-3" aria-label="Comparar" />
                  <th className="w-28 py-2 pr-3 font-medium">Quando</th>
                  <th className="w-44 py-2 pr-3 font-medium">Pessoa</th>
                  <th className="py-2 pr-3 font-medium">Pergunta ao Sigma</th>
                  <th className="w-40 py-2 pr-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {p.chamadas.map((c) => (
                  <tr key={c.id} className={cn("border-b last:border-0", marcadas.includes(c.id) && "bg-muted/60")}>
                    <td className="py-2 pl-3 align-top">
                      <Checkbox
                        checked={marcadas.includes(c.id)}
                        onCheckedChange={() => marcar(c.id)}
                        aria-label={`Comparar a pergunta de ${c.pessoa} às ${dataHora(c.criado_em)}`}
                      />
                    </td>
                    <td className="py-2 pr-3 align-top tabular-nums text-muted-foreground">{dataHora(c.criado_em)}</td>
                    <td className="truncate py-2 pr-3 align-top" title={c.pessoa}>{c.pessoa}</td>
                    <td className="py-2 pr-3 align-top">
                      <p className="truncate font-mono text-xs" title={c.ferramenta ?? c.metodo}>
                        {c.metodo === "tools/call" ? c.ferramenta : `${c.metodo === "prompts/get" ? "pergunta-padrão" : "guia"}: ${c.ferramenta}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={args(c.argumentos)}>{args(c.argumentos)}</p>
                    </td>
                    <td className="py-2 pr-3 align-top text-xs">
                      {c.ok ? (
                        <span className="text-muted-foreground">ok{c.duracao_ms != null ? ` · ${(c.duracao_ms / 1000).toFixed(1)} s` : ""}</span>
                      ) : (
                        <span className="line-clamp-2 text-destructive" title={c.erro ?? ""}>{c.erro || "erro"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Máquina por último: o protocolo e o guia que o agente lê. */}
      <Card className="p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Guia que o agente lê</h2>
          {protocolo.data && <span className="text-sm text-muted-foreground">protocolo v{protocolo.data.protocolo}</span>}
        </div>
        {protocolo.isLoading && <Skeleton className="h-16 w-full" />}
        {protocolo.data && (
          <div className="divide-y rounded-md border">
            <Bloco titulo="Regras gerais" sub="o que todo Claude recebe ao conectar" texto={protocolo.data.constituicao} />
            {dominios.map((d) => (
              <Bloco
                key={d.id}
                titulo={d.titulo}
                sub={d.status === "em_breve"
                  ? "ainda não ligado"
                  : `v${d.versao} · ${d.fonte?.atualizado_em ? `${d.fonte.nome} atualizado ${dataHora(d.fonte.atualizado_em)}` : "fonte sem dado"}`}
                texto={d.guia}
              />
            ))}
          </div>
        )}
      </Card>

      <AlertDialog open={!!desligar} onOpenChange={(o) => !o && setDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o Claude de {desligar?.pessoa}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esse Claude para de ler o Sigma na hora. Para voltar, a pessoa conecta de novo pelo convite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (desligar) revogar.mutate(desligar); }}
              disabled={revogar.isPending}
            >
              {revogar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Bloco({ titulo, sub, texto }: { titulo: string; sub: string; texto: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{titulo}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t bg-muted/30 px-3 py-3 font-sans text-xs leading-relaxed">
          {texto}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Duas chamadas lado a lado. O hash decide: igual = mesmo fato (diferença só de redação); diferente = mostra o porquê. */
function Comparacao({ a, b, limpar }: { a: Chamada; b: Chamada; limpar: () => void }) {
  const mesmoHash = !!a.resultado_hash && a.resultado_hash === b.resultado_hash;
  const motivos: string[] = [];
  if (a.ferramenta !== b.ferramenta) motivos.push("ferramentas diferentes");
  if (args(a.argumentos) !== args(b.argumentos)) motivos.push("argumentos diferentes");
  if (a.fonte_atualizada_em !== b.fonte_atualizada_em) motivos.push("dado de horários diferentes");
  if (a.protocolo_versao !== b.protocolo_versao) motivos.push("versões do protocolo diferentes");
  const veredito = !a.resultado_hash || !b.resultado_hash
    ? (!a.ok || !b.ok
      ? "Uma das duas deu erro, então não há fato para comparar. Veja o erro na lista."
      : "Uma das duas foi feita antes de o Sigma registrar o fato de cada resposta (14/11/2026).")
    : mesmoHash
      ? "Mesmo fato. As duas receberam o mesmo dado do Sigma; a diferença foi só na redação do Claude."
      : `Fatos diferentes: ${motivos.length ? motivos.join(", ") : "o dado mudou entre as duas"}.`;
  const linhas: [string, (c: Chamada) => string][] = [
    ["Pessoa", (c) => c.pessoa],
    ["Quando", (c) => dataHora(c.criado_em)],
    ["Ferramenta", (c) => c.ferramenta ?? c.metodo],
    ["Argumentos", (c) => args(c.argumentos)],
    ["Hora do dado", (c) => dataHora(c.fonte_atualizada_em)],
    ["Protocolo", (c) => (c.protocolo_versao ? `v${c.protocolo_versao}` : "—")],
    ["Hash", (c) => (c.resultado_hash ? c.resultado_hash.slice(0, 12) : "—")],
  ];
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-sm font-medium", !mesmoHash && a.resultado_hash && b.resultado_hash && "text-amber-700")}>{veredito}</p>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={limpar}>Fechar</Button>
      </div>
      <table className="w-full table-fixed text-xs">
        <tbody>
          {linhas.map(([rot, f]) => (
            <tr key={rot} className={cn("border-t", f(a) !== f(b) && rot !== "Pessoa" && rot !== "Quando" && "bg-amber-50")}>
              <td className="w-28 py-1.5 pr-2 text-muted-foreground">{rot}</td>
              <td className="break-words py-1.5 pr-2 font-mono">{f(a)}</td>
              <td className="break-words py-1.5 font-mono">{f(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
