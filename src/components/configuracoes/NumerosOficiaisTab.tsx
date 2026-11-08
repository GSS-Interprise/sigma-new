import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ChevronDown, Download, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChakraConnectCard } from "./ChakraConnectCard";

/**
 * Configurações › WhatsApp — pergunta da tela: "quais números oficiais posso usar agora e o que falta nos outros?"
 * A disponibilidade vem de whatsapp_numeros_recalcular_disponibilidade (saúde da Meta + entregas reais dos
 * últimos 7 dias). O "Enviar teste" manda um template, que é o tipo de envio que a Meta bloqueia: só ele prova.
 */

type Numero = {
  connection_id: string;
  phone_e164: string;
  display_name: string | null;
  uso: "prospeccao" | "financeiro" | "pessoal";
  responsavel_id: string | null;
  responsavel_nome: string | null;
  conta: string;
  disponibilidade: "disponivel" | "atencao" | "indisponivel" | null;
  disponibilidade_motivo: string | null;
  disponibilidade_em: string | null;
  enviadas_7d: number;
  falhas_7d: number;
  ultima_entrega: string | null;
  templates_aprovados: number;
  tem_template_padrao: boolean;
};

const DISP = {
  disponivel: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300", ordem: 0 },
  atencao: { rotulo: "Atenção", classe: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300", ordem: 1 },
  indisponivel: { rotulo: "Não usar", classe: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300", ordem: 2 },
} as const;

const USO_ROTULO: Record<Numero["uso"], string> = {
  prospeccao: "Prospecção",
  financeiro: "Financeiro",
  pessoal: "Pessoal",
};

function formatarTelefone(e164: string) {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

function haQuanto(iso: string | null) {
  if (!iso) return "nunca";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

function escapar(texto: string) {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function baixarPdf(numeros: Numero[]) {
  const linhas = numeros.map((n) => `<tr><td>${formatarTelefone(n.phone_e164)}</td><td>${escapar(n.display_name || "")}</td>`
    + `<td>${USO_ROTULO[n.uso]}</td><td>${n.disponibilidade ? DISP[n.disponibilidade].rotulo : "—"}</td>`
    + `<td>${escapar(n.disponibilidade_motivo || "")}</td><td>${n.tem_template_padrao ? "Sim" : "Não"}</td>`
    + `<td>${escapar(n.responsavel_nome || "—")}</td></tr>`).join("");
  const janela = window.open("", "_blank");
  if (!janela) {
    toast.error("O navegador bloqueou a janela. Libere pop-ups para baixar a lista.");
    return;
  }
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Números WhatsApp oficiais — GSS</title>
    <style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f5}</style>
    </head><body><h1>Números WhatsApp oficiais — GSS</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
    <table><thead><tr><th>Número</th><th>Nome</th><th>Uso</th><th>Situação</th><th>Motivo</th><th>Modelo padrão</th><th>Responsável</th></tr></thead>
    <tbody>${linhas}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  janela.document.close();
}

export function NumerosOficiaisTab() {
  const queryClient = useQueryClient();
  const [testeDe, setTesteDe] = useState<Numero | null>(null);

  const { data: numeros = [], isLoading, error } = useQuery({
    queryKey: ["whatsapp-numeros-oficiais"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("whatsapp_numeros_oficiais_painel");
      if (error) throw error;
      return (data || []) as Numero[];
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ["whatsapp-numeros-responsaveis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .eq("status", "ativo")
        .order("nome_completo");
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome_completo: string | null }>;
    },
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("chakra-connect", { body: { action: "refresh_status" } });
      if (error) throw error;
      return data as { ok: boolean; failed?: unknown[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-numeros-oficiais"] });
      if (data?.failed?.length) toast.warning(`Sincronizado, mas ${data.failed.length} número(s) não responderam na Chakra.`);
      else toast.success("Situação dos números atualizada com a Meta.");
    },
    onError: () => toast.error("Não consegui falar com a Chakra agora. Tente de novo em instantes."),
  });

  const atualizar = useMutation({
    mutationFn: async (vars: { numero: Numero; responsavel_id?: string | null; uso?: Numero["uso"] }) => {
      const { error } = await (supabase as any).rpc("whatsapp_numero_atualizar", {
        p_connection_id: vars.numero.connection_id,
        p_responsavel_id: vars.responsavel_id !== undefined ? vars.responsavel_id : vars.numero.responsavel_id,
        p_uso: vars.uso ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-numeros-oficiais"] });
      toast.success("Número atualizado.");
    },
    onError: () => toast.error("Não foi possível salvar. Confira sua permissão de configurar WhatsApp."),
  });

  const ordenados = useMemo(
    () => [...numeros].sort((a, b) =>
      (DISP[a.disponibilidade || "indisponivel"].ordem - DISP[b.disponibilidade || "indisponivel"].ordem)
      || a.phone_e164.localeCompare(b.phone_e164)),
    [numeros],
  );
  const prospeccao = ordenados.filter((n) => n.uso === "prospeccao");
  const outros = ordenados.filter((n) => n.uso !== "prospeccao");
  const prontos = prospeccao.filter((n) => n.disponibilidade === "disponivel").length;
  const comPagamento = prospeccao.filter((n) => (n.disponibilidade_motivo || "").includes("141006")).length;
  const atualizadoEm = numeros.map((n) => n.disponibilidade_em).filter(Boolean).sort().at(-1) || null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Números oficiais de WhatsApp</h2>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="text-2xl font-semibold text-foreground tabular-nums">{prontos}</span>
                {" "}de {prospeccao.length} prontos para campanha
                {atualizadoEm && <span> · conferido {haQuanto(atualizadoEm)}</span>}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => baixarPdf(ordenados)} disabled={!numeros.length}>
              <Download className="mr-2 h-4 w-4" /> Baixar lista
            </Button>
            <Button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
              {sincronizar.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RefreshCw className="mr-2 h-4 w-4" />}
              {sincronizar.isPending ? "Conferindo…" : "Conferir com a Meta"}
            </Button>
          </div>
        </div>

        {comPagamento > 0 && (
          <div className="mt-4 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>{comPagamento} números com pagamento recusado pela Meta.</strong> Cadastre o cartão no portfólio
              da GSS no Meta Business e vincule a cada conta de WhatsApp. Depois, use “Enviar teste” para confirmar.
            </p>
          </div>
        )}
      </Card>

      {error && (
        <Card className="p-5 text-sm text-red-700">Não foi possível carregar os números. Recarregue a página.</Card>
      )}

      {!isLoading && !error && (
        <>
          <TabelaNumeros
            titulo="Prospecção"
            numeros={prospeccao}
            pessoas={pessoas}
            onTeste={setTesteDe}
            onAtualizar={(numero, mudanca) => atualizar.mutate({ numero, ...mudanca })}
          />
          {outros.length > 0 && (
            <TabelaNumeros
              titulo="Outros usos"
              numeros={outros}
              pessoas={pessoas}
              onTeste={setTesteDe}
              onAtualizar={(numero, mudanca) => atualizar.mutate({ numero, ...mudanca })}
            />
          )}
        </>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2 text-muted-foreground">
            <ChevronDown className="h-4 w-4" /> Conectar um número novo
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <ChakraConnectCard />
        </CollapsibleContent>
      </Collapsible>

      <EnviarTesteDialog numero={testeDe} onClose={() => setTesteDe(null)} />
    </div>
  );
}

function TabelaNumeros({
  titulo, numeros, pessoas, onTeste, onAtualizar,
}: {
  titulo: string;
  numeros: Numero[];
  pessoas: Array<{ id: string; nome_completo: string | null }>;
  onTeste: (n: Numero) => void;
  onAtualizar: (n: Numero, mudanca: { responsavel_id?: string | null; uso?: Numero["uso"] }) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-3 text-sm font-medium">{titulo} · {numeros.length}</div>
      {numeros.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum número neste grupo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Última entrega</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 font-medium">Uso</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {numeros.map((n) => {
                const disp = DISP[n.disponibilidade || "indisponivel"];
                return (
                  <tr key={n.connection_id} className="align-top">
                    <td className="px-5 py-3">
                      <div className="font-medium tabular-nums">{formatarTelefone(n.phone_e164)}</div>
                      <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={n.display_name || ""}>
                        {n.display_name || "Sem nome"} · conta {n.conta}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", disp.classe)}>
                        {disp.rotulo}
                      </span>
                      <div className="mt-1 max-w-[340px] text-xs text-muted-foreground">
                        {n.disponibilidade_motivo || "Ainda não conferido."}
                        {n.uso === "prospeccao" && !n.tem_template_padrao && " Sem o modelo padrão de prospecção."}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div>{haQuanto(n.ultima_entrega)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        7 dias: {n.enviadas_7d} enviadas{n.falhas_7d > 0 && `, ${n.falhas_7d} falharam`}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={n.responsavel_id || "nenhum"}
                        onValueChange={(v) => onAtualizar(n, { responsavel_id: v === "nenhum" ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Sem responsável</SelectItem>
                          {pessoas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome_completo || "Sem nome"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Select value={n.uso} onValueChange={(v) => onAtualizar(n, { uso: v as Numero["uso"] })}>
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(USO_ROTULO) as Numero["uso"][]).map((u) => (
                            <SelectItem key={u} value={u}>{USO_ROTULO[u]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => onTeste(n)} disabled={n.templates_aprovados === 0}
                        title={n.templates_aprovados === 0 ? "Este número não tem nenhum modelo aprovado" : undefined}>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Enviar teste
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type ResultadoTeste =
  | { fase: "enviando" }
  | { fase: "aguardando"; messageId: string; template: string }
  | { fase: "entregue"; template: string; status: string }
  | { fase: "falhou"; template?: string; erro: string };

function EnviarTesteDialog({ numero, onClose }: { numero: Numero | null; onClose: () => void }) {
  const [destino, setDestino] = useState("");
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);

  useEffect(() => {
    if (numero) setResultado(null);
  }, [numero]);

  // O "aceito" da Chakra não garante entrega: acompanha o webhook de status por até 90 s.
  useEffect(() => {
    if (resultado?.fase !== "aguardando") return;
    const inicio = Date.now();
    const timer = window.setInterval(async () => {
      const { data } = await (supabase as any).rpc("whatsapp_envio_teste_status", { p_message_id: resultado.messageId });
      const status = String(data?.status || "aguardando");
      if (status === "delivered" || status === "read") {
        setResultado({ fase: "entregue", template: resultado.template, status });
      } else if (status === "failed") {
        setResultado({ fase: "falhou", template: resultado.template, erro: data?.erro || "A Meta recusou a mensagem." });
      } else if (Date.now() - inicio > 90_000) {
        setResultado({ fase: "falhou", template: resultado.template, erro: "Sem confirmação de entrega em 90 s. Veja no celular se chegou." });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [resultado]);

  const enviar = async () => {
    if (!numero) return;
    const digitos = destino.replace(/\D/g, "");
    const to = digitos.length <= 11 ? `55${digitos}` : digitos;
    if (to.length < 12) {
      toast.error("Digite o celular com DDD.");
      return;
    }
    setResultado({ fase: "enviando" });
    const { data, error } = await supabase.functions.invoke("chakra-connect", {
      body: { action: "send_test", connectionId: numero.connection_id, to },
    });
    if (error || !data?.ok) {
      setResultado({ fase: "falhou", template: data?.template, erro: data?.error || error?.message || "Falha ao enviar." });
      return;
    }
    setResultado({ fase: "aguardando", messageId: data.messageId, template: data.template });
  };

  return (
    <Dialog open={!!numero} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar teste pelo {numero ? formatarTelefone(numero.phone_e164) : ""}</DialogTitle>
          <DialogDescription>Manda um modelo aprovado, igual ao primeiro contato de uma campanha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="destino-teste">Celular que vai receber</Label>
          <Input id="destino-teste" inputMode="tel" placeholder="(47) 99999-9999" value={destino}
            onChange={(e) => setDestino(e.target.value)} disabled={resultado?.fase === "enviando" || resultado?.fase === "aguardando"} />
        </div>
        {resultado && (
          <div className={cn("rounded-md border p-3 text-sm",
            resultado.fase === "entregue" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
            resultado.fase === "falhou" && "border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200")}>
            {resultado.fase === "enviando" && "Enviando…"}
            {resultado.fase === "aguardando" && (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Aceito pela Meta. Esperando a confirmação de entrega…</span>
            )}
            {resultado.fase === "entregue" && <>Entregue. Este número consegue fazer o primeiro contato de campanha (modelo {resultado.template}).</>}
            {resultado.fase === "falhou" && <>Não entregou: {resultado.erro}</>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={enviar} disabled={!destino.trim() || resultado?.fase === "enviando" || resultado?.fase === "aguardando"}>
            <Send className="mr-2 h-4 w-4" /> Enviar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
