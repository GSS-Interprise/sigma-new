// =====================================================================
// chip-apply-proxy-bulk
// Aplica ou remove proxy Bright Data em chips existentes.
//
// Input:
//   { chip_ids?: string[] }       // apply: aplica em chips passados,
//                                 // ou em todos ativos sem proxy_config
//   { disable: true, chip_ids?: [] }  // disable: remove proxy nos chips
//                                     // passados; sem chip_ids = todos
//                                     // chips ativos COM proxy_config
//
// Output: { ok, processed: [{chip_id, instance_name, applied|disabled, error?}] }
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Input {
  chip_ids?: string[];
  disable?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const input: Input = await req.json().catch(() => ({}));

    const { data: configs } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", [
        "evolution_api_url",
        "evolution_api_key",
        "proxy_provider",
        "proxy_host",
        "proxy_port",
        "proxy_zone",
        "proxy_customer_id",
        "proxy_country",
      ]);

    const cfg: Record<string, string> = {};
    for (const c of configs || []) cfg[c.campo_nome] = c.valor as string;

    const evoUrl = cfg.evolution_api_url?.replace(/\/+$/, "");
    const evoKey = cfg.evolution_api_key;
    const proxyPassword = Deno.env.get("BRIGHT_DATA_PROXY_PASSWORD");

    if (!evoUrl || !evoKey) return json({ ok: false, error: "evolution_not_configured" }, 500);
    const isDisable = input.disable === true;
    if (!isDisable && !proxyPassword) {
      return json({ ok: false, error: "proxy_password_secret_missing" }, 500);
    }
    if (!isDisable && cfg.proxy_provider !== "bright_data") {
      return json({ ok: false, error: "proxy_provider_not_bright_data", got: cfg.proxy_provider }, 500);
    }

    let q = supabase.from("chips").select("id, nome, instance_name").eq("status", "ativo");
    if (input.chip_ids && input.chip_ids.length > 0) {
      q = q.in("id", input.chip_ids);
    } else if (isDisable) {
      q = q.not("proxy_config", "is", null);
    } else {
      q = q.is("proxy_config", null);
    }
    const { data: chips, error: chipsErr } = await q;
    if (chipsErr) return json({ ok: false, error: "chips_query_failed", detail: chipsErr.message }, 500);

    const processed: Array<{
      chip_id: string;
      instance_name: string;
      applied: boolean;
      error?: string;
    }> = [];

    for (const chip of chips || []) {
      const instanceName = chip.instance_name || chip.nome;
      if (!instanceName) {
        processed.push({ chip_id: chip.id, instance_name: "?", applied: false, error: "no_instance_name" });
        continue;
      }

      const slug = String(chip.nome).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
      const sessionId = `${slug}${chip.id.slice(0, 8)}`;
      const proxyUsername = `brd-customer-${cfg.proxy_customer_id}-zone-${cfg.proxy_zone}-country-${cfg.proxy_country}-session-${sessionId}`;

      const body = isDisable
        ? {
            // Evolution exige host/port/protocol mesmo no disable; só enabled=false desliga
            enabled: false,
            host: cfg.proxy_host,
            port: cfg.proxy_port,
            protocol: "http",
            username: "",
            password: "",
          }
        : {
            enabled: true,
            host: cfg.proxy_host,
            port: cfg.proxy_port,
            protocol: "http",
            username: proxyUsername,
            password: proxyPassword,
          };

      try {
        const resp = await fetch(`${evoUrl}/proxy/set/${encodeURIComponent(instanceName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify(body),
        });

        if (resp.ok) {
          await supabase
            .from("chips")
            .update({
              proxy_config: isDisable
                ? null
                : {
                    provider: "bright_data",
                    host: cfg.proxy_host,
                    port: cfg.proxy_port,
                    session: sessionId,
                  },
              updated_at: new Date().toISOString(),
            })
            .eq("id", chip.id);
          processed.push({ chip_id: chip.id, instance_name: instanceName, applied: true });
          console.log(`[apply-proxy] ✅ ${isDisable ? "disabled" : "applied"} on ${instanceName}`);
        } else {
          const errText = await resp.text();
          processed.push({
            chip_id: chip.id,
            instance_name: instanceName,
            applied: false,
            error: `evolution_${resp.status}: ${errText.slice(0, 200)}`,
          });
          console.warn(`[apply-proxy] ❌ ${instanceName}: ${resp.status} ${errText.slice(0, 200)}`);
        }
      } catch (e) {
        processed.push({
          chip_id: chip.id,
          instance_name: instanceName,
          applied: false,
          error: `exception: ${(e as Error).message}`,
        });
      }
    }

    const okCount = processed.filter((p) => p.applied).length;
    const failCount = processed.length - okCount;

    return json({
      ok: true,
      action: isDisable ? "disable" : "apply",
      total: processed.length,
      applied: okCount,
      failed: failCount,
      processed,
    });
  } catch (e) {
    console.error("[apply-proxy] uncaught:", e);
    return json({ ok: false, error: "uncaught", detail: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
