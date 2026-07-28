import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const recoveryKey = Deno.env.get("AI_RECOVERY_INTERNAL_KEY") || "";
  const hasInternalKey =
    recoveryKey.length >= 32 &&
    req.headers.get("x-recovery-key") === recoveryKey;
  if (req.headers.get("Authorization") !== `Bearer ${serviceRole}` && !hasInternalKey) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const { data: stuck, error } = await supabase
    .from("campanha_ia_processed_messages")
    .select("msg_id, claimed_at")
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("claimed_at", { ascending: true })
    .limit(10);
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const item of stuck || []) {
    if (Date.now() - new Date(item.claimed_at).getTime() > 30 * 60_000) {
      await supabase
        .from("campanha_ia_processed_messages")
        .update({
          status: "failed",
          result: { error: "recovery_window_expired" },
          updated_at: new Date().toISOString(),
        })
        .eq("msg_id", item.msg_id)
        .eq("status", "processing");
      results.push({ msg_id: item.msg_id, ok: false, reason: "recovery_window_expired" });
      continue;
    }

    const { data: message } = await supabase
      .from("sigzap_messages")
      .select(`
        message_text, message_type, media_url,
        conversation:sigzap_conversations!inner(
          contact:sigzap_contacts!inner(contact_phone),
          instance:sigzap_instances!inner(name)
        )
      `)
      .eq("wa_message_id", item.msg_id)
      .maybeSingle();

    const conversation = Array.isArray(message?.conversation)
      ? message?.conversation[0]
      : message?.conversation;
    const contact = Array.isArray(conversation?.contact)
      ? conversation?.contact[0]
      : conversation?.contact;
    const instance = Array.isArray(conversation?.instance)
      ? conversation?.instance[0]
      : conversation?.instance;

    if (!message || !contact?.contact_phone || !instance?.name) {
      await supabase
        .from("campanha_ia_processed_messages")
        .update({
          status: "failed",
          result: { error: "recovery_source_message_not_found" },
          updated_at: new Date().toISOString(),
        })
        .eq("msg_id", item.msg_id)
        .eq("status", "processing");
      results.push({ msg_id: item.msg_id, ok: false, reason: "source_not_found" });
      continue;
    }

    // Marca como failed para que o claim idempotente permita uma única retomada.
    await supabase
      .from("campanha_ia_processed_messages")
      .update({
        status: "failed",
        result: { recovery: "automatic_retry_after_timeout" },
        updated_at: new Date().toISOString(),
      })
      .eq("msg_id", item.msg_id)
      .eq("status", "processing");

    const { data, error: invokeError } = await supabase.functions.invoke("campanha-ia-responder", {
      body: {
        phone: contact.contact_phone,
        message_text: message.message_text,
        message_type: message.message_type || "text",
        media_url: message.media_url,
        instance_name: instance.name,
        msg_id: item.msg_id,
      },
    });
    results.push({
      msg_id: item.msg_id,
      ok: !invokeError && data?.ok !== false,
      reason: data?.reason || data?.error || invokeError?.message || null,
    });
  }

  return json({ ok: true, recovered: results.length, results });
});
