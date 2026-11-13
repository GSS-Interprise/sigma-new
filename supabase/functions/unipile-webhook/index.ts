// Webhook da Unipile (Fase 9.2). Confere a assinatura, grava o evento bruto em unipile_eventos (idempotente pelo id)
// e atualiza a situação da conta. Mensagem nova e nova conexão ficam só no log até a 9.5 (Conversas e funil).
// Precisa responder 2xx em até 5 s, senão a Unipile reenvia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { lerState, salvarConta, situacaoDe, webhookValido } from "../_shared/unipile.ts";

const ok = (b: unknown = { received: true }) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const bruto = await req.text();
  if (!(await webhookValido(bruto, req.headers.get("unipile-signature")))) return new Response("assinatura invalida", { status: 400 });
  const ev = JSON.parse(bruto);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { error: dup } = await admin.from("unipile_eventos").insert({
    id: ev.id, tipo: ev.type, account_id: ev.account_id ?? null, payload: ev,
  });
  if (dup?.code === "23505") return ok({ received: true, repetido: true });

  try {
    const tipo = String(ev.type || "");
    const agora = new Date().toISOString();
    if (tipo === "account.add" || tipo === "account.reconnect") {
      const st = await lerState(ev.payload?.state);
      const conta = ev.payload?.account;
      if (st && conta?.id) await salvarConta(admin, conta, st.usuarioId, null, st.provedor);
      else if (conta?.id) {
        // Reconexão feita pelo painel da Unipile (sem state): só atualiza se a conta já é conhecida.
        await admin.from("linkedin_contas").update({ status_unipile: conta.status, situacao: situacaoDe(conta.status), nome_perfil: conta.name ?? undefined,
          atualizado_em: agora, ultimo_evento_em: agora }).eq("gateway_account_id", conta.id);
      }
    } else if (tipo.startsWith("account.status.")) {
      const status = tipo.slice("account.status.".length);
      const motivo = status === "running" ? null
        : status === "disconnected" ? "LinkedIn pediu login de novo"
        : status === "errored" ? `erro na Unipile${ev.payload?.reason ? ` (${ev.payload.reason})` : ""}`
        : `parcial: ${ev.payload?.product ?? "um produto"} com problema`;
      // Conta caiu ou deu erro: o motor de envio (9.4) só usa conta "conectada", então já para sozinho.
      await admin.from("linkedin_contas").update({ status_unipile: status, situacao: situacaoDe(status), motivo,
        atualizado_em: agora, ultimo_evento_em: agora }).eq("gateway_account_id", ev.account_id);
    } else if (tipo === "account.remove") {
      await admin.from("linkedin_contas").update({ situacao: "desconectada", status_unipile: "removed", motivo: "removida na Unipile",
        atualizado_em: agora, ultimo_evento_em: agora }).eq("gateway_account_id", ev.account_id);
    } else if (tipo === "account.locked") {
      await admin.from("linkedin_contas").update({ situacao: "pausada", motivo: "Unipile sem assinatura ativa",
        atualizado_em: agora, ultimo_evento_em: agora }).eq("gateway_account_id", ev.account_id);
    }
    await admin.from("unipile_eventos").update({ processado: true }).eq("id", ev.id);
  } catch (e: any) {
    // O evento já está no log; responde 200 para a Unipile não reenviar em loop e reprocessa depois.
    console.error("[unipile-webhook]", ev.type, e.message);
  }
  return ok();
});
