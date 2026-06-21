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
// Grace de pareamento (10/06): instância exibindo QR fica em "connecting" — igual
// a um flap. Restart no meio do scan mata o pairing (device meio-registrado →
// WhatsApp responde 401 LOGOUT e apaga a credencial; visto no prospec-raul-9003).
// Se o chip estava "close" (needs_qr logado) há pouco, esse "connecting" é a
// equipe escaneando QR, não flapping → não tocar.
const QR_GRACE_MIN = 30;

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
      .in("campo_nome", ["evolution_api_url", "evolution_api_key", "report_grupo_jid", "chip_qr_alerta_numeros"]);
    const url = cfg?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const key = cfg?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    const grupoJid = cfg?.find((c: any) => c.campo_nome === "report_grupo_jid")?.valor || "120363423136911817@g.us";
    // Destinos extras do alerta de QR (além do grupo): números diretos, ex: Bruna. Configurável.
    const qrNumerosRaw = cfg?.find((c: any) => c.campo_nome === "chip_qr_alerta_numeros")?.valor || "5547996968403";
    const qrDestinos = [grupoJid, ...qrNumerosRaw.split(",").map((s: string) => s.trim()).filter(Boolean)];
    if (!url || !key) return json({ error: "Evolution não configurada" }, 500);

    // só as categorias da máquina de prospecção; pessoal_restrito/suporte ficam de fora
    const { data: chips } = await supabase
      .from("chips")
      .select("id, instance_name, categoria_uso, connection_state, provedor")
      .eq("status", "ativo")
      .in("categoria_uso", ["prospeccao_ia", "manual", "inbound"])
      .not("instance_name", "is", null);

    // uazapi: provider gerencia reconexão sozinho — aqui a gente só SINCRONIZA o
    // connection_state (poll /instance/status), sem restart. Token isolado por chip.
    const UZ_URL = (Deno.env.get("UAZAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const uzTokens = new Map<string, string>();
    const uzChipIds = (chips || []).filter((c: any) => c.provedor === "uazapi").map((c: any) => c.id);
    if (uzChipIds.length && UZ_URL) {
      const { data: secs } = await supabase.from("chip_provider_secrets").select("chip_id, uazapi_token").in("chip_id", uzChipIds);
      for (const s of secs || []) uzTokens.set(s.chip_id as string, s.uazapi_token as string);
    }

    const cutoff = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000).toISOString();
    let restarted = 0;
    const summary = { total: chips?.length || 0, open: 0, connecting: 0, close: 0, restarted: 0, skipped_cooldown: 0, skipped_cap: 0, skipped_qr_grace: 0, needs_qr: 0, err: 0, uazapi: 0 };
    const details: any[] = [];
    const novosNeedsQr: string[] = []; // #3: chips que VIRARAM needs_qr nesta rodada (alerta)

    for (const c of chips || []) {
      // ── uazapi: só sincroniza estado, sem restart (reconexão é do provider) ──
      if ((c as any).provedor === "uazapi") {
        summary.uazapi++;
        const tok = uzTokens.get(c.id);
        if (!tok || !UZ_URL) continue;
        let uzState = "close";
        try {
          const r = await fetch(`${UZ_URL}/instance/status`, { headers: { token: tok } });
          const d = await r.json();
          const inst = d?.instance || d;
          uzState = inst?.status === "connected" ? "open" : inst?.status === "connecting" ? "connecting" : "close";
        } catch { uzState = "err"; }
        if (["open", "close", "connecting"].includes(uzState) && uzState !== c.connection_state) {
          await supabase.from("chips").update({ connection_state: uzState, updated_at: new Date().toISOString() }).eq("id", c.id);
        }
        if (uzState === "open") summary.open++;
        details.push({ instance: c.instance_name, provedor: "uazapi", state: uzState });
        continue;
      }

      const enc = encodeURIComponent(c.instance_name);
      let state = "unknown";
      try {
        const r = await fetch(`${url}/instance/connectionState/${enc}`, { headers: { apikey: key } });
        const d = await r.json();
        state = d?.instance?.state || "unknown";
      } catch {
        state = "err";
      }

      // Sincroniza chips.connection_state com o estado REAL (10/06): o disparador
      // decide por essa coluna, e os crons chip-healthcheck estão desligados —
      // sem isto ela só atualizava quando alguém abria a tela de chips (stale o
      // dia todo = campanha pulada com chip online, visto em Pediatria/Nefro).
      if (["open", "close", "connecting"].includes(state) && state !== c.connection_state) {
        await supabase.from("chips")
          .update({ connection_state: state, updated_at: new Date().toISOString() })
          .eq("id", c.id);
      }

      if (state === "open") { summary.open++; continue; }
      if (state === "err" || state === "unknown") { summary.err++; continue; }

      if (state === "close") {
        summary.close++; summary.needs_qr++;
        // #2: loga needs_qr só na TRANSIÇÃO (estava não-close → virou close). Antes logava
        // todo ciclo (5min) por chip morto = bloat (47k linhas). Agora ~1 por queda.
        const transicao = c.connection_state !== "close";
        if (transicao) {
          await supabase.from("chip_auto_reconnect_log").insert({ chip_id: c.id, instance_name: c.instance_name, state_before: c.connection_state || "unknown", action: "needs_qr" });
          novosNeedsQr.push(c.instance_name); // #3: alerta agregado no fim
        }
        details.push({ instance: c.instance_name, state, action: transicao ? "needs_qr" : "needs_qr_ja_logado" });
        continue;
      }

      if (state === "connecting") {
        summary.connecting++;
        if (restarted >= MAX_RESTARTS) { summary.skipped_cap++; details.push({ instance: c.instance_name, state, action: "skipped_cap" }); continue; }
        // Grace de pareamento: se o estado ANTERIOR era 'close' e agora está 'connecting',
        // é alguém escaneando o QR → não reinicia (restart mata o pairing). Usa o estado
        // anterior (c.connection_state), não mais o log (que agora só grava na transição).
        if (c.connection_state === "close") { summary.skipped_qr_grace++; details.push({ instance: c.instance_name, state, action: "skipped_qr_grace" }); continue; }
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

    // #3: alerta agregado — chips que CAÍRAM nesta rodada precisam de QR. 1 msg pro grupo.
    if (novosNeedsQr.length > 0) {
      const lista = novosNeedsQr.map((n) => `• ${n}`).join("\n");
      const texto = `⚠️ *Chip(s) precisam de QR* (caíram e precisam reconectar):\n${lista}\n\nReconecte em Disparos & Chips → escanear QR.`;
      // manda pro grupo E pros números diretos (ex: Bruna) — quem reconecta precisa ver
      for (const dest of qrDestinos) {
        try {
          await fetch(`${url}/message/sendText/${encodeURIComponent("Prospec-chapecó")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: key },
            body: JSON.stringify({ number: dest, text: texto }),
          });
        } catch (e) { console.error(`[chip-auto-reconnect] alerta QR falhou (${dest}):`, e); }
      }
    }

    console.log("[chip-auto-reconnect]", JSON.stringify({ ...summary, alertou_qr: novosNeedsQr.length }));
    return json({ ok: true, summary, details, novos_needs_qr: novosNeedsQr });
  } catch (e: any) {
    console.error("[chip-auto-reconnect] erro:", e?.message || e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
