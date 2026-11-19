// Regras dos avisos do SLA (19/11). Pergunta do cartão: "Quando o robô avisa?" Quem usa: Wagner e Brenda, raramente.
// Fechado mostra a regra em vigor numa linha; "Mudar regras" abre os campos. Prazo novo vale também para a fila que
// já está esperando laudo (a função recalcula o vencimento).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const db = supabase as any;
type Regras = { prazos: Record<string, number>; aviso_pct: number; intervalo_min: number };
const ORIGENS: { id: string; nome: string }[] = [
  { id: "ps", nome: "Pronto-socorro" },
  { id: "internado", nome: "Internado" },
  { id: "externo", nome: "Externo" },
];

const horas = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? `${h} h` : `${Math.floor(h)} h ${min % 60} min`;
};

export function useRegras() {
  return useQuery({
    queryKey: ["sla-regras"],
    queryFn: async () => {
      const { data, error } = await db.rpc("sla_regras");
      if (error) throw error;
      return data as Regras;
    },
  });
}

export function RegrasAvisos() {
  const regras = useRegras();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [prazoH, setPrazoH] = useState<Record<string, string>>({});
  const [pct, setPct] = useState("80");
  const [intervalo, setIntervalo] = useState("3");

  useEffect(() => {
    if (!regras.data || editando) return;
    setPrazoH(Object.fromEntries(ORIGENS.map((o) => [o.id, String((regras.data.prazos[o.id] ?? 0) / 60)])));
    setPct(String(regras.data.aviso_pct));
    setIntervalo(String(regras.data.intervalo_min));
  }, [regras.data, editando]);

  // Postel: aceita "2", "2,5" ou "2.5" horas.
  const minutos = (v: string) => Math.round(Number(String(v).replace(",", ".")) * 60);
  const erro = ORIGENS.map((o) => {
    const m = minutos(prazoH[o.id] ?? "");
    return !Number.isFinite(m) || m < 15 || m > 10080 ? `${o.nome}: prazo entre 0,25 e 168 horas.` : null;
  }).find(Boolean)
    ?? (!(Number(pct) >= 30 && Number(pct) <= 95) ? "Aviso entre 30% e 95% do prazo." : null)
    ?? (!(Number(intervalo) >= 1 && Number(intervalo) <= 60) ? "Intervalo entre 1 e 60 minutos." : null);

  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("sla_regras_salvar", {
        p_prazos: Object.fromEntries(ORIGENS.map((o) => [o.id, minutos(prazoH[o.id])])),
        p_aviso_pct: Number(pct), p_intervalo_min: Number(intervalo),
      });
      if (error) throw error;
      return data as Regras & { exames_recalculados: number };
    },
    onSuccess: (d) => {
      const n = d.exames_recalculados;
      toast.success(n > 0 ? `Regras salvas. ${n} ${n === 1 ? "exame da fila ganhou" : "exames da fila ganharam"} o prazo novo.` : "Regras salvas.");
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["sla-regras"] });
      qc.invalidateQueries({ queryKey: ["sla-fila"] });
    },
    onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
  });

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-base">Regras dos avisos</CardTitle>
        {!editando && regras.data && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => setEditando(true)}>Mudar regras</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {regras.isLoading && <Skeleton className="h-16 w-full" />}
        {regras.error && <p className="text-red-700">Não deu para carregar as regras: {(regras.error as Error).message}</p>}

        {regras.data && !editando && (
          <dl className="space-y-1.5">
            {/* rótulo em cima e cada prazo inteiro: na coluna de 380px a linha única quebrava no meio ("48 / h") */}
            <div><dt className="text-muted-foreground">Prazo do laudo</dt>
              <dd className="flex flex-wrap gap-x-3 font-medium">
                {ORIGENS.map((o) => <span key={o.id} className="whitespace-nowrap">{o.id === "ps" ? "PS" : o.nome} {horas(regras.data.prazos[o.id] ?? 0)}</span>)}
              </dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">WhatsApp ao plantonista</dt>
              <dd className="font-medium">aos {regras.data.aviso_pct}% do prazo</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Venceu sem dono</dt>
              <dd className="font-medium">liga a cada {regras.data.intervalo_min} min</dd></div>
          </dl>
        )}

        {regras.data && editando && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Prazo do laudo (horas)</Label>
              <div className="grid grid-cols-3 gap-2">
                {ORIGENS.map((o) => (
                  <div key={o.id} className="space-y-1">
                    <span className="block text-xs text-muted-foreground">{o.nome}</span>
                    <Input inputMode="decimal" value={prazoH[o.id] ?? ""} aria-label={`Prazo ${o.nome} em horas`}
                      onChange={(e) => setPrazoH((p) => ({ ...p, [o.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="sla-pct">Avisar aos (% do prazo)</Label>
                <Input id="sla-pct" type="number" min={30} max={95} step={5} value={pct} onChange={(e) => setPct(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sla-int">Entre ligações (min)</Label>
                <Input id="sla-int" type="number" min={1} max={60} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
              </div>
            </div>
            {erro && <p className="text-xs text-red-700">{erro}</p>}
            <p className="text-xs text-muted-foreground">O prazo novo vale também para os exames que já estão esperando laudo.</p>
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
