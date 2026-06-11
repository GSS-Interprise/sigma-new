// uazapi-instance-manager (piloto 11/06): cria/conecta/consulta/apaga instâncias
// no servidor uazapi (https://pulseid.uazapi.com), ao lado da Evolution.
//
// Aditivo: cada chip uazapi nasce com provedor='uazapi' e o token isolado em
// chip_provider_secrets (só service_role). O connection_state é mapeado pro
// vocabulário Evolution (connected→open) pra disparo-processor/kanban funcionarem
// sem saber qual provedor é.
//
// Actions (body.action):
//   create  → POST /instance/init (admintoken) + cria chip + grava token + seta webhook
//   connect → POST /instance/connect (token) → QR base64 + pairing code
//   status  → GET  /instance/status (token) → sincroniza chips.connection_state
//   delete  → DELETE /instance (token) → remove instância + chip + secret

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// uazapi → vocabulário Evolution (resto do sistema fala 'open'/'close'/'connecting')
function mapStatus(uz: string | undefined): string {
  if (uz === "connected") return "open";
  if (uz === "connecting") return "connecting";
  return "close"; // disconnected / vazio
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const UZ_URL = (Deno.env.get("UAZAPI_SERVER_URL") || "").replace(/\/+$/, "");
  const UZ_ADMIN = Deno.env.get("UAZAPI_ADMIN_TOKEN") || "";
  if (!UZ_URL || !UZ_ADMIN) return json({ error: "uazapi_not_configured" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // auth: a plataforma já valida o JWT (verify_jwt). Resolve o user pra dono_id;
  // service_role (cron/teste) não tem user → usa fallback do body.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autorizado" }, 401);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  // helper: pega token uazapi do chip
  const getChipToken = async (chipId: string): Promise<string | null> => {
    const { data } = await supabase
      .from("chip_provider_secrets").select("uazapi_token").eq("chip_id", chipId).maybeSingle();
    return (data?.uazapi_token as string) || null;
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "create": {
        const nome = (body.nome || "").toString().trim();
        if (!nome) return json({ error: "nome obrigatório" }, 400);
        // slug pro name da instância (uazapi não gosta de espaço/acento)
        const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || `gss-uz-${Date.now()}`;

        const initResp = await fetch(`${UZ_URL}/instance/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json", admintoken: UZ_ADMIN },
          body: JSON.stringify({ name: slug }),
        });
        const initData = await initResp.json();
        const inst = initData?.instance || initData;
        const token = initData?.token || inst?.token;
        const instanceId = inst?.id;
        if (!initResp.ok || !token) return json({ error: "uazapi_init_failed", detail: initData }, 502);

        // cria o chip (provedor=uazapi). pode_disparar=true: piloto usa direto em campanha.
        const { data: chip, error: chipErr } = await supabase
          .from("chips")
          .insert({
            nome,
            instance_name: slug,
            numero: body.numero || null,
            provedor: "uazapi",
            engine: "uazapi",
            status: "ativo",
            connection_state: "close",
            tipo_instancia: body.tipo_instancia || "disparos",
            categoria_uso: body.categoria_uso || "prospeccao_ia",
            pode_disparar: true,
            limite_diario: 100,
            dono_id: user?.id || body.dono_id || null,
            created_by: user?.id || body.dono_id || null,
          })
          .select("id")
          .single();
        if (chipErr) return json({ error: "chip_insert_failed", detail: chipErr.message }, 500);

        await supabase.from("chip_provider_secrets").insert({
          chip_id: chip.id, provedor: "uazapi", uazapi_token: token, uazapi_instance_id: instanceId,
        });

        // webhook → uazapi-webhook (mensagens + conexão)
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapi-webhook`;
        await fetch(`${UZ_URL}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ url: webhookUrl, events: ["messages", "connection"], enabled: true }),
        }).catch(() => {});

        return json({ ok: true, chip_id: chip.id, instance_name: slug, provedor: "uazapi" });
      }

      case "connect": {
        const chipId = body.chip_id as string;
        if (!chipId) return json({ error: "chip_id obrigatório" }, 400);
        const token = await getChipToken(chipId);
        if (!token) return json({ error: "chip sem token uazapi" }, 404);

        const r = await fetch(`${UZ_URL}/instance/connect`, {
          method: "POST", headers: { "Content-Type": "application/json", token }, body: JSON.stringify({}),
        });
        const d = await r.json();
        const inst = d?.instance || d;
        const st = mapStatus(inst?.status);
        await supabase.from("chips").update({ connection_state: st, updated_at: new Date().toISOString() }).eq("id", chipId);
        // qrcode vem como base64 (com ou sem prefixo data:)
        let qr = inst?.qrcode || "";
        if (qr && !qr.startsWith("data:")) qr = `data:image/png;base64,${qr}`;
        return json({ ok: true, qrcode: qr, paircode: inst?.paircode || null, state: st });
      }

      case "status": {
        const chipId = body.chip_id as string;
        if (!chipId) return json({ error: "chip_id obrigatório" }, 400);
        const token = await getChipToken(chipId);
        if (!token) return json({ error: "chip sem token uazapi" }, 404);
        const r = await fetch(`${UZ_URL}/instance/status`, { headers: { token } });
        const d = await r.json();
        const inst = d?.instance || d;
        const st = mapStatus(inst?.status);
        const numero = inst?.owner ? String(inst.owner).replace(/\D/g, "") : undefined;
        await supabase.from("chips").update({
          connection_state: st,
          ...(numero ? { numero } : {}),
          updated_at: new Date().toISOString(),
        }).eq("id", chipId);
        return json({ ok: true, state: st, connected: inst?.status === "connected" });
      }

      case "delete": {
        const chipId = body.chip_id as string;
        if (!chipId) return json({ error: "chip_id obrigatório" }, 400);
        const token = await getChipToken(chipId);
        if (token) {
          await fetch(`${UZ_URL}/instance`, { method: "DELETE", headers: { token } }).catch(() => {});
        }
        await supabase.from("chip_provider_secrets").delete().eq("chip_id", chipId);
        await supabase.from("chips").update({ status: "inativo", connection_state: "close" }).eq("id", chipId);
        return json({ ok: true });
      }

      default:
        return json({ error: "action inválida", action }, 400);
    }
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
