import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// chip-auto-reconnect (06/06/2026)
// Mitigação documentada do flapping do Baileys via proxy residencial:
// o defaultQueryTimeoutMs (60s, hardcoded no Evolution) dispara cedo demais
// quando o proxy está lento → instância fica presa em "connecting". Aqui a
// gente detecta isso (connectionState REAL, não o cache do fetchInstances) e
// reinicia só quem está "connecting", com guarda anti-loop.
// Regras de segurança:
//  - só reinicia state == "connecting" (open = ok; close = precisa QR, só loga)
//  - cooldown por chip (não reinicia o mesmo chip 2x dentro de COOLDOWN_MIN)
//  - cap por rodada (não reinicia tudo de uma vez pra não sobrecarregar o container)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_MIN = 10;   // não reinicia o mesmo chip mais de 1x a cada 10 min
const MAX_RESTARTS = 5;    // máx de restarts por execução (anti-sobrecarga)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: cfg } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const url = cfg?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const key = cfg?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    if (!url || !key) return json({ error: "Evolution não configurada" }, 500);

    // só as categorias da máquina de prospecção; pessoal_restrito/suporte ficam de fora
    const { data: chips } = await supabase
      .from("chips")
      .select("id, instance_name, categoria_uso")
      .eq("status", "ativo")
      .in("categoria_uso", ["prospeccao_ia", "manual", "inbound"])
      .not("instance_name", "is", null);

    const cutoff = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString();
    let restarted = 0;
    const summary = { total: chips?.length || 0, open: 0, connecting: 0, close: 0, restarted: 0, skipped_cooldown: 0, skipped_cap: 0, needs_qr: 0, err: 0 };
    const details: any[] = [];

    for (const c of chips || []) {
      const enc = encodeURIComponent(c.instance_name);
      let state = "unknown";
      try {
        const r = await fetch(`${url}/instance/connectionState/${enc}`, { headers: { apikey: key } });
        const d = await r.json();
        state = d?.instance?.state || "unknown";
      } catch {
        state = "err";
      }

      if (state === "open") { summary.open++; continue; }
      if (state === "err" || state === "unknown") { summary.err++; continue; }

      if (state === "close") {
        summary.close++; summary.needs_qr++;
        await supabase.from("chip_auto_reconnect_log").insert({ chip_id: c.id, instance_name: c.instance_name, state_before: state, action: "needs_qr" });
        details.push({ instance: c.instance_name, state, action: "needs_qr" });
        continue;
      }

      if (state === "connecting") {
        summary.connecting++;
        if (restarted >= MAX_RESTARTS) { summary.skipped_cap++; details.push({ instance: c.instance_name, state, action: "skipped_cap" }); continue; }
        const { data: recent } = await supabase
          .from("chip_auto_reconnect_log")
          .select("id")
          .eq("chip_id", c.id)
          .eq("action", "restarted")
          .gte("created_at", cutoff)
          .limit(1);
        if (recent && recent.length) { summary.skipped_cooldown++; details.push({ instance: c.instance_name, state, action: "skipped_cooldown" }); continue; }

        try {
          await fetch(`${url}/instance/restart/${enc}`, { method: "POST", headers: { apikey: key } });
        } catch { /* ignora; loga abaixo de qualquer forma */ }
        restarted++; summary.restarted++;
        await supabase.from("chip_auto_reconnect_log").insert({ chip_id: c.id, instance_name: c.instance_name, state_before: state, action: "restarted" });
        details.push({ instance: c.instance_name, state, action: "restarted" });
      }
    }

    console.log("[chip-auto-reconnect]", JSON.stringify(summary));
    return json({ ok: true, summary, details });
  } catch (e: any) {
    console.error("[chip-auto-reconnect] erro:", e?.message || e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
