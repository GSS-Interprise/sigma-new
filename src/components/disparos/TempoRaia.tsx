import { useEffect, useState } from "react";
import { formatDuracao, tempoNaRaia } from "@/hooks/useLeadCanais";

interface Props {
  entrouEm: string | null | undefined;
  saiuEm?: string | null;
  className?: string;
}

/**
 * Cronômetro ao vivo do tempo na raia.
 * - Se a raia estiver aberta (saiuEm null), atualiza a cada segundo.
 * - Se fechada, mostra a duração final congelada.
 * - Se não há entrada, mostra "—".
 */
export function TempoRaia({ entrouEm, saiuEm, className }: Props) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!entrouEm || saiuEm) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [entrouEm, saiuEm]);

  if (!entrouEm) {
    return <span className={className}>—</span>;
  }

  const segundos = tempoNaRaia(entrouEm, saiuEm ?? null);
  return <span className={className}>{formatDuracao(segundos)}</span>;
}