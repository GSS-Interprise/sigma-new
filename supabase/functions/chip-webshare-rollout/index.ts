import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evolutionProxyPayload,
  getOrAllocateWebshareProxy,
  listHealthyWebshareProxies,
  publicProxyConfig,
} from "../_shared/webshare-proxy.ts";

interface RolloutInput {
  chip_ids?: string[];
  dry_run?: boolean;
  restart_closed?: boolean;
  verify_wait_ms?: number;
}

interface ConfigRow {
  campo_nome: string;
  valor: string;
}

interface ReservedRow {
  chip_id: string;
  provider_proxy_id: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({}, 200);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // O gateway verifica a assinatura. Aqui restringimos ainda mais pelo claim,
  // pois esta operação reinicia instâncias e não pode ser chamada por usuário comum.
  if (jwtRole(req.headers.get("authorization")) !== "service_role") {
    return response({ ok: false, error: "service_role_required" }, 403);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  try {
    const input = (await req.json().catch(() => ({}))) as RolloutInput;
    const dryRun = input.dry_run !== false;
    const waitMs = Math.min(Math.max(input.verify_wait_ms ?? 15_000, 5_000), 45_000);
    const webshareApiKey = Deno.env.get("WEBSHARE_API_KEY");
    if (!webshareApiKey) return response({ ok: false, error: "webshare_secret_missing" }, 500);

    const { data: configRows, error: configError } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    if (configError) throw configError;
    const config = Object.fromEntries((configRows || []).map((row: ConfigRow) => [row.campo_nome, row.valor]));
    const evolutionUrl = String(config.evolution_api_url || "").replace(/\/+$/, "");
    const evolutionKey = config.evolution_api_key;
    if (!evolutionUrl || !evolutionKey) return response({ ok: false, error: "evolution_not_configured" }, 500);

    let query = supabase
      .from("chips")
      .select("id, nome, instance_name, categoria_uso, connection_state, proxy_config")
      .eq("status", "ativo")
      .eq("provedor", "evolution")
      .not("instance_name", "is", null)
      .order("created_at", { ascending: true });
    if (input.chip_ids?.length) query = query.in("id", input.chip_ids);
    const { data: chips, error: chipsError } = await query;
    if (chipsError) throw chipsError;

    const planningPool = dryRun ? await listHealthyWebshareProxies(webshareApiKey) : [];
    const { data: reservedRows } = dryRun
      ? await supabase.from("chip_proxy_assignments").select("chip_id, provider_proxy_id").eq("provider", "webshare")
      : { data: [] };
    const plannedByChip = new Map((reservedRows || []).map((row: ReservedRow) => [row.chip_id, String(row.provider_proxy_id)]));
    const plannedUsed = new Set((reservedRows || []).map((row: ReservedRow) => String(row.provider_proxy_id)));

    const results: Record<string, unknown>[] = [];
    for (const chip of chips || []) {
      const instance = chip.instance_name || chip.nome;
      const encoded = encodeURIComponent(instance);
      try {
        const stateBefore = await connectionState(evolutionUrl, evolutionKey, encoded);
        const preferredProxyId = chip.proxy_config?.provider === "webshare"
          ? chip.proxy_config?.proxy_id
          : null;

        if (dryRun) {
          const existingId = plannedByChip.get(chip.id);
          const preferred = preferredProxyId && !plannedUsed.has(String(preferredProxyId))
            ? planningPool.find((item) => String(item.id) === String(preferredProxyId))
            : null;
          const planned = existingId
            ? planningPool.find((item) => String(item.id) === existingId)
            : preferred || planningPool.find((item) => !plannedUsed.has(String(item.id)));
          if (!planned) throw new Error("webshare_proxy_pool_exhausted");
          plannedUsed.add(String(planned.id));
          results.push({
            chip_id: chip.id,
            instance,
            state_before: stateBefore,
            proxy_id: String(planned.id),
            action: "planned",
          });
          continue;
        }

        const proxy = await getOrAllocateWebshareProxy(
          supabase,
          chip.id,
          webshareApiKey,
          preferredProxyId,
        );

        const oldProxyResponse = await fetch(`${evolutionUrl}/proxy/find/${encoded}`, {
          headers: { apikey: evolutionKey },
        });
        const oldProxy = oldProxyResponse.ok ? await oldProxyResponse.json() : null;
        const setResponse = await fetch(`${evolutionUrl}/proxy/set/${encoded}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionKey },
          body: JSON.stringify(evolutionProxyPayload(proxy)),
        });
        if (!setResponse.ok) throw new Error(`evolution_proxy_set_${setResponse.status}`);

        const shouldRestart = stateBefore !== "close" || input.restart_closed === true;
        if (shouldRestart) await restart(evolutionUrl, evolutionKey, encoded);

        let stateAfter = stateBefore;
        let rolledBack = false;
        if (stateBefore === "open") {
          await sleep(waitMs);
          stateAfter = await connectionState(evolutionUrl, evolutionKey, encoded);
          if (stateAfter !== "open" && oldProxy) {
            // Um chip que estava operacional nunca pode ser sacrificado pelo rollout.
            await fetch(`${evolutionUrl}/proxy/set/${encoded}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evolutionKey },
              body: JSON.stringify({
                enabled: oldProxy.enabled,
                host: oldProxy.host,
                port: String(oldProxy.port),
                protocol: oldProxy.protocol,
                username: oldProxy.username,
                password: oldProxy.password,
              }),
            });
            await restart(evolutionUrl, evolutionKey, encoded);
            rolledBack = true;
            if (chip.proxy_config?.provider !== "webshare") {
              await supabase.from("chip_proxy_assignments").delete().eq("chip_id", chip.id);
            }
          }
        }

        if (!rolledBack) {
          await supabase.from("chips").update({
            proxy_config: publicProxyConfig(proxy),
            updated_at: new Date().toISOString(),
          }).eq("id", chip.id);
          await supabase.from("chip_proxy_assignments").update({
            last_verified_at: new Date().toISOString(),
            status: "active",
          }).eq("chip_id", chip.id);
        }

        results.push({
          chip_id: chip.id,
          instance,
          state_before: stateBefore,
          state_after: stateAfter,
          proxy_id: proxy.providerProxyId,
          action: rolledBack ? "rolled_back" : "applied",
          restarted: shouldRestart,
        });
      } catch (error) {
        results.push({
          chip_id: chip.id,
          instance,
          action: "failed",
          error: String((error as Error).message || error).slice(0, 160),
        });
      }
    }

    return response({
      ok: results.every((result) => result.action !== "failed" && result.action !== "rolled_back"),
      dry_run: dryRun,
      total: results.length,
      planned: results.filter((result) => result.action === "planned").length,
      applied: results.filter((result) => result.action === "applied").length,
      rolled_back: results.filter((result) => result.action === "rolled_back").length,
      failed: results.filter((result) => result.action === "failed").length,
      results,
    });
  } catch (error) {
    return response({ ok: false, error: String((error as Error).message || error) }, 500);
  }
});

async function connectionState(url: string, key: string, instance: string): Promise<string> {
  const response = await fetch(`${url}/instance/connectionState/${instance}`, {
    headers: { apikey: key },
  });
  if (!response.ok) throw new Error(`connection_state_${response.status}`);
  const body = await response.json();
  return body?.instance?.state || "unknown";
}

async function restart(url: string, key: string, instance: string) {
  const response = await fetch(`${url}/instance/restart/${instance}`, {
    method: "POST",
    headers: { apikey: key },
  });
  if (!response.ok) throw new Error(`restart_${response.status}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function jwtRole(authorization: string | null): string | null {
  try {
    const token = authorization?.replace(/^Bearer\s+/i, "") || "";
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded?.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}
