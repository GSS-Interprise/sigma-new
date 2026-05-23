import { useRealtimeGlobalStatus } from '@/hooks/useRealtimeGlobalStatus';
import { cn } from '@/lib/utils';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Badge visual no header do SigZap mostrando saúde da conexão realtime.
 *
 * 🟢 Conectado — todos os canais estão SUBSCRIBED, mensagens chegam ao vivo
 * 🟡 Reconectando — algum canal caiu, retry automático em curso
 * 🔴 Desconectado — erro persistente, mensagens podem não chegar
 *
 * Resolve o achado #003: operadora não tinha como saber se realtime caiu.
 */
export function RealtimeStatusBadge() {
  const status = useRealtimeGlobalStatus();

  const config = {
    connected: {
      label: 'Conectado',
      title: 'Mensagens em tempo real funcionando',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700 dark:text-emerald-300',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
      borderClass: 'border-emerald-200 dark:border-emerald-800',
      icon: null,
    },
    reconnecting: {
      label: 'Reconectando',
      title: 'Tentando reconectar — pode haver atraso nas mensagens',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-700 dark:text-amber-300',
      bgClass: 'bg-amber-50 dark:bg-amber-950/40',
      borderClass: 'border-amber-200 dark:border-amber-800',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    error: {
      label: 'Desconectado',
      title: 'Conexão perdida — mensagens podem não chegar. Recarregue a página.',
      dotClass: 'bg-red-500',
      textClass: 'text-red-700 dark:text-red-300',
      bgClass: 'bg-red-50 dark:bg-red-950/40',
      borderClass: 'border-red-200 dark:border-red-800',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  }[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium',
        config.bgClass,
        config.textClass,
        config.borderClass
      )}
      title={config.title}
      role="status"
      aria-label={`Realtime: ${config.label}`}
    >
      {config.icon ?? (
        <span
          className={cn('h-2 w-2 rounded-full', config.dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </div>
  );
}
