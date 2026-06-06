import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Dias: 1=Seg .. 7=Dom (mesmo schema da coluna campanhas.dias_semana)
const DIAS = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

export interface JanelaHorario {
  ativo: boolean;
  inicio: number; // hora BRT 0-23
  fim: number; // hora BRT 1-24
  dias: number[]; // 1=seg..7=dom
}

interface Props {
  value: JanelaHorario;
  onChange: (v: JanelaHorario) => void;
}

// Bloco reutilizável de configuração de janela de disparo (WS2).
// Controlado: recebe value + onChange, sem lógica de submit.
export function JanelaHorarioConfig({ value, onChange }: Props) {
  const { ativo, inicio, fim, dias } = value;
  const set = (patch: Partial<JanelaHorario>) => onChange({ ...value, ...patch });
  const toggleDia = (d: number) =>
    set({ dias: dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort((a, b) => a - b) });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label>Janela de disparo</Label>
          <p className="text-xs text-muted-foreground">
            Só dispara nos horários/dias abaixo (anti-ban). Fora disso, reagenda sozinho.
          </p>
        </div>
        <Switch checked={ativo} onCheckedChange={(c) => set({ ativo: c })} />
      </div>

      {ativo && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Início (h)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={inicio}
                onChange={(e) => set({ inicio: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </div>
            <span className="pt-5 text-muted-foreground">até</span>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Fim (h)</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={fim}
                onChange={(e) => set({ fim: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dias da semana</Label>
            <div className="flex flex-wrap gap-1">
              {DIAS.map((d) => (
                <Button
                  key={d.v}
                  type="button"
                  size="sm"
                  variant={dias.includes(d.v) ? "default" : "outline"}
                  className="px-2.5"
                  onClick={() => toggleDia(d.v)}
                >
                  {d.l}
                </Button>
              ))}
            </div>
          </div>

          {(dias.length === 0 || fim <= inicio) && (
            <p className="text-xs text-destructive">
              {dias.length === 0
                ? "Selecione ao menos 1 dia."
                : "O horário de fim deve ser maior que o de início."}{" "}
              Sem isso a campanha nunca dispara.
            </p>
          )}
        </>
      )}
    </div>
  );
}
