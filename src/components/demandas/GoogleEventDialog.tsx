import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateGoogleEvent } from "@/hooks/useGoogleCalendar";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: Date | null;
}

function toLocalInput(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function GoogleEventDialog({ open, onOpenChange, defaultDate }: Props) {
  const create = useCreateGoogleEvent();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [withMeet, setWithMeet] = useState(false);
  const [attendees, setAttendees] = useState("");

  useEffect(() => {
    if (!open) return;
    const base = defaultDate ? new Date(defaultDate) : new Date();
    base.setHours(9, 0, 0, 0);
    const e = new Date(base);
    e.setHours(10, 0, 0, 0);
    setStart(toLocalInput(base));
    setEnd(toLocalInput(e));
    setSummary("");
    setDescription("");
    setWithMeet(false);
    setAttendees("");
  }, [open, defaultDate]);

  const submit = async () => {
    await create.mutateAsync({
      summary,
      description,
      start: new Date(start),
      end: new Date(end),
      withMeet,
      attendees: attendees
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter((x) => /\S+@\S+\.\S+/.test(x)),
    });
    onOpenChange(false);
  };

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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
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
            <Button onClick={submit} disabled={create.isPending || !summary || !start || !end}>
              {create.isPending ? "Criando..." : "Criar evento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}