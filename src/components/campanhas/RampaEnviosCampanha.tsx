import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Subida orgânica dos envios por dia. Só quem tem a permissão de rampa (Vinicius) ou admin
// edita; os outros veem o estado. A regra roda no banco todo dia às 06h05 e para sozinha
// quando o número da campanha fica RED na Meta (aplicar_rampa_campanhas).
export type Rampa = { ativa: boolean; incremento: number; cadaDias: number; teto: number };

const dataBr = (d?: string | null) => (d ? d.split("-").reverse().slice(0, 2).join("/") : null);

export function RampaEnviosCampanha({ value, onChange, limiteAtual, proximoEm, motivoParada }: {
  value: Rampa;
  onChange: (r: Rampa) => void;
  limiteAtual: number;
  proximoEm?: string | null;
  motivoParada?: string | null;
}) {
  const { user } = useAuth();
  const { data: podeEditar = false } = useQuery({
    queryKey: ["pode-mexer-rampa", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("pode_mexer_rampa" as never, { _user_id: user!.id } as never);
      return data === true;
    },
  });

  const proximo = Math.min(value.teto, limiteAtual + value.incremento);
  const estado = !value.ativa
    ? motivoParada === "Chegou na meta" ? `Chegou na meta de ${value.teto}/dia.` : "Desligada."
    : motivoParada
      ? `Parada: ${motivoParada.toLowerCase()}. Volta a subir quando melhorar.`
      : limiteAtual >= value.teto
        ? `Já está na meta de ${value.teto}/dia.`
        : `Hoje ${limiteAtual}/dia. Próximo aumento${proximoEm ? ` em ${dataBr(proximoEm)}` : ""}: ${proximo}/dia.`;
  const set = (parcial: Partial<Rampa>) => onChange({ ...value, ...parcial });
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium"><TrendingUp className="h-3.5 w-3.5" /> Subida automática</p>
          <p className={`text-[11px] ${motivoParada && value.ativa ? "text-amber-700" : "text-muted-foreground"}`}>{estado}</p>
        </div>
        <Switch checked={value.ativa} onCheckedChange={(ativa) => set({ ativa })} disabled={!podeEditar}
          aria-label="Ligar subida automática" />
      </div>
      {value.ativa && (
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 space-y-1">
            <Label className="text-[11px]">Somar</Label>
            <Input type="number" min={1} max={100} className="min-h-11" value={value.incremento} disabled={!podeEditar}
              onChange={(e) => set({ incremento: num(e.target.value, 1, 100) })} />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-[11px]">A cada (dias)</Label>
            <Input type="number" min={1} max={30} className="min-h-11" value={value.cadaDias} disabled={!podeEditar}
              onChange={(e) => set({ cadaDias: num(e.target.value, 1, 30) })} />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-[11px]">Até (por dia)</Label>
            <Input type="number" min={1} max={2000} className="min-h-11" value={value.teto} disabled={!podeEditar}
              onChange={(e) => set({ teto: num(e.target.value, 1, 2000) })} />
          </div>
        </div>
      )}
      {!podeEditar && <p className="text-[11px] text-muted-foreground">Só o responsável pela subida (Vinicius) muda esta configuração.</p>}
    </div>
  );
}
