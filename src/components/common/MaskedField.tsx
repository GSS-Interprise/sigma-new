import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Valor real (não mascarado) */
  value: string | null | undefined;
  /** Função que retorna versão mascarada do valor */
  mask: (v: string | null | undefined) => string;
  /** Classes Tailwind extras */
  className?: string;
  /** Rótulo acessível pro botão revelar (ex: "Mostrar CPF") */
  revealLabel?: string;
  /** Se true, mostra ícone de olho. Default true. */
  showToggle?: boolean;
  /** Tamanho do ícone em px. Default 14. */
  iconSize?: number;
}

/**
 * Renderiza valor mascarado por padrão (LGPD). Botão olho permite revelar
 * sob clique explícito da operadora — ação consciente, não acidental.
 *
 * Uso:
 *   <MaskedField value={medico.cpf} mask={maskCPF} revealLabel="Mostrar CPF" />
 */
export function MaskedField({
  value,
  mask,
  className,
  revealLabel = 'Mostrar dado',
  showToggle = true,
  iconSize = 14,
}: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!value) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }

  const displayed = revealed ? value : mask(value);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn(!revealed && 'font-mono tracking-tight')}>
        {displayed}
      </span>
      {showToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed((v) => !v);
          }}
          className="opacity-50 hover:opacity-100 transition-opacity inline-flex"
          title={revealed ? 'Ocultar' : revealLabel}
          aria-label={revealed ? 'Ocultar' : revealLabel}
        >
          {revealed ? (
            <EyeOff size={iconSize} />
          ) : (
            <Eye size={iconSize} />
          )}
        </button>
      )}
    </span>
  );
}
