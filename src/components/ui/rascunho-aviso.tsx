import { Button } from "@/components/ui/button";
import { History, X } from "lucide-react";

/** Faixa que oferece restaurar o que ficou digitado antes da sessão cair. */
export function RascunhoAviso({
  em, onRestaurar, onDescartar,
}: { em: number | null; onRestaurar: () => void; onDescartar: () => void }) {
  const quando = em ? new Date(em) : null;
  const agora = Date.now();
  const rotulo = !quando ? "" :
    agora - em! < 60_000 ? "agora há pouco" :
    agora - em! < 3_600_000 ? `há ${Math.round((agora - em!) / 60_000)} min` :
    quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center gap-2">
      <p className="flex items-start gap-1.5 flex-1">
        <History className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Você tem um preenchimento não salvo{rotulo ? ` de ${rotulo}` : ""}.</span>
      </p>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={onRestaurar}>Restaurar</Button>
        <Button size="sm" variant="ghost" onClick={onDescartar} className="gap-1">
          <X className="h-4 w-4" /> Descartar
        </Button>
      </div>
    </div>
  );
}

/** Indicador discreto de que o rascunho está sendo guardado sozinho. */
export function RascunhoStatus({ em }: { em: number | null }) {
  if (!em) return null;
  return (
    <span className="text-[11px] text-muted-foreground">
      Rascunho guardado {new Date(em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}
