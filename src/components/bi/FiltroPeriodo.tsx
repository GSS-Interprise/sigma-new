import { useEffect, useMemo, useState } from "react";
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
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
  const [range, setRange] = useState<DateRange | undefined>(
    dataInicio && dataFim
      ? { from: new Date(dataInicio), to: new Date(dataFim) }
      : undefined
  );

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
      onDataInicioChange(fmt(presets.atual.inicio));
      onDataFimChange(fmt(presets.atual.fim));
    } else if (value === "personalizado") {
      setRangeOpen(true);
    } else {
      const m = presets.ultimos8.find((x) => x.value === value);
      if (m) {
        onDataInicioChange(fmt(m.inicio));
        onDataFimChange(fmt(m.fim));
      }
    }
  };

  const handleRange = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from) onDataInicioChange(fmt(r.from));
    if (r?.to) {
      onDataFimChange(fmt(r.to));
      setRangeOpen(false);
    }
  };

  const labelPersonalizado =
    dataInicio && dataFim
      ? `${format(new Date(dataInicio), "dd/MM/yyyy")} → ${format(new Date(dataFim), "dd/MM/yyyy")}`
      : "Selecionar período";

  const isDark = theme === "dark-neon";
  const cardCls = isDark
    ? "p-4 border-cyan-500/30 bg-slate-950/70 backdrop-blur-sm"
    : "p-4";
  const labelCls = isDark ? "flex items-center gap-2 mb-2 text-slate-300" : "flex items-center gap-2 mb-2";
  const triggerCls = isDark
    ? "bg-slate-900/80 border-cyan-500/30 text-slate-100 hover:border-cyan-400/60"
    : "";
  const popoverCls = isDark
    ? "w-auto p-0 z-50 bg-slate-950 border-cyan-500/40 text-slate-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
    : "w-auto p-0 bg-popover z-50";
  const selectContentCls = isDark
    ? "z-50 bg-slate-950 border-cyan-500/40 text-slate-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
    : "bg-popover z-50";
  const buttonCls = isDark
    ? "w-full justify-start text-left font-normal bg-slate-900/80 border-cyan-500/30 text-slate-100 hover:bg-slate-900 hover:text-cyan-300 hover:border-cyan-400/60"
    : cn("w-full justify-start text-left font-normal", !dataInicio && "text-muted-foreground");
  const calendarCls = isDark
    ? "p-3 pointer-events-auto [&_.rdp-day]:text-slate-200 [&_.rdp-day_selected]:bg-cyan-500 [&_.rdp-day_selected]:text-slate-950 [&_.rdp-day:hover:not([disabled])]:bg-cyan-500/20 [&_.rdp-head_cell]:text-cyan-400 [&_.rdp-caption_label]:text-slate-100 [&_.rdp-nav_button]:text-slate-100 [&_.rdp-nav_button:hover]:bg-cyan-500/20 [&_.rdp-day_today]:text-cyan-300 [&_.rdp-day_range_middle]:bg-cyan-500/20 [&_.rdp-day_range_middle]:text-slate-100"
    : "p-3 pointer-events-auto";

  return (
    <Card className={cardCls}>
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
            <SelectContent className={selectContentCls}>
              <SelectItem value="atual">Mês atual</SelectItem>
              {presets.ultimos8.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                </SelectItem>
              ))}
              <SelectItem value="personalizado">Por período (calendário)</SelectItem>
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
                  variant="outline"
                  className={buttonCls}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {labelPersonalizado}
                </Button>
              </PopoverTrigger>
              <PopoverContent className={popoverCls} align="start">
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
