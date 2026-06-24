import { supabase } from "@/integrations/supabase/client";

/**
 * Dispara o email de status do ticket apenas quando o novo status é
 * "aguardando_confirmacao" ou "concluido". Outros status não enviam email.
 * Falha silenciosa — nunca bloqueia o fluxo principal.
 */
export async function triggerTicketStatusEmail(
  ticketId: string,
  newStatus: string,
) {
  if (newStatus !== "aguardando_confirmacao" && newStatus !== "concluido") {
    return;
  }
  try {
    await supabase.functions.invoke("send-ticket-status-email", {
      body: { ticketId, event: newStatus },
    });
  } catch (e) {
    console.error("[ticket-status-email] falha:", e);
  }
}