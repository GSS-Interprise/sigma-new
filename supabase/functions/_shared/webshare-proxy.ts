export interface WebshareProxy {
  id: string;
  proxy_address: string;
  port: number;
  username: string;
  password: string;
  country_code: string;
  valid: boolean;
}

export interface AssignedProxy {
  provider: "webshare";
  providerProxyId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  countryCode: string;
}

const WEBSHARE_LIST_URL =
  "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100";

export async function listHealthyWebshareProxies(apiKey: string): Promise<WebshareProxy[]> {
  const response = await fetch(WEBSHARE_LIST_URL, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`webshare_list_${response.status}`);
  }

  const body = await response.json();
  const proxies = (body?.results || []) as WebshareProxy[];
  // O contrato é ISP dedicado BR. Falhar fechado evita que um erro de plano
  // coloque silenciosamente um chip brasileiro atrás de IP estrangeiro/compartilhado.
  const healthy = proxies.filter((proxy) => proxy.valid && proxy.country_code === "BR");
  if (healthy.length === 0) throw new Error("webshare_no_healthy_br_proxy");
  return healthy;
}

export async function getOrAllocateWebshareProxy(
  supabase: SupabaseClient,
  chipId: string,
  apiKey: string,
  preferredProxyId?: string | null,
): Promise<AssignedProxy> {
  const proxies = await listHealthyWebshareProxies(apiKey);
  const byId = new Map(proxies.map((proxy) => [String(proxy.id), proxy]));

  const { data: existing, error: existingError } = await supabase
    .from("chip_proxy_assignments")
    .select("provider_proxy_id")
    .eq("chip_id", chipId)
    .eq("provider", "webshare")
    .maybeSingle();
  if (existingError) throw new Error(`proxy_assignment_read:${existingError.message}`);

  if (existing) {
    const proxy = byId.get(String(existing.provider_proxy_id));
    // IP sticky é uma garantia anti-ban: nunca rotacionar silenciosamente quando
    // uma reserva some do plano. O operador precisa decidir a substituição.
    if (!proxy) throw new Error("assigned_webshare_proxy_unavailable");
    return resolved(proxy);
  }

  const candidates = preferredProxyId
    ? [byId.get(String(preferredProxyId)), ...proxies.filter((p) => String(p.id) !== String(preferredProxyId))]
        .filter(Boolean) as WebshareProxy[]
    : proxies;

  for (const proxy of candidates) {
    const { error } = await supabase.from("chip_proxy_assignments").insert({
      chip_id: chipId,
      provider: "webshare",
      provider_proxy_id: String(proxy.id),
      proxy_host: proxy.proxy_address,
      proxy_port: proxy.port,
      country_code: proxy.country_code,
      status: "active",
      last_verified_at: new Date().toISOString(),
    });
    if (!error) return resolved(proxy);
    if (error.code !== "23505") throw new Error(`proxy_assignment_insert:${error.message}`);
  }

  throw new Error("webshare_proxy_pool_exhausted");
}

export function evolutionProxyPayload(proxy: AssignedProxy) {
  return {
    enabled: true,
    host: proxy.host,
    port: String(proxy.port),
    protocol: "http",
    username: proxy.username,
    password: proxy.password,
  };
}

export function publicProxyConfig(proxy: AssignedProxy) {
  return {
    provider: proxy.provider,
    proxy_id: proxy.providerProxyId,
    host: proxy.host,
    port: String(proxy.port),
    country: proxy.countryCode,
    dedicated: true,
  };
}

function resolved(proxy: WebshareProxy): AssignedProxy {
  return {
    provider: "webshare",
    providerProxyId: String(proxy.id),
    host: proxy.proxy_address,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    countryCode: proxy.country_code,
  };
}
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
