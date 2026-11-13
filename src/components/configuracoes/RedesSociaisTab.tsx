import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, ExternalLink, Loader2, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/**
 * Configurações › LinkedIn (Fase 9.2) — pergunta da tela: "quem da GSS tem LinkedIn/Instagram ligado ao Sigma, e está
 * funcionando?". Decisão: conectar a conta de uma pessoa ou reconectar a que caiu.
 * O login é feito na página da Unipile (Hosted Auth): o Sigma nunca vê senha nem cookie, guarda só o id da conta.
 * Desenho e segurança: docs/arquitetura/linkedin-instagram-campanha.md.
 */

type Conta = {
  id: string; usuario_id: string; pessoa: string | null; provedor: "linkedin" | "instagram";
  gateway_account_id: string | null; nome_perfil: string | null; situacao: string; motivo: string | null;
  conectada_em: string | null; atualizado_em: string;
  automatico?: boolean; rampa_inicio?: string | null; convites_dia_teto?: number | null; motor_motivo?: string | null;
};

// Mesma conta da edge unipile-motor: 5 convites/dia na 1ª semana, +3 por semana, até o teto da conta.
function limiteHoje(c: Conta) {
  const semanas = c.rampa_inicio ? Math.floor((Date.now() - new Date(c.rampa_inicio).getTime()) / (7 * 86_400_000)) : 0;
  return Math.min(5 + 3 * semanas, c.convites_dia_teto ?? 20);
}

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  conectada: { rotulo: "Conectada", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  reconectar: { rotulo: "Reconectar", classe: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  pausada: { rotulo: "Pausada", classe: "bg-red-50 text-red-700 ring-red-600/20" },
  pendente: { rotulo: "Pendente", classe: "bg-muted text-muted-foreground ring-border" },
  desconectada: { rotulo: "Desconectada", classe: "bg-muted text-muted-foreground ring-border" },
};
const PROVEDOR = { linkedin: "LinkedIn", instagram: "Instagram" } as const;

async function chamar(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("unipile-conectar", { body: corpo });
  if (error) {
    // supabase-js esconde o corpo do erro; tenta ler a mensagem da edge
    const ctx: any = (error as any).context;
    const msg = ctx?.json ? (await ctx.json().catch(() => null))?.error : null;
    throw new Error(msg || error.message);
  }
  if (!data?.ok) throw new Error(data?.error || "falhou");
  return data;
}

const ERROS: Record<string, string> = {
  origem_nao_permitida: "Este endereço do Sigma não está liberado para conectar contas.",
  so_admin_conecta_para_outra_pessoa: "Só administrador conecta conta para outra pessoa.",
  state_invalido: "O retorno da Unipile não confere. Gere um link novo.",
};

export function RedesSociaisTab() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [provedor, setProvedor] = useState<"linkedin" | "instagram">("linkedin");
  const [pessoa, setPessoa] = useState<string>("");
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  const { data: eu } = useQuery({ queryKey: ["eu"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const { data: lista, isLoading } = useQuery({
    queryKey: ["redes-contas"],
    queryFn: () => chamar({ acao: "listar" }) as Promise<{ admin: boolean; contas: Conta[] }>,
  });
  const { data: pessoas } = useQuery({
    queryKey: ["profiles-ativos"],
    enabled: !!lista?.admin,
    queryFn: async () => (await supabase.from("profiles").select("id, nome_completo").eq("status", "ativo").order("nome_completo")).data ?? [],
  });
  useEffect(() => { if (eu && !pessoa) setPessoa(eu); }, [eu, pessoa]);

  // Volta da Unipile: ?account_id=...&state=... (sucesso) ou ?error_type=... (falha). Confirma uma vez e limpa a URL.
  const confirmou = useRef(false);
  useEffect(() => {
    const accountId = params.get("account_id"), state = params.get("state"), erro = params.get("error_type");
    if (confirmou.current || (!accountId && !erro)) return;
    confirmou.current = true;
    const limpar = () => setParams((p) => { ["account_id", "state", "provider", "error_type"].forEach((k) => p.delete(k)); return p; }, { replace: true });
    if (erro) { toast.error(`A conexão não terminou (${erro}). Tente de novo.`); limpar(); return; }
    chamar({ acao: "confirmar", account_id: accountId, state })
      .then((r) => { toast.success(`Conta conectada: ${r.conta?.nome_perfil ?? "perfil"}.`); qc.invalidateQueries({ queryKey: ["redes-contas"] }); })
      .catch((e) => toast.error(ERROS[e.message] ?? `Não deu para confirmar a conta: ${e.message}`))
      .finally(limpar);
  }, [params, setParams, qc]);

  const gerar = useMutation({
    mutationFn: (v: { modo: "abrir" | "copiar"; reconectar_id?: string }) =>
      chamar({ acao: "link", provedor, usuario_id: pessoa || undefined, origem: window.location.origin, reconectar_id: v.reconectar_id }),
    onSuccess: async (r, v) => {
      if (!r.link) { toast.error("A Unipile não devolveu o link."); return; }
      if (v.modo === "abrir") { window.location.href = r.link; return; }
      await navigator.clipboard.writeText(r.link).catch(() => null);
      setLinkCopiado(r.link);
      toast.success("Link copiado. Mande para a pessoa abrir no computador dela (vale 6 h).");
    },
    onError: (e: Error) => toast.error(ERROS[e.message] ?? e.message),
  });
  const desconectar = useMutation({
    mutationFn: (id: string) => chamar({ acao: "desconectar", id }),
    onSuccess: () => { toast.success("Conta desconectada. A sessão foi encerrada na Unipile."); qc.invalidateQueries({ queryKey: ["redes-contas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const motor = useMutation({
    mutationFn: async (v: { id: string; ligar: boolean }) => {
      const { error } = await (supabase as any).rpc("linkedin_motor_ligar", { p_conta_id: v.id, p_ligar: v.ligar });
      if (error) throw new Error(error.message.includes("so_administrador") ? "Só administrador liga o envio automático."
        : error.message.includes("conta_nao_conectada") ? "A conta precisa estar conectada." : error.message);
    },
    onSuccess: (_r, v) => {
      toast.success(v.ligar ? "Envio automático ligado: começa com 5 convites por dia, em dia útil, das 8h às 18h." : "Envio automático desligado.");
      qc.invalidateQueries({ queryKey: ["redes-contas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contas = (lista?.contas ?? []).filter((c) => c.situacao !== "desconectada");
  const ehOutraPessoa = !!pessoa && pessoa !== eu;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-base font-semibold">Conectar uma conta</h3>
        <p className="mt-1 text-sm text-muted-foreground">A pessoa entra com o próprio login na página da Unipile. O Sigma não guarda senha.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Rede</p>
            <Select value={provedor} onValueChange={(v) => setProvedor(v as typeof provedor)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {lista?.admin && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Conta de</p>
              <Select value={pessoa} onValueChange={setPessoa}>
                <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                <SelectContent>
                  {(pessoas ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.id === eu ? `${p.nome_completo} (você)` : p.nome_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Conta de outra pessoa: o natural é ela abrir o link no computador dela (Fitts: a ação certa vem primeiro). */}
          <Button className="h-9" variant={ehOutraPessoa ? "outline" : "default"} disabled={gerar.isPending} onClick={() => gerar.mutate({ modo: "abrir" })}>
            {gerar.isPending && gerar.variables?.modo === "abrir" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            Conectar aqui
          </Button>
          <Button className="h-9" variant={ehOutraPessoa ? "default" : "outline"} disabled={gerar.isPending} onClick={() => gerar.mutate({ modo: "copiar" })}>
            {gerar.isPending && gerar.variables?.modo === "copiar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
            Copiar link para a pessoa
          </Button>
        </div>
        {linkCopiado && (
          <p className="mt-3 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{linkCopiado}</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-base font-semibold">Contas conectadas</h3>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : contas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta ainda. Conecte o LinkedIn da primeira pessoa da GSS acima.</p>
        ) : (
          <ul className="divide-y">
            {contas.map((c) => {
              const s = SITUACAO[c.situacao] ?? SITUACAO.pendente;
              const caiu = c.situacao === "reconectar" || c.situacao === "pausada";
              return (
                <li key={c.id} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={c.nome_perfil ?? ""}>{c.nome_perfil || "Perfil sem nome"}</p>
                    <p className="truncate text-sm text-muted-foreground">{PROVEDOR[c.provedor]} · {c.pessoa ?? "pessoa sem cadastro"}</p>
                  </div>
                  <div className="min-w-0">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", s.classe)}>{s.rotulo}</span>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={c.motivo ?? ""}>
                      {caiu && c.motivo ? c.motivo : c.conectada_em ? `desde ${formatDistanceToNow(new Date(c.conectada_em), { locale: ptBR })}` : ""}
                    </p>
                    {/* Motor da 9.4: liga por conta, só admin, só LinkedIn conectado. */}
                    {c.provedor === "linkedin" && c.situacao === "conectada" && lista?.admin && (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <Switch checked={!!c.automatico} disabled={motor.isPending}
                          onCheckedChange={(v) => {
                            if (v && !window.confirm(`Ligar o envio automático de convites pela conta de ${c.pessoa ?? c.nome_perfil}? O risco de restrição é dessa conta. Começa com 5 por dia.`)) return;
                            motor.mutate({ id: c.id, ligar: v });
                          }} />
                        <span className={cn(c.automatico ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {c.automatico ? `Envio automático · até ${limiteHoje(c)} convites hoje` : c.motor_motivo?.startsWith("pausado") ? `Automático pausado: ${c.motor_motivo.replace(/^pausado sozinho: /, "")}` : "Envio automático desligado"}
                        </span>
                      </label>
                    )}
                  </div>
                  <div className="flex gap-2 md:justify-end">
                    {caiu && c.gateway_account_id && (
                      <Button size="sm" className="h-8" disabled={gerar.isPending} onClick={() => gerar.mutate({ modo: "abrir", reconectar_id: c.gateway_account_id! })}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reconectar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={desconectar.isPending}
                      onClick={() => { if (window.confirm(`Desconectar ${c.nome_perfil ?? "esta conta"}? A sessão é encerrada e o Sigma para de usar a conta.`)) desconectar.mutate(c.id); }}>
                      <Unplug className="mr-1.5 h-3.5 w-3.5" />Desconectar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
