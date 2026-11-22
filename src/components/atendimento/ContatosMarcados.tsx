// Contatos marcados (clientes, contatos importantes): aparecem pelo nome e na frente da fila de Tempo de resposta.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Contato = { id: string; telefone: string; nome: string; tipo: string; prioridade: boolean; observacao: string | null };
const TIPOS: Record<string, string> = { cliente: "Cliente", medico: "Médico", parceiro: "Parceiro", outro: "Outro" };
// Tabela nova, ainda fora dos tipos gerados.
const tabela = () => (supabase as unknown as { from: (t: string) => any }).from("atendimento_contatos");

/** Aceita o telefone como a pessoa cola ("(47) 99999-0000", "+55 47..."); guarda só dígitos, com 55 na frente. */
export function normalizarFone(v: string): string | null {
  let d = v.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}
const mostrarFone = (d: string) => (d.length === 13 ? `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}` : `+${d}`);

export function ContatosMarcados({ podeGerir }: { podeGerir: boolean }) {
  const qc = useQueryClient();
  const [fone, setFone] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("cliente");
  const lista = useQuery({
    queryKey: ["atendimento-contatos"],
    queryFn: async () => {
      const { data, error } = await tabela().select("id, telefone, nome, tipo, prioridade, observacao").order("nome").order("id");
      if (error) throw new Error(error.message);
      return (data || []) as Contato[];
    },
  });
  const salvar = useMutation({
    mutationFn: async () => {
      const telefone = normalizarFone(fone);
      if (!telefone) throw new Error("Telefone inválido. Use DDD e número, ex.: (47) 99999-0000.");
      if (nome.trim().length < 2) throw new Error("Escreva o nome do contato.");
      const { error } = await tabela().upsert({ telefone, nome: nome.trim(), tipo, prioridade: true }, { onConflict: "telefone" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${nome.trim()} marcado. Aparece pelo nome e na frente da fila.`);
      setFone(""); setNome("");
      qc.invalidateQueries({ queryKey: ["atendimento-contatos"] });
      qc.invalidateQueries({ queryKey: ["atendimento-fila"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remover = useMutation({
    mutationFn: async (id: string) => { const { error } = await tabela().delete().eq("id", id); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Marcação removida."); qc.invalidateQueries({ queryKey: ["atendimento-contatos"] }); qc.invalidateQueries({ queryKey: ["atendimento-fila"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 rounded-lg border bg-card">
        <div className="border-b p-3">
          <h2 className="text-sm font-semibold">Contatos marcados ({lista.data?.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">Aparecem pelo nome, com estrela, na frente das conversas com a mesma espera</p>
        </div>
        {lista.isLoading ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          : lista.isError ? <p className="p-4 text-sm text-destructive">{(lista.error as Error).message}</p>
          : !lista.data?.length ? <p className="p-4 text-sm text-muted-foreground">Nenhum contato marcado. Marque os clientes que não podem esperar.</p>
          : (
            <ul className="divide-y">
              {lista.data.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{TIPOS[c.tipo] || c.tipo} · {mostrarFone(c.telefone)}</p>
                  </div>
                  {podeGerir && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Remover marcação de ${c.nome}`} disabled={remover.isPending} onClick={() => remover.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
      <section className="h-fit rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Marcar contato</h2>
        {!podeGerir ? (
          <p className="mt-2 text-sm text-muted-foreground">Só a coordenação (admin, diretoria e gestão de captação) marca contatos.</p>
        ) : (
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="ct-fone">Telefone (WhatsApp)</Label><Input id="ct-fone" value={fone} onChange={(e) => setFone(e.target.value)} placeholder="(47) 99999-0000" inputMode="tel" /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-nome">Nome que vai aparecer</Label><Input id="ct-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Hospital Regional, diretor clínico" maxLength={120} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger id="ct-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPOS).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={salvar.isPending}>{salvar.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : "Marcar contato"}</Button>
          </form>
        )}
      </section>
    </div>
  );
}
