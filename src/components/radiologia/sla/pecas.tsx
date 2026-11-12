// Peças visuais compartilhadas do SLA de laudos.
import { cn } from "@/lib/utils";
import { ORIGEM, type Exame, duracao } from "./useSla";

export function OrigemSelo({ origem }: { origem: Exame["origem"] }) {
  const o = ORIGEM[origem];
  return <span className={cn("inline-flex min-w-[76px] justify-center rounded px-2 py-0.5 text-xs font-semibold", o.fundo, o.cor)}>{o.curto}</span>;
}

export function textoPrazo(faltaMin: number) {
  return faltaMin <= 0 ? `vencido há ${duracao(-faltaMin)}` : `vence em ${duracao(faltaMin)}`;
}

