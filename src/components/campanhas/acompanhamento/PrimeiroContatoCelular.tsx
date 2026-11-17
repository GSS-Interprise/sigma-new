import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mostrarFone, normalizarFone } from "../../../../supabase/functions/_shared/alertas";

/**
 * 1º contato pelo celular da equipe (campanha com primeiro_contato = 'celular', Raul 17/11/2026).
 * O Sigma não envia nada: mostra o texto sugerido já com o nome do médico, abre o WhatsApp do celular/computador com o
 * texto pronto (wa.me) e grava "Chamei" com o celular de onde saiu (campanha_lead_chamado_celular), que é a base da
 * métrica por telefone. A resposta do médico chega no celular; a equipe move o médico de etapa no kanban.
 */

type Celular = { nome: string; fone: string };

export function PrimeiroContatoCelular({ campanhaLeadId, leadId, leadPhone, texto, celulares }: {
  campanhaLeadId: string | null | undefined;
  leadId: string;
  leadPhone: string | null | undefined;
  texto: string | null;
  celulares: Celular[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: estado, isLoading } = useQuery({
    queryKey: ["celular-1o-contato", campanhaLeadId],
    enabled: !!campanhaLeadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("campanha_leads")
        .select("data_primeiro_contato, celular_contato, lead:lead_id(nome)").eq("id", campanhaLeadId).single();
      if (error) throw error;
      return data as { data_primeiro_contato: string | null; celular_contato: string | null; lead: { nome: string | null } | null };
    },
  });

  // Celular padrão: o de quem está logado, se estiver na campanha; senão o primeiro da lista.
  const { data: meuFone } = useQuery({
    queryKey: ["meu-telefone", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("telefone").eq("id", user!.id).maybeSingle();
      return normalizarFone(String((data as any)?.telefone || ""));
    },
  });
  const [fone, setFone] = useState("");
  useEffect(() => {
    if (fone || celulares.length === 0) return;
    setFone(celulares.find((c) => c.fone === meuFone)?.fone || celulares[0].fone);
  }, [celulares, meuFone]); // eslint-disable-line react-hooks/exhaustive-deps

  const primeiroNome = (estado?.lead?.nome || "").trim().split(/\s+/)[0] || "";
  const mensagem = useMemo(
    () => (texto || "").replace(/\{nome\}/gi, primeiroNome ? primeiroNome.charAt(0) + primeiroNome.slice(1).toLowerCase() : "").replace(/ {2,}/g, " ").trim(),
    [texto, primeiroNome],
  );
  const destino = String(leadPhone || "").replace(/\D/g, "");
  const linkWhats = destino ? `https://wa.me/${destino.startsWith("55") ? destino : `55${destino}`}?text=${encodeURIComponent(mensagem)}` : null;

  const chamei = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("campanha_lead_chamado_celular", { p_campanha_lead_id: campanhaLeadId, p_fone: fone });
      if (error) throw error;
      return data as { ja_estava: boolean };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["celular-1o-contato", campanhaLeadId] });
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success(r.ja_estava ? "Esse médico já estava como chamado." : "Pronto: o médico está como chamado. Quando ele responder, mude a etapa no kanban.");
    },
    onError: (e: any) => {
      const m = String(e?.message || e);
      toast.error(m.includes("celular_fora_da_campanha") ? "Esse celular não está na campanha. Escolha um da lista." : `Não consegui marcar: ${m}`);
    },
  });

  const nomeDoCelular = (f: string | null) => {
    const c = celulares.find((x) => x.fone === f);
    return c ? `${c.nome || "Sem nome"} (${mostrarFone(c.fone)})` : f ? mostrarFone(f) : "";
  };

  if (isLoading) return <div className="mt-4 h-24 animate-pulse rounded-md bg-muted" />;

  if (estado?.data_primeiro_contato) {
    return (
      <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p className="flex items-center gap-1.5 font-medium"><Check className="h-4 w-4" />Chamado pelo celular</p>
        <p className="mt-0.5 text-xs">
          {new Date(estado.data_primeiro_contato).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {estado.celular_contato ? ` · ${nomeDoCelular(estado.celular_contato)}` : ""}. A conversa segue no celular.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-3">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Smartphone className="h-4 w-4 text-primary" />1º contato pelo seu celular</p>

      {mensagem ? (
        <div className="rounded-lg bg-[#e7ffdb] p-3 text-sm text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">
          <p className="whitespace-pre-wrap break-words">{mensagem}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A campanha não tem texto sugerido. Escreva no WhatsApp.</p>
      )}

      {celulares.length === 0 ? (
        <p className="text-xs text-amber-700">Esta campanha não tem celulares da equipe. Peça ao Vinicius para incluir quem chama.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Do celular de</span>
          <Select value={fone} onValueChange={setFone}>
            <SelectTrigger className="h-9 w-auto min-w-[220px]" aria-label="Celular que chamou"><SelectValue /></SelectTrigger>
            <SelectContent>
              {celulares.map((c) => <SelectItem key={c.fone} value={c.fone}>{nomeDoCelular(c.fone)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {linkWhats ? (
          <Button asChild variant="outline" size="sm">
            <a href={linkWhats} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir no WhatsApp</a>
          </Button>
        ) : (
          <span className="text-xs text-red-700">Médico sem telefone no cadastro.</span>
        )}
        {mensagem && (
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(mensagem).then(() => toast.success("Texto copiado."), () => toast.error("Não consegui copiar."))}>
            <Copy className="mr-1.5 h-4 w-4" />Copiar texto
          </Button>
        )}
        <Button size="sm" disabled={!fone || !campanhaLeadId || chamei.isPending} onClick={() => chamei.mutate()}>
          {chamei.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Chamei
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Depois de mandar no WhatsApp, clique em “Chamei”: o médico passa para “Contatado”.</p>
    </div>
  );
}
