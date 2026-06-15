import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Search, UserPlus, X } from "lucide-react";
import { useCreateGoogleEvent } from "@/hooks/useGoogleCalendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: Date | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function combine(date: Date, hh: string, mm: string) {
  const d = new Date(date);
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return d;
}

export function GoogleEventDialog({ open, onOpenChange, defaultDate }: Props) {
  const create = useCreateGoogleEvent();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [startH, setStartH] = useState("09");
  const [startM, setStartM] = useState("00");
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [endH, setEndH] = useState("10");
  const [endM, setEndM] = useState("00");
  const [withMeet, setWithMeet] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["google-event-users", userSearch],
    enabled: pickerOpen,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, nome_completo, email")
        .eq("status", "ativo")
        .order("nome_completo")
        .limit(30);
      const s = userSearch.trim();
      if (s) q = q.or(`nome_completo.ilike.%${s}%,email.ilike.%${s}%`);
      const { data } = await q;
      return (data || []) as { id: string; nome_completo: string; email: string }[];
    },
  });

  useEffect(() => {
    if (!open) return;
    const base = defaultDate ? new Date(defaultDate) : new Date();
    base.setHours(0, 0, 0, 0);
    setStartDate(base);
    setEndDate(base);
    setStartH("09");
    setStartM("00");
    setEndH("10");
    setEndM("00");
    setSummary("");
    setDescription("");
    setWithMeet(false);
    setAttendees([]);
    setManualEmail("");
    setUserSearch("");
  }, [open, defaultDate]);

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(email)) return;
    setAttendees((prev) => (prev.includes(email) ? prev : [...prev, email]));
  };
  const removeEmail = (email: string) =>
    setAttendees((prev) => prev.filter((e) => e !== email));

  const submit = async () => {
    const start = combine(startDate, startH, startM);
    const end = combine(endDate, endH, endM);
    // inclui o que estiver digitado no campo manual mas não confirmado ainda
    const manualExtras = manualEmail
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => /\S+@\S+\.\S+/.test(x));
    const finalAttendees = Array.from(new Set([...attendees, ...manualExtras]));
    await create.mutateAsync({
      summary,
      description,
      start,
      end,
      withMeet,
      attendees: finalAttendees,
    });
    onOpenChange(false);
  };

  const DatePick = ({ value, onChange }: { value: Date; onChange: (d: Date) => void }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(value, "dd/MM/yyyy", { locale: ptBR })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && onChange(d)}
          initialFocus
          locale={ptBR}
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );

  const TimePick = ({ h, m, onH, onM }: { h: string; m: string; onH: (v: string) => void; onM: (v: string) => void }) => (
    <div className="flex gap-1.5">
      <Select value={h} onValueChange={onH}>
        <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-64">
          {HOURS.map((v) => <SelectItem key={v} value={v}>{v}h</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={m} onValueChange={onM}>
        <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MINUTES.map((v) => <SelectItem key={v} value={v}>{v}min</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo evento no Google Calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Início</Label>
            <div className="flex gap-2">
              <div className="flex-1"><DatePick value={startDate} onChange={setStartDate} /></div>
              <TimePick h={startH} m={startM} onH={setStartH} onM={setStartM} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Fim</Label>
            <div className="flex gap-2">
              <div className="flex-1"><DatePick value={endDate} onChange={setEndDate} /></div>
              <TimePick h={endH} m={endM} onH={setEndH} onM={setEndM} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Convidados</Label>
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                    <span className="text-xs">{email}</span>
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="rounded hover:bg-muted-foreground/20 p-0.5"
                      aria-label={`Remover ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    Usuários do sistema
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Buscar por nome ou e-mail…"
                        className="h-8 pl-7 text-sm"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {usuarios.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-6">
                        Nenhum usuário encontrado
                      </div>
                    )}
                    {usuarios.map((u) => {
                      const selected = attendees.includes((u.email || "").toLowerCase());
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => u.email && addEmail(u.email)}
                          disabled={selected || !u.email}
                          className={cn(
                            "w-full text-left px-3 py-2 hover:bg-accent transition flex items-center justify-between gap-2",
                            selected && "opacity-50",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.nome_completo}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                          {selected && <span className="text-[10px] text-primary">✓ adicionado</span>}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    manualEmail.split(/[,;\s]+/).forEach(addEmail);
                    setManualEmail("");
                  }
                }}
                onBlur={() => {
                  if (manualEmail.trim()) {
                    manualEmail.split(/[,;\s]+/).forEach(addEmail);
                    setManualEmail("");
                  }
                }}
                placeholder="Adicionar e-mail externo…"
                className="flex-1 h-9 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={withMeet} onCheckedChange={(v) => setWithMeet(v === true)} />
            Adicionar Google Meet
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={create.isPending || !summary}>
              {create.isPending ? "Criando..." : "Criar evento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}