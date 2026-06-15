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
import { CalendarIcon } from "lucide-react";
import { useCreateGoogleEvent } from "@/hooks/useGoogleCalendar";
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
  const [attendees, setAttendees] = useState("");

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
    setAttendees("");
  }, [open, defaultDate]);

  const submit = async () => {
    const start = combine(startDate, startH, startM);
    const end = combine(endDate, endH, endM);
    await create.mutateAsync({
      summary,
      description,
      start,
      end,
      withMeet,
      attendees: attendees
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter((x) => /\S+@\S+\.\S+/.test(x)),
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
            <Label>Convidados (e-mails separados por vírgula)</Label>
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="exemplo@empresa.com, outro@empresa.com" />
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