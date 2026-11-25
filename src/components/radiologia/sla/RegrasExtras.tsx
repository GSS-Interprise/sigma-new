// Outras regras do SLA (25/11/2026, Raul: "toda a cadeia de mensagens e tempos de alertas precisa ser editável").
// Tempos que estavam fixos no código: assumiu e não laudou, até quando avisar, externo, estação parada e o resumo
// diário. Fechado mostra os valores em vigor; "Mudar" abre os campos. Salva por sla_regras_extras_salvar (o banco
// valida as faixas e reagenda o resumo diário); o robô (sla-alertas) lê a cada rodada.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs do SLA fora dos tipos gerados (ver useSla.ts)
const db = supabase as any;

export type Extras = {
  assumido_folga_min: number; avisar_externo: boolean; max_atraso_min: number;
  estacao_limite_min: number; estacao_lembrete_h: number; resumo_hora: number;
};
type Campo = Exclude<keyof Extras, "avisar_externo">;

// Cada campo numérico: rótulo, unidade e a mesma faixa que o banco aceita.
const CAMPOS: { k: Campo; rotulo: string; un: string; min: number; max: number }[] = [
  { k: "assumido_folga_min", rotulo: "Assumiu e não laudou: avisar depois do prazo", un: "min", min: 0, max: 119 },
  { k: "max_atraso_min", rotulo: "Parar de avisar depois do prazo", un: "min", min: 30, max: 120 },
  { k: "estacao_limite_min", rotulo: "Estação parada depois de", un: "min sem leitura", min: 6, max: 60 },
  { k: "estacao_lembrete_h", rotulo: "Repetir aviso de estação parada a cada", un: "h", min: 1, max: 24 },
  { k: "resumo_hora", rotulo: "Resumo do dia por e-mail às", un: "h", min: 0, max: 23 },
];

export function useRegrasExtras() {
  return useQuery({
    queryKey: ["sla-regras-extras"],
    queryFn: async () => {
      const { data, error } = await db.rpc("sla_regras_extras");
      if (error) throw error;
      return data as Extras;
    },
  });
}

export function RegrasExtras() {
  const qc = useQueryClient();
  const regras = useRegrasExtras();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<Campo, string>>({} as Record<Campo, string>);
  const [externo, setExterno] = useState(false);
  useEffect(() => {
    if (!regras.data || editando) return;
    setForm(Object.fromEntries(CAMPOS.map((c) => [c.k, String(regras.data[c.k])])) as Record<Campo, string>);
    setExterno(regras.data.avisar_externo);
  }, [regras.data, editando]);

  const valor = (k: Campo) => Number(form[k]);
  const erro = CAMPOS.map((c) => {
    const n = valor(c.k);
    return form[c.k] === "" || !Number.isInteger(n) || n < c.min || n > c.max ? `${c.rotulo}: entre ${c.min} e ${c.max}.` : null;
  }).find(Boolean) ?? (valor("assumido_folga_min") >= valor("max_atraso_min")
    ? "O aviso de quem assumiu precisa sair antes de parar de avisar." : null);

  const salvar = useMutation({
    mutationFn: async () => {
      const p = { ...Object.fromEntries(CAMPOS.map((c) => [c.k, valor(c.k)])), avisar_externo: externo };
      const { data, error } = await db.rpc("sla_regras_extras_salvar", { p });
      if (error) throw error;
      return data as Extras;
    },
    onSuccess: () => {
      toast.success("Regras salvas. Valem a partir da próxima rodada do robô (até 2 min).");
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["sla-regras-extras"] });
    },
    onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
  });

  const d = regras.data;
  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-base">Outras regras</CardTitle>
        {!editando && d && <Button variant="outline" size="sm" className="h-8" onClick={() => setEditando(true)}>Mudar</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {regras.isLoading && <Skeleton className="h-28 w-full" />}
        {regras.error && <p className="text-red-700">Não deu para carregar as regras: {(regras.error as Error).message}</p>}

        {d && !editando && (
          <dl className="space-y-1.5">
            {CAMPOS.map((c) => (
              <div key={c.k} className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-muted-foreground">{c.rotulo}</dt>
                <dd className="shrink-0 whitespace-nowrap font-medium tabular-nums">{d[c.k]} {c.un}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 text-muted-foreground">Exame externo avisa o plantão</dt>
              <dd className="shrink-0 font-medium">{d.avisar_externo ? "Sim" : "Não"}</dd>
            </div>
          </dl>
        )}

        {d && editando && (
          <div className="space-y-3">
            {CAMPOS.map((c) => (
              <label key={c.k} className="flex items-center justify-between gap-3">
                <span className="min-w-0">{c.rotulo}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input className="h-9 w-16 tabular-nums" inputMode="numeric" value={form[c.k] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [c.k]: e.target.value.replace(/\D/g, "") }))} />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{c.un}</span>
                </span>
              </label>
            ))}
            <label className="flex items-center justify-between gap-3">
              <span>Exame externo avisa o plantão</span>
              <Switch checked={externo} onCheckedChange={setExterno} aria-label="Exame externo avisa o plantão" />
            </label>
            {erro && <p className="text-xs text-red-700">{erro}</p>}
            <p className="text-xs text-muted-foreground">Avisos da sequência marcados depois do "parar de avisar" não saem.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 flex-1" onClick={() => setEditando(false)} disabled={salvar.isPending}>Cancelar</Button>
              <Button className="h-9 flex-1" disabled={!!erro || salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? "Salvando…" : "Salvar regras"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
