import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function startOfTodaySaoPaulo(): Date {
  // America/Sao_Paulo is UTC-3 year-round (no DST since 2019).
  const nowUtcMs = Date.now();
  const spMs = nowUtcMs - 3 * 60 * 60 * 1000;
  const sp = new Date(spMs);
  const y = sp.getUTCFullYear();
  const m = sp.getUTCMonth();
  const d = sp.getUTCDate();
  // Midnight in SP = 03:00 UTC same date
  return new Date(Date.UTC(y, m, d, 3, 0, 0));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json(405, { error: "Method not allowed. Use GET." });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized. Provide a Bearer token." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("api_tokens")
    .select("id, nome, expires_at, ativo")
    .eq("token", token)
    .eq("ativo", true)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return json(401, { error: "Unauthorized. Invalid token." });
  }
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return json(401, { error: "Unauthorized. Token expired." });
  }

  // Update last_used_at (best-effort)
  supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id).then(() => {});

  // Parse query params
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");
  const shortParam = (url.searchParams.get("short") ?? url.searchParams.get("shot") ?? "false").toLowerCase();
  const isShort = shortParam === "true" || shortParam === "1";

  let since: Date;
  let until: Date;
  try {
    since = sinceParam ? new Date(sinceParam) : startOfTodaySaoPaulo();
    until = untilParam ? new Date(untilParam) : new Date();
    if (isNaN(since.getTime()) || isNaN(until.getTime())) throw new Error("invalid date");
  } catch {
    return json(400, { error: "Invalid 'since' or 'until' — must be ISO date." });
  }

  try {
    // 1) Snapshot atual dos chips
    const { data: chips, error: chipsErr } = await supabase
      .from("vw_chip_saude")
      .select("*");
    if (chipsErr) throw chipsErr;

    const list = (chips ?? []) as Array<Record<string, any>>;

    // 5) Nome/numero extras (view não traz numero)
    const { data: chipExtras } = await supabase
      .from("chips")
      .select("id, numero");
    const numeroMap = new Map<string, string | null>();
    for (const r of chipExtras ?? []) numeroMap.set(r.id as string, (r as any).numero ?? null);

    const conectados = list.filter((c) => c.connection_state === "open").length;
    const conectando = list.filter((c) => c.connection_state === "connecting").length;
    const caidos = list.filter((c) => c.connection_state === "close").length;
    const usaveis = list.filter((c) => c.usavel).length;

    // Short mode: apenas status das instâncias
    if (isShort) {
      const instanciasShort = list.map((c) => ({
        id: c.id,
        nome: c.nome,
        numero: numeroMap.get(c.id) ?? null,
        provedor: c.provedor,
        categoria_uso: c.categoria_uso,
        connection_state: c.connection_state,
        usavel: c.usavel,
        pode_disparar: c.pode_disparar,
        estado_desde: c.estado_desde,
        ultima_queda: c.ultima_queda,
        health: c.health,
      }));
      return json(200, {
        generated_at: new Date().toISOString(),
        resumo: {
          total: list.length,
          conectados,
          conectando,
          caidos,
          usaveis,
        },
        instancias: instanciasShort,
      });
    }

    // 2) Disparos na janela
    const { data: sendLogs, error: logErr } = await supabase
      .from("chip_send_log")
      .select("chip_id, status")
      .gte("sent_at", since.toISOString())
      .lte("sent_at", until.toISOString());
    if (logErr) throw logErr;

    const disparosPorChip = new Map<string, { enviados: number; falhas: number }>();
    let totalDisparos = 0;
    let totalSucesso = 0;
    let totalFalha = 0;
    for (const row of sendLogs ?? []) {
      totalDisparos++;
      const isSuccess = row.status === "success" || row.status === "sent";
      if (isSuccess) totalSucesso++;
      else totalFalha++;
      if (!row.chip_id) continue;
      const cur = disparosPorChip.get(row.chip_id) ?? { enviados: 0, falhas: 0 };
      if (isSuccess) cur.enviados++;
      else cur.falhas++;
      disparosPorChip.set(row.chip_id, cur);
    }

    // 3) Reconectados na janela
    const { count: reconectadosCount, error: recErr } = await supabase
      .from("chip_auto_reconnect_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString())
      .lte("created_at", until.toISOString());
    if (recErr) throw recErr;

    // 4) Quedas na janela (chips cuja ultima_queda cai dentro do intervalo)
    let quedasNoPeriodo = 0;
    for (const c of list) {
      if (!c.ultima_queda) continue;
      const t = new Date(c.ultima_queda).getTime();
      if (t >= since.getTime() && t <= until.getTime()) quedasNoPeriodo++;
    }

    const instancias = list.map((c) => {
      const d = disparosPorChip.get(c.id) ?? { enviados: 0, falhas: 0 };
      return {
        id: c.id,
        nome: c.nome,
        numero: numeroMap.get(c.id) ?? null,
        provedor: c.provedor,
        categoria_uso: c.categoria_uso,
        fase: c.fase,
        connection_state: c.connection_state,
        usavel: c.usavel,
        pode_disparar: c.pode_disparar,
        estado_desde: c.estado_desde,
        ultima_queda: c.ultima_queda,
        quedas_24h: c.quedas_24h,
        health: c.health,
        disparos_periodo: d.enviados,
        falhas_periodo: d.falhas,
      };
    });

    return json(200, {
      generated_at: new Date().toISOString(),
      window: { since: since.toISOString(), until: until.toISOString() },
      resumo: {
        total: list.length,
        conectados,
        conectando,
        caidos,
        usaveis,
        quedas_no_periodo: quedasNoPeriodo,
        reconectados_no_periodo: reconectadosCount ?? 0,
      },
      disparos: {
        total: totalDisparos,
        sucesso: totalSucesso,
        falha: totalFalha,
        por_chip: instancias
          .filter((i) => i.disparos_periodo || i.falhas_periodo)
          .map((i) => ({
            chip_id: i.id,
            nome: i.nome,
            enviados: i.disparos_periodo,
            falhas: i.falhas_periodo,
          })),
      },
      instancias,
    });
  } catch (e: any) {
    console.error("chips-status-report error", e);
    return json(500, { error: e?.message ?? "Internal error" });
  }
});