import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plus, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Passo "conversa" do assistente de campanha (decisão do Raul, 13/11): quem conversa depois do 1º contato e quem recebe
 * o aviso no WhatsApp. Nos dois modos o 1º contato sai sozinho pela API oficial.
 *   IA     → a IA responde como o Maikon; o aviso vai quando o médico quer fechar (modelo gss_medico_quente_v1).
 *   Equipe → a IA fica de fora; o aviso vai quando o médico responde, para alguém da equipe responder pelo Sigma
 *            (modelo gss_medico_respondeu_v1).
 * Os destinos viram campanhas.alerta_destinos ([{nome, fone}]); lista vazia usa os destinatários gerais da equipe.
 */

export type ModoConversa = "ia" | "manual";
export type Destino = { nome: string; fone: string };

const soDigitos = (v: string) => v.replace(/\D/g, "");
// Aceita (48) 99999-9999, 48999999999 ou +55 48 99999-9999; guarda sempre com 55 na frente.
export const normalizarFone = (v: string) => {
  const d = soDigitos(v);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
};
export const foneValido = (v: string) => /^55\d{10,11}$/.test(normalizarFone(v));
const mostrarFone = (d: string) => {
  const n = d.replace(/^55/, "");
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : d;
};

// Equipe com telefone no cadastro + destinatários gerais (config alertas_equipe_destinos), sem repetir número.
function usePessoasComTelefone() {
  return useQuery({
    queryKey: ["assistente-pessoas-aviso"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ pessoas: Destino[]; gerais: Destino[] }> => {
      const [{ data: perfis }, { data: cfg }] = await Promise.all([
        supabase.from("profiles").select("nome_completo, telefone").eq("status", "ativo").not("telefone", "is", null).order("nome_completo"),
        (supabase as any).from("config_lista_items").select("valor").eq("campo_nome", "alertas_equipe_destinos").maybeSingle(),
      ]);
      const gerais: Destino[] = String(cfg?.valor || "").split(/[;\n]+/).map((x: string) => x.trim()).filter(Boolean).map((x: string) => {
        const i = x.lastIndexOf(":");
        return { nome: i > 0 ? x.slice(0, i).trim() : "", fone: normalizarFone(i > 0 ? x.slice(i + 1) : x) };
      }).filter((d: Destino) => foneValido(d.fone));
      const vistos = new Set(gerais.map((g) => g.fone));
      const pessoas = [...gerais];
      for (const p of (perfis ?? []) as any[]) {
        const fone = normalizarFone(String(p.telefone || ""));
        if (!foneValido(fone) || vistos.has(fone)) continue;
        vistos.add(fone);
        pessoas.push({ nome: p.nome_completo, fone });
      }
      return { pessoas, gerais };
    },
  });
}

export function PassoConversa({ modo, onModo, destinos, onDestinos, preencherGerais = true }: {
  modo: ModoConversa | null; onModo: (m: ModoConversa) => void; destinos: Destino[]; onDestinos: (d: Destino[]) => void;
  /** Campanha nova: já marca os destinatários gerais. Campanha existente com lista vazia continua "gerais" (false). */
  preencherGerais?: boolean;
}) {
  const { data } = usePessoasComTelefone();
  const [extraNome, setExtraNome] = useState("");
  const [extraFone, setExtraFone] = useState("");
  // Primeira vez no passo: já vem marcado quem recebe os avisos gerais hoje (o dono só confere).
  useEffect(() => {
    if (preencherGerais && data && destinos.length === 0 && data.gerais.length) onDestinos(data.gerais);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const base = data?.pessoas ?? [];
    const extras = destinos.filter((d) => !base.some((b) => b.fone === d.fone));
    return [...base, ...extras];
  }, [data, destinos]);
  const marcado = (fone: string) => destinos.some((d) => d.fone === fone);
  const alternar = (d: Destino, on: boolean) => onDestinos(on ? [...destinos, d] : destinos.filter((x) => x.fone !== d.fone));
  const adicionar = () => {
    const fone = normalizarFone(extraFone);
    if (!foneValido(fone) || !extraNome.trim()) return;
    if (!marcado(fone)) onDestinos([...destinos, { nome: extraNome.trim(), fone }]);
    setExtraNome(""); setExtraFone("");
  };

  const OPCOES: Array<{ valor: ModoConversa; titulo: string; texto: string; Icone: typeof Bot }> = [
    { valor: "ia", titulo: "A IA, como o Maikon", texto: "Responde sozinha e avisa quando o médico quer fechar.", Icone: Bot },
    { valor: "manual", titulo: "A equipe, pelo Sigma", texto: "A IA fica de fora. Quando o médico responde, quem estiver abaixo recebe o aviso.", Icone: Users },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quem conversa depois do primeiro contato">
        {OPCOES.map(({ valor, titulo, texto, Icone }) => (
          <button key={valor} type="button" role="radio" aria-checked={modo === valor} onClick={() => onModo(valor)}
            className={cn("rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
              modo === valor && "border-primary bg-primary/5 ring-1 ring-primary")}>
            <span className="flex items-center gap-2 text-sm font-medium"><Icone className="h-4 w-4 text-primary" />{titulo}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{texto}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Nos dois casos o primeiro contato sai sozinho pela API oficial.</p>

      {modo && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {modo === "ia" ? "Quem recebe no WhatsApp o aviso de médico querendo fechar?" : "Quem recebe no WhatsApp o aviso de médico que respondeu?"}
          </p>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
            {lista.map((d) => (
              <li key={d.fone}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={marcado(d.fone)} onCheckedChange={(v) => alternar(d, v === true)} />
                  <span className="min-w-0 flex-1 truncate">{d.nome || "Sem nome"}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{mostrarFone(d.fone)}</span>
                </label>
              </li>
            ))}
            {lista.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Ninguém da equipe tem telefone no cadastro. Adicione abaixo.</li>}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); adicionar(); }}>
            <Input value={extraNome} onChange={(e) => setExtraNome(e.target.value)} placeholder="Nome" className="h-9 w-40" />
            <Input value={extraFone} onChange={(e) => setExtraFone(e.target.value)} placeholder="WhatsApp com DDD" inputMode="tel" className="h-9 w-48" />
            <Button type="submit" variant="outline" className="h-9" disabled={!extraNome.trim() || !foneValido(extraFone)}>
              <Plus className="mr-1.5 h-4 w-4" />Adicionar
            </Button>
          </form>
          {destinos.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <X className="h-3.5 w-3.5" />Ninguém marcado: o aviso vai para os destinatários gerais da equipe.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
