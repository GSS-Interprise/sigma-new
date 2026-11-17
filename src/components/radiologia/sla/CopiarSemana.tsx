// "Copiar semana anterior" da Escala de plantão (Raul, 17/11/2026): Wagner e Brenda montam o noturno quase igual toda
// semana; em vez de lançar plantão por plantão, copiam a semana de antes para esta ou para a próxima.
// Semana = segunda 00h a domingo 24h, no fuso do navegador (a equipe está em Brasília). O plantão pertence à semana do
// seu INÍCIO: o noturno de domingo 19h entra no domingo, mesmo terminando na segunda.
// Copiar de novo não duplica: pula o plantão que já existe (mesmo papel, telefone e horário) e o que já terminou.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UNIDADE, type Plantao } from "./useSla";

const db = supabase as any;
const SEMANA_MS = 7 * 86_400_000;
const PAPEL_NOME: Record<Plantao["papel"], string> = { plantonista: "plantonista", coordenador: "coordenador", diretoria: "diretoria" };

function segundaDaSemana(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const faixa = (seg: Date) => `${dm(seg)} a ${dm(somaDias(seg, 6))}`;
const chave = (p: { papel: string; telefone: string; inicio: string }) => `${p.papel}|${p.telefone}|${new Date(p.inicio).getTime()}`;

type Alvo = "esta" | "proxima";

export function CopiarSemana() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState<Alvo>("proxima");

  // `aberto` nas dependências de propósito: reabrir o diálogo recalcula a semana (a aba pode ficar aberta de domingo
  // para segunda).
  const destino = useMemo(() => {
    const seg = segundaDaSemana(new Date());
    return alvo === "esta" ? seg : somaDias(seg, 7);
  }, [alvo, aberto]);
  const origem = somaDias(destino, -7);

  // Lê a semana de origem e a de destino juntas: a de destino serve para não duplicar.
  const semanas = useQuery({
    queryKey: ["sla-escala-copiar", origem.toISOString()],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await db.from("sla_plantao").select("id, papel, inicio, fim, nome, telefone, email")
        .eq("unidade", UNIDADE).gte("inicio", origem.toISOString()).lt("inicio", somaDias(destino, 7).toISOString())
        .order("inicio").order("id");
      if (error) throw error;
      return (data ?? []) as Plantao[];
    },
  });

  const plano = useMemo(() => {
    const todos = semanas.data ?? [];
    const daOrigem = todos.filter((p) => new Date(p.inicio) < destino);
    const jaTem = new Set(todos.filter((p) => new Date(p.inicio) >= destino).map(chave));
    const agora = Date.now();
    let repetidos = 0, passados = 0;
    const novos: Omit<Plantao, "id">[] = [];
    for (const p of daOrigem) {
      const n = {
        papel: p.papel, nome: p.nome, telefone: p.telefone, email: p.email,
        inicio: new Date(new Date(p.inicio).getTime() + SEMANA_MS).toISOString(),
        fim: new Date(new Date(p.fim).getTime() + SEMANA_MS).toISOString(),
      };
      if (new Date(n.fim).getTime() <= agora) { passados++; continue; }
      if (jaTem.has(chave(n))) { repetidos++; continue; }
      novos.push(n);
    }
    const pessoas = new Map<string, number>();
    for (const n of novos) {
      const k = `${n.nome} (${PAPEL_NOME[n.papel]})`;
      pessoas.set(k, (pessoas.get(k) ?? 0) + 1);
    }
    return { origemTotal: daOrigem.length, novos, repetidos, passados, pessoas: [...pessoas.entries()] };
  }, [semanas.data, destino]);

  const copiar = useMutation({
    mutationFn: async () => {
      const linhas = plano.novos.map((n) => ({ unidade: UNIDADE, ...n }));
      const { error } = await db.from("sla_plantao").insert(linhas);
      if (error) throw error;
      return linhas.length;
    },
    onSuccess: (n) => {
      toast.success(`${n === 1 ? "1 plantão copiado" : `${n} plantões copiados`} para a semana de ${faixa(destino)}.`);
      qc.invalidateQueries({ queryKey: ["sla-escala"] });
      qc.invalidateQueries({ queryKey: ["sla-escala-copiar"] });
      setAberto(false);
    },
    onError: (e) => toast.error(`Não copiou: ${(e as Error).message}`),
  });

  const pulados = [
    plano.repetidos > 0 && `${plano.repetidos} já ${plano.repetidos === 1 ? "estava" : "estavam"} na escala`,
    plano.passados > 0 && `${plano.passados} ${plano.passados === 1 ? "cairia" : "cairiam"} em horário que já passou`,
  ].filter(Boolean).join(" e ");

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAberto(true)}>
        <Copy className="h-3.5 w-3.5" /> Copiar semana anterior
      </Button>

      <AlertDialog open={aberto} onOpenChange={(o) => !copiar.isPending && setAberto(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar a escala da semana anterior</AlertDialogTitle>
            <AlertDialogDescription>
              Os mesmos plantões, nos mesmos dias da semana e horários, uma semana depois.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Preencher a semana</p>
              <Select value={alvo} onValueChange={(v) => setAlvo(v as Alvo)}>
                <SelectTrigger aria-label="Semana a preencher"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="esta">Esta semana ({faixa(segundaDaSemana(new Date()))})</SelectItem>
                  <SelectItem value="proxima">Próxima semana ({faixa(somaDias(segundaDaSemana(new Date()), 7))})</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Copiando de {faixa(origem)}.</p>
            </div>

            {semanas.isLoading && <Skeleton className="h-16 w-full" />}
            {semanas.error && <p className="text-red-700">Não deu para ler a escala: {(semanas.error as Error).message}</p>}
            {!semanas.isLoading && !semanas.error && plano.origemTotal === 0 && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground">
                A semana de {faixa(origem)} não tem plantão para copiar. Lance os plantões em "Adicionar plantão".
              </p>
            )}
            {!semanas.isLoading && !semanas.error && plano.origemTotal > 0 && (
              <div className="rounded-md border px-3 py-2">
                {plano.novos.length > 0 ? (
                  <>
                    <p className="font-medium">
                      {plano.novos.length === 1 ? "1 plantão novo" : `${plano.novos.length} plantões novos`}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {plano.pessoas.map(([quem, n]) => (
                        <li key={quem} className="flex justify-between gap-3">
                          <span className="truncate" title={quem}>{quem}</span>
                          <span className="shrink-0 tabular-nums">{n}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="font-medium">Nada a copiar.</p>
                )}
                {pulados && <p className="mt-1 text-xs text-muted-foreground">Fora da cópia: {pulados}.</p>}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={copiar.isPending}>Cancelar</AlertDialogCancel>
            <Button disabled={plano.novos.length === 0 || copiar.isPending || semanas.isLoading} onClick={() => copiar.mutate()}>
              {copiar.isPending ? "Copiando…" : plano.novos.length > 1 ? `Copiar ${plano.novos.length} plantões` : "Copiar plantão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
