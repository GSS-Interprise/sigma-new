import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface FiltroPeriodoProps {
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  children?: React.ReactNode;
  theme?: "default" | "dark-neon";
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

const parseDateValue = (value: string) => {
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : new Date(value);
};

const createRangeFromValues = (inicio?: string, fim?: string): DateRange | undefined => {
  if (!inicio && !fim) return undefined;

  const from = inicio ? parseDateValue(inicio) : undefined;
  const to = fim ? parseDateValue(fim) : undefined;

  return from || to ? { from, to } : undefined;
};

function buildPresets() {
  const hoje = new Date();
  const atual = {
    inicio: startOfMonth(hoje),
    fim: endOfMonth(hoje),
  };
  const ultimos8: { value: string; label: string; inicio: Date; fim: Date }[] = [];
  for (let i = 1; i <= 8; i++) {
    const ref = subMonths(hoje, i);
    ultimos8.push({
      value: format(ref, "yyyy-MM"),
      label: format(ref, "MMMM 'de' yyyy", { locale: ptBR }),
      inicio: startOfMonth(ref),
      fim: endOfMonth(ref),
    });
  }
  return { atual, ultimos8 };
}

export function FiltroPeriodo({
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  children,
  theme = "default",
}: FiltroPeriodoProps) {
  const presets = useMemo(buildPresets, []);
  const [modo, setModo] = useState<string>("atual");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() =>
    createRangeFromValues(dataInicio, dataFim)
  );

  useEffect(() => {
    if (dataInicio && dataFim) {
      setRange(createRangeFromValues(dataInicio, dataFim));
    }
  }, [dataInicio, dataFim]);

  // Inicializa com o mês atual se nada estiver setado
  useEffect(() => {
    if (!dataInicio || !dataFim) {
      onDataInicioChange(fmt(presets.atual.inicio));
      onDataFimChange(fmt(presets.atual.fim));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModo = (value: string) => {
    setModo(value);
    if (value === "atual") {
      setRange({ from: presets.atual.inicio, to: presets.atual.fim });
      onDataInicioChange(fmt(presets.atual.inicio));
      onDataFimChange(fmt(presets.atual.fim));
    } else if (value === "personalizado") {
      setRange(createRangeFromValues(dataInicio, dataFim));
      setRangeOpen(true);
    } else {
      const m = presets.ultimos8.find((x) => x.value === value);
      if (m) {
        setRange({ from: m.inicio, to: m.fim });
        onDataInicioChange(fmt(m.inicio));
        onDataFimChange(fmt(m.fim));
      }
    }
  };

  const handleRange = (r: DateRange | undefined) => {
    setRange(r);

    if (r?.from && r?.to) {
      onDataInicioChange(fmt(r.from));
      onDataFimChange(fmt(r.to));
      setRangeOpen(false);
    }
  };

  const labelPersonalizado =
    range?.from && range?.to
      ? `${format(range.from, "dd/MM/yyyy")} → ${format(range.to, "dd/MM/yyyy")}`
      : range?.from
        ? `${format(range.from, "dd/MM/yyyy")} → selecionar final`
        : "Selecionar período";

  const isDark = theme === "dark-neon";
  const themeVars = isDark
    ? ({
        "--fp-surface": "222 47% 10%",
        "--fp-surface-elevated": "222 47% 8%",
        "--fp-border": "188 95% 43%",
        "--fp-foreground": "210 40% 96%",
        "--fp-muted": "215 20% 74%",
        "--fp-accent": "188 95% 43%",
      } as CSSProperties)
    : undefined;
  const cardCls = isDark
    ? "p-4 border-[hsl(var(--fp-border)/0.24)] bg-[hsl(var(--fp-surface)/0.76)] text-[hsl(var(--fp-foreground))] shadow-[0_0_24px_hsl(var(--fp-border)/0.12)] backdrop-blur-sm"
    : "p-4";
  const labelCls = isDark
    ? "mb-2 flex items-center gap-2 text-[hsl(var(--fp-muted))]"
    : "mb-2 flex items-center gap-2";
  const triggerCls = isDark
    ? "border-[hsl(var(--fp-border)/0.22)] bg-[hsl(var(--fp-surface-elevated)/0.96)] text-[hsl(var(--fp-foreground))] hover:border-[hsl(var(--fp-border)/0.5)] focus:ring-[hsl(var(--fp-accent)/0.35)]"
    : "";
  const popoverCls = isDark
    ? "z-[220] w-auto border-[hsl(var(--fp-border)/0.34)] bg-[hsl(var(--fp-surface)/1)] p-0 text-[hsl(var(--fp-foreground))] shadow-[0_0_28px_hsl(var(--fp-border)/0.18)]"
    : "w-auto p-0 bg-popover z-50";
  const selectContentCls = isDark
    ? "z-[220] border-[hsl(var(--fp-border)/0.34)] bg-[hsl(var(--fp-surface)/1)] text-[hsl(var(--fp-foreground))] shadow-[0_0_28px_hsl(var(--fp-border)/0.18)] [&_[data-radix-select-viewport]]:p-2"
    : "bg-popover z-50";
  const selectItemCls = isDark
    ? "rounded-md text-[hsl(var(--fp-foreground))] hover:bg-[hsl(var(--fp-accent)/0.12)] hover:text-[hsl(var(--fp-foreground))] focus:bg-[hsl(var(--fp-accent)/0.16)] focus:text-[hsl(var(--fp-foreground))] data-[state=checked]:bg-[hsl(var(--fp-accent)/0.14)] data-[state=checked]:text-[hsl(var(--fp-foreground))]"
    : "";
  const buttonCls = isDark
    ? "w-full justify-start border-[hsl(var(--fp-border)/0.22)] bg-[hsl(var(--fp-surface-elevated)/0.96)] text-left font-normal text-[hsl(var(--fp-foreground))] hover:border-[hsl(var(--fp-border)/0.5)] hover:bg-[hsl(var(--fp-surface-elevated))] hover:text-[hsl(var(--fp-foreground))]"
    : cn("w-full justify-start text-left font-normal", !dataInicio && "text-muted-foreground");
  const calendarCls = isDark
    ? "pointer-events-auto rounded-md border border-[hsl(var(--fp-border)/0.24)] bg-[hsl(var(--fp-surface)/0.98)] p-3 text-[hsl(var(--fp-foreground))] shadow-[0_0_24px_hsl(var(--fp-border)/0.12)] [&_.rdp-head_cell]:text-[hsl(var(--fp-muted))] [&_.rdp-button:hover:not([disabled]):not([aria-selected=true])]:bg-[hsl(var(--fp-accent)/0.14)] [&_.rdp-button:hover:not([disabled]):not([aria-selected=true])]:text-[hsl(var(--fp-foreground))] [&_.rdp-day]:text-[hsl(var(--fp-foreground))] [&_.rdp-day_range_middle]:bg-[hsl(var(--fp-accent)/0.16)] [&_.rdp-day_range_middle]:text-[hsl(var(--fp-foreground))] [&_.rdp-day_selected]:bg-[hsl(var(--fp-accent))] [&_.rdp-day_selected]:text-[hsl(var(--fp-surface))] [&_.rdp-day_today]:border [&_.rdp-day_today]:border-[hsl(var(--fp-border)/0.6)] [&_.rdp-day_today]:text-[hsl(var(--fp-foreground))] [&_button]:text-[hsl(var(--fp-foreground))] [&_button:disabled]:opacity-30"
    : "p-3 pointer-events-auto";

  return (
    <Card className={cardCls} style={themeVars}>
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[240px]">
          <Label className={labelCls}>
            <CalendarIcon className="h-4 w-4" />
            Período
          </Label>
          <Select value={modo} onValueChange={handleModo}>
            <SelectTrigger className={triggerCls}>
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent className={selectContentCls} style={themeVars}>
                <SelectItem value="atual" className={selectItemCls}>Mês atual</SelectItem>
              {presets.ultimos8.map((m) => (
                  <SelectItem key={m.value} value={m.value} className={selectItemCls}>
                  {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                </SelectItem>
              ))}
                <SelectItem value="personalizado" className={selectItemCls}>Por período (calendário)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {modo === "personalizado" && (
          <div className="flex-1 min-w-[260px]">
            <Label className={labelCls}>
              <CalendarIcon className="h-4 w-4" />
              Intervalo
            </Label>
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={buttonCls}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {labelPersonalizado}
                </Button>
              </PopoverTrigger>
              <PopoverContent className={popoverCls} align="start" style={themeVars}>
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={handleRange}
                  numberOfMonths={1}
                  initialFocus
                  locale={ptBR}
                  className={calendarCls}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {children}
      </div>
    </Card>
  );
}
