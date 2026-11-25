// Aba Avisos do SLA (21/11). Pergunta da tela: "Quando e como o médico de plantão é avisado?"
// Quem usa: Wagner e Brenda, de vez em quando. Decisão: ligar/desligar os avisos e ajustar a sequência
// (1º, 2º, 3º aviso, ligação; quanto tempo antes ou depois do prazo). Quem mais avisar fica na aba Coordenação.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { telefoneBonito, useColetor } from "./useSla";
import { RegrasAvisos, useRegras } from "./RegrasAvisos";
import { RegrasExtras } from "./RegrasExtras";
import { PreviaCelular } from "./PreviaCelular";
import { CANAL, MAX_ANTES, MAX_DEPOIS, type Passo, quando, usePassos, useSalvarPassos } from "./usePassos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas do SLA fora dos tipos gerados (ver useSla.ts)
const db = supabase as any;
type Linha = { id?: string; canal: "whatsapp" | "ligacao"; min: string; lado: "antes" | "depois"; ativo: boolean };

const paraLinha = (p: Passo): Linha => ({
  id: p.id, canal: p.canal === "ligacao" ? "ligacao" : "whatsapp", min: String(Math.abs(p.minutos)),
  lado: p.minutos < 0 ? "antes" : "depois", ativo: p.ativo,
});
const minutosDe = (l: Linha) => (l.lado === "antes" ? -1 : 1) * Math.round(Number(l.min));

function erroDe(linhas: Linha[]) {
  for (const [i, l] of linhas.entries()) {
    const m = Number(l.min);
    if (l.min === "" || !Number.isInteger(m) || m < 0) return `${i + 1}º aviso: minutos em número inteiro.`;
    if (l.lado === "antes" && m > MAX_ANTES) return `${i + 1}º aviso: no máximo 48 h antes do prazo.`;
    if (l.lado === "depois" && m > MAX_DEPOIS) return `${i + 1}º aviso: no máximo 2 h depois do prazo.`;
  }
  return linhas.length > 12 ? "No máximo 12 avisos." : null;
}

export function AbaAvisos() {
  const passos = usePassos();
  const coletor = useColetor();
  const prazoPs = useRegras().data?.prazos?.ps;
  const qc = useQueryClient();
  const salvar = useSalvarPassos("plantonista", "Avisos salvos. Valem a partir do próximo exame da fila.");
  const salvos = useMemo(() => (passos.data ?? []).filter((p) => p.destino === "plantonista").map(paraLinha), [passos.data]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => { setLinhas(salvos); }, [salvos]);

  const ligar = useMutation({
    mutationFn: async (ativo: boolean) => { const { error } = await db.rpc("sla_alertas_ligar", { p_ativo: ativo }); if (error) throw error; return ativo; },
    onSuccess: (ativo) => {
      toast.success(ativo ? "Avisos ligados. O robô passa a avisar quem está na escala." : "Avisos desligados. Ninguém será avisado.");
      qc.invalidateQueries({ queryKey: ["sla-coletor"] });
    },
    onError: (e) => toast.error(`Não mudou: ${(e as Error).message}`),
  });

  const mudou = JSON.stringify(linhas) !== JSON.stringify(salvos);
  const erro = erroDe(linhas);
  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const ativo = !!coletor.data?.alertasAtivos;
  const teste = coletor.data?.testeDestino ?? null;
  // Prévia em ordem de tempo, como o robô vai fazer.
  const previa = linhas.filter((l) => l.ativo && !erroDe([l])).map((l) => ({ ...l, m: minutosDe(l) })).sort((a, b) => a.m - b.m);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Avisos ao médico de plantão</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ativo ? "Ligados. Param quando o médico toca em Assumir laudo ou aperta 1 na ligação." : "Desligados: ninguém é avisado."}
            </p>
          </div>
          <Switch checked={ativo} disabled={coletor.isLoading || ligar.isPending} onCheckedChange={(v) => ligar.mutate(v)}
            aria-label="Avisos ligados" />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {teste && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Teste interno ligado: os WhatsApps vão para {telefoneBonito(teste)}, não para os médicos, e nenhuma ligação sai.
            </p>
          )}
          {passos.isLoading && <Skeleton className="h-28 w-full" />}
          {passos.error && <p className="text-red-700">Não deu para carregar os avisos: {(passos.error as Error).message}</p>}

          {passos.data && (
            <>
              {linhas.length === 0 && <p className="text-muted-foreground">Nenhum aviso. Sem aviso, o médico só é cobrado pela coordenação.</p>}
              <div className="space-y-2">
                {linhas.map((l, i) => (
                  <div key={l.id ?? `novo-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                    <span className="w-7 font-semibold tabular-nums">{i + 1}º</span>
                    <Select value={l.canal} onValueChange={(v) => muda(i, { canal: v as Linha["canal"] })}>
                      <SelectTrigger className="h-9 w-32" aria-label={`Canal do ${i + 1}º aviso`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">{CANAL.whatsapp}</SelectItem>
                        <SelectItem value="ligacao">{CANAL.ligacao}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-9 w-20 tabular-nums" inputMode="numeric" value={l.min} aria-label={`Minutos do ${i + 1}º aviso`}
                      onChange={(e) => muda(i, { min: e.target.value.replace(/\D/g, "") })} />
                    <span className="text-muted-foreground">min</span>
                    <Select value={l.lado} onValueChange={(v) => muda(i, { lado: v as Linha["lado"] })}>
                      <SelectTrigger className="h-9 w-44" aria-label={`Antes ou depois do prazo, ${i + 1}º aviso`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="antes">antes do prazo</SelectItem>
                        <SelectItem value="depois">depois do prazo</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="ml-auto flex items-center gap-2">
                      <Switch checked={l.ativo} onCheckedChange={(v) => muda(i, { ativo: v })} aria-label={`${i + 1}º aviso ligado`} />
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Remover ${i + 1}º aviso`}
                        onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="h-9" disabled={linhas.length >= 12}
                  onClick={() => setLinhas((ls) => [...ls, { canal: "whatsapp", min: "10", lado: "depois", ativo: true }])}>
                  <Plus className="mr-1 h-4 w-4" />Adicionar aviso
                </Button>
                <div className="ml-auto flex gap-2">
                  {mudou && <Button variant="ghost" className="h-9" onClick={() => setLinhas(salvos)} disabled={salvar.isPending}>Desfazer</Button>}
                  <Button className="h-9" disabled={!mudou || !!erro || salvar.isPending}
                    onClick={() => salvar.mutate(linhas.map((l) => ({ id: l.id, destino: "plantonista", canal: l.canal, minutos: minutosDe(l), ativo: l.ativo })))}>
                    {salvar.isPending ? "Salvando…" : "Salvar avisos"}
                  </Button>
                </div>
              </div>
              {erro && <p className="text-xs text-red-700">{erro}</p>}
              {previa.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Na prática: {previa.map((l) => `${CANAL[l.canal]} ${quando(l.m)}`).join(" → ")}.{prazoPs ? ` Exame de PS vence ${quando(prazoPs).replace(" depois do prazo", "")} depois de chegar.` : ""}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <PreviaCelular />
      </div>

      <div className="space-y-4">
        <RegrasAvisos />
        <RegrasExtras />
      </div>
    </div>
  );
}
