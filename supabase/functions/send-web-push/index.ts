// Envia Web Push pros dispositivos inscritos de cada usuário. Chamada pelos triggers
// (system_notifications / comunicacao_notificacoes) via pg_net.
// Body: { user_ids: string[], title, body, url?, tag? }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const PUB = Deno.env.get("VAPID_PUBLIC_KEY")!;
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUBJ = Deno.env.get("VAPID_SUBJECT") || "mailto:financeiro@gestaoservicosaude.com.br";
webpush.setVapidDetails(SUBJ, PUB, PRIV);

serve(async (req) => {
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { user_ids, title, body, url, tag } = await req.json().catch(() => ({}));
    if (!Array.isArray(user_ids) || user_ids.length === 0) return json({ ok: false, error: "user_ids obrigatorio" });

    const { data: subs } = await supabase.from("push_subscriptions").select("id, subscription").in("user_id", user_ids);
    const payload = JSON.stringify({ title: title || "Sigma - GSS", body: body || "", url: url || "/", tag });

    let sent = 0, gone = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) { await supabase.from("push_subscriptions").delete().eq("id", s.id); gone++; }
      }
    }
    return json({ ok: true, sent, gone, total: (subs ?? []).length });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) });
  }
});
