import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
// mesmo arquivo que a edge usa no envio: tela e envio contam o lote igual
import type { Lote } from "../../../supabase/functions/_shared/contaazul-lote.ts";

const VISIVEIS = 5;

/**
 * Médicos do fechamento que não estão no Conta Azul, com o motivo (Maria, 13/11: o Arthur ficou de fora e só
 * se soube quando ele cobrou). Lote completo vira uma linha verde; incompleto, a lista nominal.
 */
export function PendentesContaAzul({ lote, acao }: { lote: Lote; acao?: { rotulo: string; onClick: () => void } }) {
  const [todos, setTodos] = useState(false);
  if (lote.completo) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Lote completo: os {lote.confirmados} médicos do fechamento estão no Conta Azul.</span>
      </div>
    );
  }
  const n = lote.pendentes.length;
  const lista = todos ? lote.pendentes : lote.pendentes.slice(0, VISIVEIS);
  return (
    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="min-w-0 flex-1">
          <b>{n} médico(s) do fechamento não estão no Conta Azul.</b>{" "}
          <span className="text-muted-foreground tabular-nums">{lote.confirmados} de {lote.esperados} lançados.</span>
        </p>
        {acao && <Button size="sm" variant="outline" className="h-9 bg-background" onClick={acao.onClick}>{acao.rotulo}</Button>}
      </div>
      <ul className="mt-1.5 space-y-1 pl-6">
        {lista.map((p) => (
          <li key={p.pagamento_id} className="break-words">
            <b>{p.medico}</b>
            {p.unidade && <span className="text-muted-foreground"> · {p.unidade}</span>}
            <span className="block text-xs text-amber-800 dark:text-amber-300">{p.motivo}</span>
          </li>
        ))}
      </ul>
      {n > VISIVEIS && (
        <button type="button" className="mt-1 pl-6 text-xs font-medium text-amber-800 underline underline-offset-2 dark:text-amber-300"
          onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Ver os ${n}`}
        </button>
      )}
    </div>
  );
}
