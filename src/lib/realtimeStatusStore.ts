/**
 * Store global pra rastrear status de TODOS os channels realtime ativos.
 * Usado pelo RealtimeStatusBadge pra mostrar bolinha 🟢/🟡/🔴 no header
 * do SigZap (operadora sabe se realtime tá vivo).
 *
 * Pub/sub simples sem dependência externa.
 */

import type { RealtimeChannelStatus } from '@/hooks/useSupabaseRealtimeChannel';

export type GlobalRealtimeStatus = 'connected' | 'reconnecting' | 'error';

type Listener = () => void;

const channelStatuses = new Map<string, RealtimeChannelStatus>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function setChannelStatus(
  name: string,
  status: RealtimeChannelStatus
): void {
  channelStatuses.set(name, status);
  emit();
}

export function removeChannelStatus(name: string): void {
  if (channelStatuses.delete(name)) emit();
}

export function subscribeStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Agrega status individual de N channels em 1 status global:
 * - connected: TODOS estão SUBSCRIBED (ou registro vazio)
 * - reconnecting: algum está CONNECTING/CLOSED/TIMED_OUT (vai retentar)
 * - error: algum CHANNEL_ERROR persistente
 */
export function getGlobalStatus(): GlobalRealtimeStatus {
  if (channelStatuses.size === 0) return 'connected';

  const values = Array.from(channelStatuses.values());

  if (values.every((s) => s === 'SUBSCRIBED')) return 'connected';
  if (values.some((s) => s === 'CHANNEL_ERROR')) return 'error';
  return 'reconnecting';
}

/** Snapshot pra debug/UI detalhada (futuro). */
export function getAllChannelStatuses(): Map<string, RealtimeChannelStatus> {
  return new Map(channelStatuses);
}
