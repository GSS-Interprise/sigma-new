// Regras por tipo de contato (atendimento_regras, pedido dos sócios em 24/11/2026). Uma linha por categoria: a meta
// do painel e a escada de avisos daquela categoria. A categoria vem do contato marcado (prioridade, senão o tipo);
// contato não marcado = Padrão. Os avisos leem estas linhas em supabase/functions/_shared/atendimento.ts (escadaDe).
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIAS, type Regra, useRegras } from "./useAtendimento";

// Rascunho da tela: os números como texto, para aceitar "3, 10", "3 10" ou campo vazio (= não avisa).
type Linha = { categoria: Regra["categoria"]; meta: string; pessoa: string; coord: string; dir: string };
const paraLinha = (r: Regra): Linha => ({
  categoria: r.categoria, meta: String(r.meta_min), pessoa: (r.pessoa_min || []).join(", "),
  coord: r.coordenacao_min == null ? "" : String(r.coordenacao_min), dir: r.diretoria_min == null ? "" : String(r.diretoria_min),
});

export function RegrasPorTipo({ podeGerir }: { podeGerir: boolean }) {
  const qc = useQueryClient();
  const q = useRegras();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => { if (q.data) setLinhas(q.data.map(paraLinha)); }, [q.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const rotulo = (c: string) => CATEGORIAS.find((x) => x.id === c)?.rotulo ?? c;
      const inteiro = (v: string, nome: string, max: number) => {
        const n = Number(v.trim());
        if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${nome}: use minutos inteiros de 1 a ${max}.`);
        return n;
      };
      const regras = linhas.map((l) => {
        const nome = rotulo(l.categoria);
        const meta = inteiro(l.meta, `${nome}, meta`, 1440);
        const pessoa = [...new Set(l.pessoa.split(/[^0-9]+/).filter(Boolean).map((x) => inteiro(x, `${nome}, avisos da pessoa`, 2880)))].sort((a, b) => a - b);
        if (pessoa.length > 4) throw new Error(`${nome}: no máximo 4 avisos para quem está com o número.`);
        const coord = l.coord.trim() ? inteiro(l.coord, `${nome}, coordenação`, 2880) : null;
        const dir = l.dir.trim() ? inteiro(l.dir, `${nome}, diretoria`, 2880) : null;
        if (coord != null && dir != null && dir < coord) throw new Error(`${nome}: a diretoria é avisada depois da coordenação.`);
        return { categoria: l.categoria, meta_min: meta, pessoa_min: pessoa, coordenacao_min: coord, diretoria_min: dir };
      });
      const { data: u } = await supabase.auth.getUser();
      const db = supabase as unknown as { from: (t: string) => any };
      const res = await Promise.all(regras.map((r) => db.from("atendimento_regras")
        .update({ ...r, atualizado_por: u.user?.id ?? null, atualizado_em: new Date().toISOString() }).eq("categoria", r.categoria)));
      const erro = res.find((r: { error: { message: string } | null }) => r.error);
      if (erro) throw new Error(erro.error.message);
    },
    onSuccess: () => {
      toast.success("Regras salvas. O painel e os avisos já usam os novos valores.");
      for (const k of ["atendimento-regras", "atendimento-fila", "atendimento-metas", "atendimento-indicadores-hoje"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const ed = !podeGerir;
  const set = (i: number, p: Partial<Linha>) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const campo = "h-9 tabular-nums";

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Regras por tipo de contato</h2>
        <p className="text-xs text-muted-foreground">
          Minutos contados dentro do horário de atendimento. Valores iniciais sugeridos: ajuste com a coordenação. Campo vazio = não avisa.
        </p>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : q.isError ? <p className="text-sm text-destructive">Não deu para carregar as regras: {(q.error as Error).message}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                {/* Os minutos ficam no cabeçalho (e não em cada campo) para a tabela caber inteira em 1024 px. */}
                <tr className="text-left text-xs text-muted-foreground">
                  <th rowSpan={2} className="border-b py-2 pr-3 align-bottom font-medium">Tipo de contato</th>
                  <th rowSpan={2} className="w-24 border-b py-2 pr-3 align-bottom font-medium">Meta (min)</th>
                  <th colSpan={3} className="pb-0 pt-2 font-medium">Avisa, em minutos sem resposta</th>
                </tr>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-40 py-2 pr-3 font-medium">Quem está com o número</th>
                  <th className="w-28 py-2 pr-3 font-medium">Coordenação</th>
                  <th className="w-24 py-2 font-medium">Diretoria</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l, i) => {
                  const cat = CATEGORIAS.find((c) => c.id === l.categoria)!;
                  return (
                    <tr key={l.categoria}>
                      <td className="py-2 pr-3">
                        <p className="font-medium">{cat.rotulo}</p>
                        <p className="text-xs text-muted-foreground">{cat.ajuda}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Input inputMode="numeric" className={`${campo} w-16`} aria-label={`Meta de ${cat.rotulo} em minutos`} value={l.meta} disabled={ed} onChange={(e) => set(i, { meta: e.target.value })} />
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Input inputMode="numeric" className={`${campo} w-28`} placeholder="ex.: 3, 10" aria-label={`Avisos de ${cat.rotulo} para quem está com o número, em minutos`} value={l.pessoa} disabled={ed} onChange={(e) => set(i, { pessoa: e.target.value })} />
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Input inputMode="numeric" className={`${campo} w-16`} placeholder="—" aria-label={`Aviso de ${cat.rotulo} para a coordenação, em minutos`} value={l.coord} disabled={ed} onChange={(e) => set(i, { coord: e.target.value })} />
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <Input inputMode="numeric" className={`${campo} w-16`} placeholder="—" aria-label={`Aviso de ${cat.rotulo} para a diretoria, em minutos`} value={l.dir} disabled={ed} onChange={(e) => set(i, { dir: e.target.value })} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Prioridade, cliente e médico vêm do contato marcado na aba Contatos marcados.</p>
        {podeGerir ? (
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !linhas.length}>
            {salvar.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : "Salvar regras"}
          </Button>
        ) : <p className="text-sm text-muted-foreground">Só a coordenação (admin, diretoria e gestão de captação) muda as regras.</p>}
      </div>
    </section>
  );
}
