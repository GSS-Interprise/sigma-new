// Fica de olho na aprovação dos templates de NF na Meta e AVISA quando sair o veredito.
// Sem isto, alguém teria que abrir o painel do provedor de hora em hora.
//
// Chamada pelo pg_cron a cada 15 min com o header x-internal-sync-key (mesma chave
// interna já usada pelo sync de templates). Só avisa na virada de status — não repete.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key",
};
const PREFIXO = "gss_nf_";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const chaveInterna = Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "";
    const auth = req.headers.get("Authorization") || "";
    const temServiceRole = (() => {
      const parte = auth.replace(/^Bearer\s+/i, "").split(".")[1];
      if (!parte) return false;
      try { return JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role"; } catch { return false; }
    })();
    if (!temServiceRole && (!chaveInterna || req.headers.get("x-internal-sync-key") !== chaveInterna)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const { data: cfgRows } = await svc.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["financeiro_whatsapp_sender_id", "financeiro_canal_id"]);
    const cfg = (n: string) => cfgRows?.find((c: any) => c.campo_nome === n)?.valor || "";
    const { data: sender } = await svc.from("whatsapp_official_senders")
      .select("chakra_waba_id, phone_e164").eq("id", cfg("financeiro_whatsapp_sender_id")).maybeSingle();
    if (!sender?.chakra_waba_id) return json({ ok: false, error: "remetente_do_financeiro_nao_configurado" }, 409);

    const resposta = unwrapChakraPayload(
      await chakraApi(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates?limit=100`),
    );
    const remotos: any[] = Array.isArray(resposta.data) ? resposta.data : Array.isArray(resposta) ? resposta : [];

    const { data: nossos } = await svc.from("whatsapp_official_templates")
      .select("id, friendly_name, approval_status").like("friendly_name", `${PREFIXO}%`);

    const mudancas: any[] = [];
    for (const linha of nossos ?? []) {
      const remoto = remotos.find((r) => String(r.name || r.friendly_name) === linha.friendly_name);
      if (!remoto) continue;
      const status = String(remoto.status || "").toLowerCase();
      if (!status || status === linha.approval_status) continue;
      await svc.from("whatsapp_official_templates").update({
        approval_status: status,
        rejection_reason: remoto.rejected_reason || remoto.reason || null,
        updated_at: new Date().toISOString(),
      }).eq("id", linha.id);
      mudancas.push({ template: linha.friendly_name, de: linha.approval_status, para: status, motivo: remoto.rejected_reason || null });
    }

    // avisa a equipe só na virada — quem acompanha não precisa abrir o painel do provedor
    const canalId = cfg("financeiro_canal_id");
    if (mudancas.length && canalId) {
      const { data: parts } = await svc.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
      const autor = parts?.[0]?.user_id;
      if (autor) {
        const linhas = mudancas.map((m) =>
          m.para === "approved"
            ? `✅ *${m.template}* aprovado — o envio de NF por WhatsApp já pode ser usado.`
            : m.para === "rejected"
            ? `⛔ *${m.template}* recusado${m.motivo ? ` (${m.motivo})` : ""} — precisa ajustar o texto e submeter de novo.`
            : `ℹ️ *${m.template}*: ${m.de} → ${m.para}.`
        ).join("\n");
        const { data: m } = await svc.from("comunicacao_mensagens").insert({
          canal_id: canalId, user_id: autor, user_nome: "Notas fiscais",
          mensagem: `*Templates do WhatsApp (${sender.phone_e164})*\n${linhas}`,
        }).select("id").single();
        if (m && parts?.length) {
          await svc.from("comunicacao_notificacoes").insert(
            parts.filter((p: any) => p.user_id !== autor).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id })),
          );
        }
      }
    }

    return json({ ok: true, verificados: (nossos ?? []).length, mudancas });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
