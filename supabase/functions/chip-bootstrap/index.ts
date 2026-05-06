// =====================================================================
// chip-bootstrap
// Cria uma instância Evolution NOVA com config completa anti-ban,
// injeta proxy Bright Data sticky por chip, configura webhook, persiste
// no banco (chips + chip_state em fase='setup') e cria persona aleatória.
//
// Input: {
//   nome: string,                  // nome da instância (label)
//   numero?: string,               // opcional, e164 sem +
//   tipo_instancia?: 'disparos'|'trafego_pago',
//   skip_proxy?: boolean,          // se true, não aplica proxy (NÃO recomendado)
//   skip_persona?: boolean,        // se true, não cria persona (NÃO recomendado)
// }
// Output: { ok, chip_id, instance_name, qrcode_base64, ... }
//
// Após resposta, frontend mostra QR e usuário escaneia no celular.
// Quando connection_state vira 'open', cron move fase 'setup' → 'aquecimento'.
//
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §3.2 + §5
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BootstrapInput {
  nome: string;
  numero?: string;
  tipo_instancia?: "disparos" | "trafego_pago";
  skip_proxy?: boolean;
  skip_persona?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const input: BootstrapInput = await req.json();

    if (!input.nome || input.nome.trim().length === 0) {
      return json({ ok: false, error: "nome obrigatório" }, 400);
    }

    // ── 1. Carrega configs (Evolution + Proxy + Webhook) ──
    const { data: configs } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", [
        "evolution_api_url",
        "evolution_api_key",
        "evolution_webhook_global",
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
    if (!evoUrl || !evoKey) {
      return json({ ok: false, error: "Evolution API não configurada (config_lista_items)" }, 500);
    }

    const proxyPassword = Deno.env.get("BRIGHT_DATA_PROXY_PASSWORD");
    const wantProxy = !input.skip_proxy && cfg.proxy_provider === "bright_data" && !!proxyPassword;

    // ── 2. Sanitiza nome da instância (Evolution não aceita certos chars) ──
    const baseName = input.nome.trim().replace(/\s+/g, " ").slice(0, 50);
    const slug = baseName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    const instanceName = baseName; // mantém nome legível, Evolution suporta acentos

    // ── 3. Cria instância no Evolution ──
    // Config completa anti-ban: rejectCall=false, alwaysOnline=false, etc.
    const createPayload: Record<string, unknown> = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      rejectCall: false,
      msgCall: "",
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: true,
    };
    if (input.numero) createPayload.number = input.numero.replace(/\D/g, "");

    console.log(`[chip-bootstrap] Criando instância "${instanceName}"...`);
    const createResp = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify(createPayload),
    });
    const createBody = await createResp.json().catch(() => null);
    if (!createResp.ok) {
      console.error("[chip-bootstrap] create instance failed:", createBody);
      return json({ ok: false, error: "evolution_create_failed", detail: createBody }, 500);
    }

    const instanceUuid = (createBody as any)?.instance?.instanceId || (createBody as any)?.instance?.id || null;
    const qrcode = (createBody as any)?.qrcode?.base64 || (createBody as any)?.qrcode || null;

    // ── 4. Cria registro em chips (precisamos do uuid antes do proxy) ──
    const { data: chipRow, error: chipErr } = await supabase
      .from("chips")
      .insert({
        nome: instanceName,
        instance_name: instanceName,
        instance_id: instanceUuid,
        numero: input.numero || null,
        provedor: "evolution",
        engine: "baileys",
        status: "ativo",
        connection_state: "close",
        tipo_instancia: input.tipo_instancia || "disparos",
        pode_disparar: false, // só vira true após sair do warm-up
        is_trafego_pago: input.tipo_instancia === "trafego_pago",
        limite_diario: 100,
      })
      .select("id")
      .single();
    if (chipErr || !chipRow) {
      console.error("[chip-bootstrap] insert chip failed:", chipErr);
      // rollback Evolution
      await fetch(`${evoUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: evoKey },
      }).catch(() => null);
      return json({ ok: false, error: "db_insert_failed", detail: chipErr?.message }, 500);
    }
    const chipId = chipRow.id as string;

    // ── 5. Aplica proxy Bright Data (sticky por chip_id curto) ──
    let proxyApplied = false;
    if (wantProxy) {
      const sessionId = `${slug}${chipId.slice(0, 8)}`;
      const proxyUsername = `brd-customer-${cfg.proxy_customer_id}-zone-${cfg.proxy_zone}-country-${cfg.proxy_country}-session-${sessionId}`;

      const proxyResp = await fetch(`${evoUrl}/proxy/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify({
          enabled: true,
          host: cfg.proxy_host,
          port: cfg.proxy_port,
          protocol: "http",
          username: proxyUsername,
          password: proxyPassword,
        }),
      });
      proxyApplied = proxyResp.ok;
      if (!proxyApplied) {
        const errText = await proxyResp.text();
        console.warn(`[chip-bootstrap] proxy set failed (${proxyResp.status}):`, errText.slice(0, 200));
      } else {
        // Salva proxy_config (sem senha) na tabela chips pra auditoria
        await supabase.from("chips").update({
          proxy_config: {
            provider: "bright_data",
            host: cfg.proxy_host,
            port: cfg.proxy_port,
            session: sessionId,
          },
        }).eq("id", chipId);
        console.log(`[chip-bootstrap] proxy aplicado: session=${sessionId}`);
      }
    }

    // ── 6. Configura webhook global ──
    const webhookCfg = cfg.evolution_webhook_global ? JSON.parse(cfg.evolution_webhook_global) : null;
    if (webhookCfg?.url) {
      const webhookResp = await fetch(`${evoUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify({
          enabled: true,
          url: webhookCfg.url,
          webhookByEvents: webhookCfg.byEvents ?? false,
          webhookBase64: webhookCfg.base64 ?? false,
          events: webhookCfg.events || ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        }),
      });
      if (webhookResp.ok) {
        await supabase.from("chips").update({ webhook_url: webhookCfg.url }).eq("id", chipId);
        console.log("[chip-bootstrap] webhook configurado");
      } else {
        console.warn("[chip-bootstrap] webhook set failed:", await webhookResp.text());
      }
    }

    // ── 7. Cria chip_state em fase='setup' com aquecedor ATIVO ──
    // aquecedor_ativo=true marca chip como elegível pro aquecedor automatizado
    // (chips antigos em produção têm aquecedor_ativo=false, ficam intactos).
    await supabase.from("chip_state").insert({
      chip_id: chipId,
      fase: "setup",
      warmup_start_date: null, // só seta quando chip parear (open)
      health_score: 0,
      aquecedor_ativo: true,
    }).then(() => null).catch(async () => {
      // Já existe? upsert manual
      await supabase.from("chip_state").update({
        fase: "setup",
        warmup_start_date: null,
        paused_until: null,
        pause_reason: null,
        aquecedor_ativo: true,
      }).eq("chip_id", chipId);
    });

    // ── 8. Gera persona (chama edge persona-generator) ──
    let personaInfo = null;
    if (!input.skip_persona) {
      const personaResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/persona-generator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ chip_id: chipId }),
        }
      );
      if (personaResp.ok) {
        const personaBody = await personaResp.json();
        personaInfo = personaBody.persona;
        console.log("[chip-bootstrap] persona criada:", personaInfo);
      } else {
        console.warn("[chip-bootstrap] persona-generator failed:", await personaResp.text());
      }
    }

    return json({
      ok: true,
      chip_id: chipId,
      instance_name: instanceName,
      instance_uuid: instanceUuid,
      qrcode,                       // base64 PNG do QR code (ou null se Evolution não retornou)
      proxy_applied: proxyApplied,
      persona: personaInfo,
      next_step: "Escaneie o QR code no celular do número. Após parear, chip entra em fase 'aquecimento' automaticamente.",
    });
  } catch (e: any) {
    console.error("[chip-bootstrap] error", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
