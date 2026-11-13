import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ExternalLink, Loader2, Unplug, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Configurações › Motor de IA — pergunta da tela: "o Claude da GSS está ligado ao Sigma e respondendo?".
 * Decisão: conectar (ou reconectar) a assinatura Max da GSS e testar.
 * O motor é o Hermes na VPS da GSS com o plugin claude-subscription-directsdk; o login gera um token de 1 ano que
 * fica só na VPS (usuário sigma-ia). O Sigma fala com a VPS pela fila rotina_pedidos (rotinas ia_claude_*), e o
 * worker atende essa fila em até ~8 s. Desenho: docs/arquitetura/motor-ia-hermes-claude.md.
 */

type Situacao = {
  hermes: string | null; claude_code: string | null; plugin: boolean;
  conectado: boolean; login_em: string | null; vence_em_estimado: string | null;
};
type Teste = { ok: boolean; frase: string; segundos?: number };

// Pede uma rotina à VPS e espera o resultado (o worker consulta a fila a cada 2-8 s; o teste leva até 3 min).
async function pedir<T>(tipo: string, payload: Record<string, unknown> = {}, limiteMs = 90_000): Promise<T> {
  const { data: id, error } = await (supabase as any).rpc("rotina_pedir", { p_tipo: tipo, p_payload: payload });
  if (error) throw new Error(error.message.includes("so_administrador") ? "Só administrador mexe no motor de IA." : error.message);
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await (supabase as any).from("rotina_pedidos").select("status, resultado, erro").eq("id", id).single();
    if (data?.status === "feito") return data.resultado as T;
    if (data?.status === "erro") throw new Error(String(data.erro || "falhou").replace(/^RuntimeError: /, ""));
  }
  throw new Error("A VPS da GSS não respondeu a tempo. O serviço sigma-rotinas pode estar parado.");
}

const quando = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }) : "—");

export function MotorIaTab() {
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  const situacao = useQuery({
    queryKey: ["motor-ia", "situacao"],
    queryFn: () => pedir<Situacao>("ia_claude_situacao"),
    staleTime: 60_000,
    retry: false,
  });
  // Último teste feito (por esta tela ou pelo login), para mostrar sem rodar o modelo a cada visita.
  const ultimoTeste = useQuery({
    queryKey: ["motor-ia", "ultimo-teste"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("rotina_pedidos").select("tipo, resultado, concluido_em")
        .in("tipo", ["ia_claude_teste", "ia_claude_codigo"]).eq("status", "feito")
        .order("concluido_em", { ascending: false }).limit(1).maybeSingle();
      if (!data) return null;
      const t = (data.tipo === "ia_claude_codigo" ? data.resultado?.teste : data.resultado) as Teste | undefined;
      return t ? { ...t, em: data.concluido_em as string } : null;
    },
  });
  const atualizar = () => qc.invalidateQueries({ queryKey: ["motor-ia"] });

  const abrirLogin = useMutation({
    mutationFn: () => pedir<{ link: string }>("ia_claude_login"),
    onSuccess: (r) => { setLink(r.link); setCodigo(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const concluir = useMutation({
    mutationFn: () => pedir<{ conectado: boolean; teste: Teste }>("ia_claude_codigo", { codigo: codigo.trim() }, 240_000),
    onSuccess: (r) => {
      setLink(null); setCodigo("");
      if (r.teste?.ok) toast.success("Claude da GSS conectado. O teste respondeu pelo Hermes.");
      else toast.warning(`Login gravado, mas o teste falhou: ${r.teste?.frase}`);
      atualizar();
    },
    // Código recusado deixa a tela do setup-token da VPS num estado sem volta: o login tem de começar de novo.
    onError: (e: Error) => { toast.error(e.message); if (/Comece de novo/.test(e.message)) { setLink(null); setCodigo(""); } },
  });
  const testar = useMutation({
    mutationFn: () => pedir<Teste>("ia_claude_teste", {}, 240_000),
    onSuccess: (t) => { (t.ok ? toast.success : toast.error)(t.ok ? `${t.frase} (${t.segundos}s)` : t.frase); atualizar(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const desconectar = useMutation({
    mutationFn: () => pedir("ia_claude_sair"),
    onSuccess: () => { toast.success("Assinatura desconectada. Nenhum processo usa o Claude até um novo login."); atualizar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = situacao.data;
  const t = ultimoTeste.data;
  const ocupado = abrirLogin.isPending || concluir.isPending || testar.isPending || desconectar.isPending;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        {situacao.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <p className="text-sm text-muted-foreground">Consultando a VPS da GSS…</p>
          </div>
        ) : situacao.error ? (
          <div className="space-y-3">
            <p className="font-medium text-destructive">Não deu para falar com a VPS da GSS.</p>
            <p className="text-sm text-muted-foreground">{(situacao.error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => situacao.refetch()}>Tentar de novo</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Claude da GSS (assinatura Max)</p>
              <p className={cn("mt-1 flex items-center gap-2 text-2xl font-semibold", s?.conectado ? "text-emerald-700" : "text-foreground")}>
                {s?.conectado ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6 text-muted-foreground" />}
                {s?.conectado ? "Conectado" : "Sem login"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {s?.conectado
                  ? `Login em ${quando(s.login_em)} · vence por volta de ${quando(s.vence_em_estimado)}`
                  : "Nenhum processo do Sigma usa o Claude enquanto não houver login."}
              </p>
              {/* Teste anterior ao login atual não diz nada sobre ele; sem login, o "Sem login" já basta. */}
              {t && s?.conectado && s.login_em && new Date(t.em) >= new Date(s.login_em) && (
                <p className={cn("mt-2 text-sm", t.ok ? "text-emerald-700" : "text-destructive")}>
                  Último teste {formatDistanceToNow(new Date(t.em), { addSuffix: true, locale: ptBR })}: {t.frase}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {s?.conectado && (
                <Button variant="outline" className="h-9" disabled={ocupado} onClick={() => testar.mutate()}>
                  {testar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {testar.isPending ? "Testando…" : "Testar agora"}
                </Button>
              )}
              <Button className="h-9" disabled={ocupado || !!link} onClick={() => abrirLogin.mutate()}>
                {abrirLogin.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {abrirLogin.isPending ? "Abrindo login…" : s?.conectado ? "Refazer login" : "Conectar assinatura"}
              </Button>
            </div>
          </div>
        )}

        {link && (
          <div className="mt-5 space-y-3 rounded-md border bg-muted/40 p-4">
            <p className="text-sm font-medium">1. Entre com a conta Claude da GSS (@gestaoservicosaude.com.br) e autorize.</p>
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir página do Claude</a>
            </Button>
            <p className="pt-1 text-sm font-medium">2. Cole aqui o código que a página mostrar.</p>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) concluir.mutate(); }}>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código do Claude" autoComplete="off"
                spellCheck={false} className="h-9 min-w-0 flex-1 basis-64 font-mono text-sm" disabled={concluir.isPending} />
              <Button type="submit" className="h-9" disabled={!codigo.trim() || concluir.isPending}>
                {concluir.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {concluir.isPending ? "Concluindo e testando…" : "Concluir login"}
              </Button>
              <Button type="button" variant="ghost" className="h-9" disabled={concluir.isPending} onClick={() => setLink(null)}>Cancelar</Button>
            </form>
            <p className="text-xs text-muted-foreground">O link vale 30 minutos. O token fica só na VPS da GSS; o Sigma não guarda.</p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">Processos que usam o Claude</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Nenhum ainda. Cada processo entra aqui só depois de definido com a GSS: o que faz, quais dados vê e quanto da cota usa.
        </p>
      </Card>

      {s && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span>
            VPS da GSS · {s.hermes ? s.hermes.split(" · ")[0] : "Hermes não instalado"} · {s.claude_code ?? "Claude Code não instalado"} ·
            plugin da assinatura {s.plugin ? "instalado" : "ausente"}
          </span>
          {s.conectado && (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" disabled={ocupado}
              onClick={() => { if (window.confirm("Desconectar a assinatura do Claude da GSS? Os processos param até um novo login.")) desconectar.mutate(); }}>
              <Unplug className="mr-1.5 h-3.5 w-3.5" />Desconectar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
