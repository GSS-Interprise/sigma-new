import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

/**
 * Caixas Gmail da equipe que enviam o e-mail da campanha (05/11).
 * Quem decide: o gestor escolhe quais caixas dividem a fila; cada pessoa conecta a própria conta.
 * Cada conta manda até a cota do dia (1.800), somando todas as campanhas, das 8h às 20h.
 */
export type ContaGmail = {
  id: string; email: string; nome: string | null; status: string; erro: string | null;
  cota_diaria: number; enviados_hoje: number; pausada: boolean; minha: boolean;
};

const RETORNO: Record<string, [ "success" | "error", string ]> = {
  conectado: ["success", "Gmail conectado. A conta já pode enviar e-mails das campanhas."],
  cancelado: ["error", "Conexão cancelada no Google. Nada mudou."],
  expirou: ["error", "O pedido de conexão expirou. Clique em Conectar meu Gmail de novo."],
  dominio: ["error", "Só contas @gestaoservicosaude.com.br podem enviar pelo Sigma."],
  sem_permissao: ["error", "Faltou marcar a permissão de enviar e-mail na tela do Google. Conecte de novo e marque a caixa."],
  erro: ["error", "Não foi possível conectar o Gmail. Tente de novo em alguns minutos."],
};

export function useContasGmail() {
  return useQuery({
    queryKey: ["email-contas-gmail"],
    queryFn: async () => {
      // RPC nova ainda fora dos tipos gerados do Supabase
      // bind: sem ele o rpc perde o "this" do cliente e falha antes de chamar o banco
      // ("Não foi possível carregar as contas" para todo mundo, 09/11)
      const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: ContaGmail[] | null; error: Error | null }>;
      const { data, error } = await rpc("email_contas_gmail_uso");
      if (error) throw error;
      return (data ?? []) as ContaGmail[];
    },
    refetchInterval: 60_000,
  });
}

export function capacidadeDiaria(contas: ContaGmail[], ids: string[]) {
  return contas.filter((c) => ids.includes(c.id) && c.status === "conectada").reduce((s, c) => s + c.cota_diaria, 0);
}

export function ContasGmailEnvio({ selecionadas, onChange, desabilitado }: {
  selecionadas: string[]; onChange: (ids: string[]) => void; desabilitado?: boolean;
}) {
  const { data: contas, isLoading, isError, refetch } = useContasGmail();
  const [conectando, setConectando] = useState(false);

  // volta do Google: ?gmail=conectado|cancelado|...
  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("gmail");
    if (!r) return;
    const [tipo, msg] = RETORNO[r] ?? RETORNO.erro;
    toast[tipo](msg, { duration: 8000 });
    url.searchParams.delete("gmail");
    window.history.replaceState(null, "", url.toString());
    refetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conectar = async () => {
    setConectando(true);
    const { data, error } = await supabase.functions.invoke<{ url?: string }>("gmail-oauth", { body: { acao: "iniciar", volta: window.location.href } });
    if (error || !data?.url) {
      setConectando(false);
      toast.error("Não foi possível abrir o Google. Tente de novo.");
      return;
    }
    window.location.href = data.url;
  };

  const desconectar = async (id: string) => {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>("gmail-oauth", { body: { acao: "desconectar", id } });
    if (error || !data?.ok) { toast.error("Não foi possível desconectar."); return; }
    onChange(selecionadas.filter((x) => x !== id));
    toast.success("Gmail desconectado. Esta conta não envia mais pelo Sigma.");
    refetch();
  };

  if (isLoading) return <div className="py-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando contas…</div>;
  if (isError) return (
    <div className="py-3 text-sm text-destructive flex flex-wrap items-center gap-2">
      Não foi possível carregar as contas.
      <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
    </div>
  );

  const lista = contas ?? [];
  const minha = lista.find((c) => c.minha);
  const alternar = (id: string, marcado: boolean) =>
    onChange(marcado ? [...new Set([...selecionadas, id])] : selecionadas.filter((x) => x !== id));

  return (
    <div className="space-y-2">
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma caixa conectada ainda. Cada pessoa que vai enviar conecta o próprio Gmail uma vez.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {lista.map((c) => {
            const ok = c.status === "conectada";
            const marcado = selecionadas.includes(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Checkbox id={`gmail-${c.id}`} checked={marcado} disabled={desabilitado || !ok}
                  onCheckedChange={(v) => alternar(c.id, v === true)} />
                <label htmlFor={`gmail-${c.id}`} className="min-w-0 flex-[1_1_12rem] cursor-pointer">
                  <span className="block truncate text-sm font-medium">{c.nome || c.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                </label>
                {ok ? (
                  <span className={`text-xs tabular-nums ${c.pausada ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {c.pausada ? "Cota do dia acabou" : `${c.enviados_hoje.toLocaleString("pt-BR")} de ${c.cota_diaria.toLocaleString("pt-BR")} hoje`}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> {c.minha ? "Conexão caiu" : "Conexão caiu: a pessoa precisa reconectar"}
                  </span>
                )}
                {c.minha && (
                  ok
                    ? <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => desconectar(c.id)}>Desconectar</Button>
                    : <Button size="sm" variant="outline" className="h-8 text-xs" disabled={conectando} onClick={conectar}>Reconectar</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!minha && (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={conectando} onClick={conectar}>
          {conectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Conectar meu Gmail
        </Button>
      )}
    </div>
  );
}
