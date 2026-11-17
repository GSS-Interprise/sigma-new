import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Algo especial nesta campanha?" no passo da vaga (Raul/Maikon, 17/11/2026). O dono escreve em português o que esta
 * campanha tem de diferente; a edge campanha-assistente-ia (Gemini) devolve o que entendeu em campos que o Sigma aplica
 * (local em sigilo, como falar a região, se a IA passa valor) e uma regra curta para a IA da conversa. Nada vale até o
 * dono clicar em "Aplicar". Quem respeita as regras depois: _shared/sigilo.ts, usado pela IA e pelos follow-ups.
 */

export type Particularidades = {
  entendi: string;
  ocultar_hospital: boolean;
  ocultar_cidade: boolean;
  como_falar_local: string | null;
  ia_informa_valor: boolean | null;
  instrucoes_ia: string | null;
  duvida: string | null;
};

export function ParticularidadesIA({ aplicado, onAplicar, rascunho }: {
  aplicado: (Particularidades & { pedido: string }) | null;
  onAplicar: (p: (Particularidades & { pedido: string }) | null) => void;
  rascunho: Record<string, unknown>;
}) {
  const [pedido, setPedido] = useState(aplicado?.pedido || "");
  const [proposta, setProposta] = useState<Particularidades | null>(null);

  const entender = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("campanha-assistente-ia", { body: { texto: pedido, rascunho } });
      // A edge devolve a mensagem de erro no corpo; o invoke só traz "non-2xx".
      const corpo = (data ?? (await (error as any)?.context?.json?.().catch(() => null))) as any;
      if (corpo?.error) throw new Error(corpo.error);
      if (error) throw new Error("A IA não respondeu agora. Tente de novo.");
      return corpo.particularidades as Particularidades;
    },
    onSuccess: setProposta,
  });

  if (aplicado && !proposta) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium"><Sparkles className="h-4 w-4 text-primary" />Regra especial aplicada</p>
        <p className="mt-1">{aplicado.entendi}</p>
        <Chips p={aplicado} />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setProposta(null); onAplicar(null); }}>Tirar a regra</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <label htmlFor="pedido-especial" className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />Algo especial nesta campanha? <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <Textarea id="pedido-especial" rows={2} value={pedido} onChange={(e) => setPedido(e.target.value)}
        placeholder="Ex.: não quero citar o hospital nem a cidade, só que é na região Sul, pelo menos no início." />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pedido.trim().length < 5 || entender.isPending} onClick={() => entender.mutate()}>
          {entender.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {entender.isPending ? "Entendendo…" : "Entender com IA"}
        </Button>
        {entender.isError && <span className="text-xs text-red-700">{(entender.error as Error).message}</span>}
      </div>

      {proposta && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p><span className="font-medium">Entendi:</span> {proposta.entendi}</p>
          <Chips p={proposta} />
          {proposta.duvida && <p className="mt-2 text-xs text-amber-800">Dúvida da IA: {proposta.duvida} Ajuste o texto e clique de novo.</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { onAplicar({ ...proposta, pedido: pedido.trim() }); setProposta(null); }}>
              <Check className="mr-1.5 h-4 w-4" />Aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposta(null)}><X className="mr-1.5 h-4 w-4" />Descartar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// O que muda de fato, em etiquetas: o dono confere antes de aplicar.
function Chips({ p }: { p: Particularidades }) {
  const itens = [
    p.ocultar_hospital && "Não cita o hospital",
    p.ocultar_cidade && `Não cita a cidade: fala “${p.como_falar_local || "região da vaga"}”`,
    p.ia_informa_valor === true && "IA pode passar o valor",
    p.ia_informa_valor === false && "IA não passa valor",
    p.instrucoes_ia && `Regra para a IA: ${p.instrucoes_ia}`,
  ].filter(Boolean) as string[];
  if (!itens.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {itens.map((t) => <li key={t} className="rounded-full bg-background px-2.5 py-1 text-xs ring-1 ring-border">{t}</li>)}
    </ul>
  );
}
