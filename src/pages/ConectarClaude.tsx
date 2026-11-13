import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { guardarVolta } from "@/lib/voltaAposLogin";

/**
 * /conectar-claude — Claude dos sócios da GSS (docs/arquitetura/claude-socios-gss.md, T5 e T7).
 * Pergunta da tela: "meu Claude está ligado ao Sigma?". Decisão: conectar, autorizar o pedido do Claude ou desligar.
 *
 * Dois modos pela URL:
 *  - com client_id na query: o Claude.ai/celular/Desktop mandou o sócio aprovar o acesso (OAuth, edge sigma-mcp
 *    /authorize). Tela focada, sem menu: quem pede, o que poderá ler e dois botões.
 *  - sem query: as conexões do próprio sócio (login OAuth e tokens do Claude Code), com o endereço para conectar.
 * Fica fora de Configurações porque lá só entra admin, e os sócios são diretoria.
 * Rota sem ProtectedRoute: o pedido OAuth precisa sobreviver ao login (guardarVolta).
 */

const MCP = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sigma-mcp";

export default function ConectarClaude() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const local = useLocation();

  if (loading) return <Carregando />;
  if (!user) {
    guardarVolta(local.pathname + local.search);
    return <Navigate to="/auth" replace />;
  }
  return params.get("client_id") ? <Aprovar params={params} /> : <Conexoes />;
}

function Carregando() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---- modo 1: aprovar o pedido do Claude ------------------------------------------------------------------

type Pedido = { cliente: string; destino: string };

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="bg-[#1b3a5b] px-6 py-4">
          <p className="text-white text-base font-bold tracking-wide">GSS <span className="font-normal opacity-80">Saúde</span></p>
          <p className="text-[#9fc0e0] text-[11px] uppercase tracking-[0.15em] mt-0.5">Sigma · Claude dos sócios</p>
        </div>
        <div className="p-6 space-y-5">{children}</div>
      </Card>
    </div>
  );
}

function Aprovar({ params }: { params: URLSearchParams }) {
  const { user } = useAuth();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"sim" | "nao" | null>(null);
  const [voltando, setVoltando] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${MCP}/oauth/pedido?${params.toString()}`).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (r?.ok) setPedido(j as Pedido);
      else setErro("Este pedido de conexão não vale mais. Volte ao Claude e conecte de novo.");
    })();
  }, [params]);

  const responder = async (aprovar: boolean) => {
    setEnviando(aprovar ? "sim" : "nao");
    setErro(null);
    const { data } = await supabase.auth.getSession();
    const r = await fetch(`${MCP}/oauth/aprovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ params: Object.fromEntries(params), aprovar }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && j.redirect) {
      setVoltando(true);
      window.location.assign(j.redirect);
      return;
    }
    setEnviando(null);
    if (r?.status === 403) setErro("Seu usuário não tem acesso ao Claude dos sócios. Peça ao administrador do Sigma.");
    else if (r?.status === 401) setErro("Sua sessão no Sigma expirou. Entre de novo e repita a conexão pelo Claude.");
    else setErro("Não foi possível concluir. Volte ao Claude e conecte de novo.");
  };

  if (voltando) {
    return (
      <Moldura>
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-emerald-600" /> Pronto. Voltando para o Claude…
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura>
      {!pedido && !erro && (
        <div className="space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-16 w-full" /></div>
      )}
      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}
      {pedido && (
        <>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold leading-tight">Conectar o {pedido.cliente} ao Sigma?</h1>
            <p className="text-sm text-muted-foreground">
              Ele vai poder <strong className="text-foreground">ler</strong> as escalas do Dr. Escala em seu nome:
              hospitais, plantões descobertos e quem está escalado. Não envia nem altera nada.
            </p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Você</dt>
            <dd className="truncate">{user?.email}</dd>
            <dt className="text-muted-foreground">Volta para</dt>
            <dd className="truncate">{pedido.destino}</dd>
          </dl>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => responder(true)} disabled={!!enviando}>
              {enviando === "sim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Autorizar
            </Button>
            <Button variant="outline" onClick={() => responder(false)} disabled={!!enviando}>
              {enviando === "nao" && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Dá para desligar quando quiser em “Conectar o Claude”, no menu do Sigma.</p>
        </>
      )}
    </Moldura>
  );
}

// ---- modo 2: minhas conexões -----------------------------------------------------------------------------

type Conexao = {
  id: string; nome: string; origem: "manual" | "oauth"; prefixo: string; criado_em: string;
  ultimo_uso_em: string | null; refresh_expira_em: string | null;
};

const ativa = (c: Conexao & { revogado_em: string | null }) =>
  !c.revogado_em && (c.origem === "manual" || (!!c.refresh_expira_em && new Date(c.refresh_expira_em) > new Date()));

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="outline" size="sm" className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {ok ? "Copiado" : rotulo}
    </Button>
  );
}

function Conexoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<Conexao | null>(null);

  const papel = useQuery({
    queryKey: ["conectar-claude", "papel", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      return (data || []).some((r) => r.role === "admin" || r.role === "diretoria");
    },
  });

  const conexoes = useQuery({
    queryKey: ["conectar-claude", "conexoes", user?.id],
    enabled: papel.data === true,
    queryFn: async () => {
      // Filtra pelo dono: o admin enxerga as conexões de todos pela RLS, mas esta tela é "as minhas".
      const { data, error } = await (supabase as any).from("mcp_tokens")
        .select("id, nome, origem, prefixo, criado_em, ultimo_uso_em, revogado_em, refresh_expira_em")
        .eq("user_id", user!.id).order("criado_em", { ascending: false });
      if (error) throw error;
      return ((data || []) as (Conexao & { revogado_em: string | null })[]).filter(ativa);
    },
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("mcp_gerar_token", { p_nome: "Claude Code" });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (t) => {
      setToken(t);
      qc.invalidateQueries({ queryKey: ["conectar-claude", "conexoes"] });
    },
    onError: () => toast.error("Não foi possível gerar o token. Tente de novo."),
  });

  const revogar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("mcp_tokens").update({ revogado_em: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conexão desligada. Esse Claude não lê mais o Sigma.");
      setDesligar(null);
      qc.invalidateQueries({ queryKey: ["conectar-claude", "conexoes"] });
    },
    onError: () => toast.error("Não foi possível desligar. Tente de novo."),
  });

  const comando = token ? `claude mcp add --transport http sigma-gss ${MCP} --header "Authorization: Bearer ${token}"` : "";
  const lista = conexoes.data || [];

  return (
    <AppLayout
      headerActions={
        <div>
          <h1 className="text-2xl font-bold">Conectar o Claude</h1>
          <p className="text-sm text-muted-foreground">Pergunte ao seu Claude sobre as escalas da GSS</p>
        </div>
      }
    >
      <div className="p-4 max-w-3xl space-y-4">
        {papel.isLoading && <Skeleton className="h-40 w-full" />}

        {papel.data === false && (
          <Card className="p-5 text-sm">
            Seu usuário não tem acesso ao Claude dos sócios. Ele é liberado para a diretoria; peça ao administrador do Sigma.
          </Card>
        )}

        {papel.data && (
          <>
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold">Endereço do conector</h2>
                <p className="text-sm text-muted-foreground">
                  No Claude: Configurações › Conectores › Adicionar conector personalizado. Cole o endereço e entre com o seu login do Sigma.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{MCP}</code>
                <Copiar texto={MCP} />
              </div>
              <p className="text-xs text-muted-foreground">
                Vale para o Claude no navegador, no celular e no Desktop. Exemplo de pergunta: “quais plantões estão descobertos esta semana?”
              </p>
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">Suas conexões</h2>
                {!conexoes.isLoading && <span className="text-sm text-muted-foreground">{lista.length} {lista.length === 1 ? "ativa" : "ativas"}</span>}
              </div>
              {conexoes.isLoading && <Skeleton className="h-12 w-full" />}
              {conexoes.isError && <p className="text-sm text-destructive">Não foi possível carregar as conexões. Recarregue a página.</p>}
              {!conexoes.isLoading && !conexoes.isError && lista.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum Claude conectado ainda. Use o endereço acima.</p>
              )}
              <ul className="divide-y">
                {lista.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.origem === "oauth" ? "Login do Sigma" : `Token ${c.prefixo}…`} ·{" "}
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
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Token para o Claude Code</h2>
                  <p className="text-sm text-muted-foreground">Só se o Claude Code não abrir o login sozinho.</p>
                </div>
                {!token && (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
                    {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Gerar token
                  </Button>
                )}
              </div>
              {token && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-700">Copie agora: o token não aparece de novo.</p>
                  <div className="flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-3 py-2 text-xs">{comando}</code>
                    <Copiar texto={comando} rotulo="Copiar comando" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setToken(null)}>Já copiei</Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <AlertDialog open={!!desligar} onOpenChange={(o) => !o && setDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar “{desligar?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esse Claude para de ler o Sigma na hora. Para usar de novo, conecte outra vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (desligar) revogar.mutate(desligar.id); }}
              disabled={revogar.isPending}
            >
              {revogar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
