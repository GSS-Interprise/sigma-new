import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Video, Plus } from "lucide-react";
import type { GCalEvent } from "@/hooks/useGoogleCalendar";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: Date | null;
  events: GCalEvent[];
  onNovo?: (d: Date) => void;
}

function eventTime(ev: GCalEvent) {
  const s = ev.start?.dateTime ?? ev.start?.date;
  if (!s) return "—";
  if (ev.start?.date && !ev.start.dateTime) return "Dia inteiro";
  return format(new Date(s), "HH:mm");
}

export function DiaGoogleDialog({ open, onOpenChange, date, events, onNovo }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {date ? format(date, "EEEE, d 'de' MMMM", { locale: ptBR }) : "Eventos"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{ev.summary || "(sem título)"}</p>
                    <p className="text-xs text-muted-foreground">{eventTime(ev)}</p>
                  </div>
                  {ev.htmlLink && (
                    <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {ev.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{ev.description}</p>
                )}
                {ev.hangoutLink && (
                  <a
                    href={ev.hangoutLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                  >
                    <Video className="h-3 w-3" /> Entrar no Meet
                  </a>
                )}
              </div>
            ))
          )}
        </div>
        {date && onNovo && (
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => onNovo(date)}>
              <Plus className="h-4 w-4 mr-1" /> Novo evento
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}