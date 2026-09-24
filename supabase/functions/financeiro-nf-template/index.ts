// Submete à Meta (via Chakra) o template de solicitação de NF do FINANCEIRO e já deixa
// a configuração pronta. Roda uma vez; depois é só acompanhar a aprovação.
//
// O link do médico vai no BOTÃO de URL dinâmica (sufixo = token), não no corpo: aprova
// mais fácil e a mensagem fica limpa. Texto sem acento de propósito — template com
// acento já chegou corrompido do provedor nesta WABA (ver twilio-whatsapp-send).
//
// Input opcional: { nome?, corpo?, texto_botao?, link_base?, dry_run?: boolean }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOME_PADRAO = "gss_nf_solicitacao_v1";
const CORPO_PADRAO =
  "Dr(a). {{1}}, a GSS Saude precisa da sua nota fiscal referente a {{2}}, no valor de {{3}}. " +
  "Toque no botao abaixo para enviar a nota. Qualquer duvida, responda esta mensagem.";
const TEXTO_BOTAO = "Enviar nota fiscal";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const input = await req.json().catch(() => ({}));
    const nome = String(input.nome || NOME_PADRAO).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const corpo = String(input.corpo || CORPO_PADRAO);
    const textoBotao = String(input.texto_botao || TEXTO_BOTAO);

    const { data: cfgRows } = await svc.from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["financeiro_whatsapp_sender_id", "financeiro_nf_link_base"]);
    const cfg = (n: string) => cfgRows?.find((c: any) => c.campo_nome === n)?.valor || "";
    const linkBase = String(input.link_base || cfg("financeiro_nf_link_base") || Deno.env.get("APP_URL") || "https://sigma-gss.lovable.app").replace(/\/+$/, "");

    const senderId = cfg("financeiro_whatsapp_sender_id");
    if (!senderId) return json({ ok: false, error: "financeiro_whatsapp_sender_id nao configurado" }, 409);

    const { data: sender } = await svc.from("whatsapp_official_senders")
      .select("id, phone_e164, status, chakra_plugin_id, chakra_waba_id")
      .eq("id", senderId).maybeSingle();
    if (!sender?.chakra_waba_id || !sender?.chakra_plugin_id) {
      return json({ ok: false, error: "remetente do financeiro sem plugin/waba" }, 409);
    }

    const componentes = [
      {
        type: "BODY",
        text: corpo,
        example: { body_text: [["Marina Souza", "agosto/2026", "R$ 12.480,00"]] },
      },
      {
        type: "BUTTONS",
        buttons: [{
          type: "URL",
          text: textoBotao,
          url: `${linkBase}/nf/{{1}}`,
          example: [`${linkBase}/nf/a1b2c3d4e5f6`],
        }],
      },
    ];

    if (input.dry_run) {
      return json({ ok: true, dry_run: true, waba_id: sender.chakra_waba_id, remetente: sender.phone_e164, nome, componentes });
    }

    const resposta = await chakraApi(
      `/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates`,
      {
        method: "POST",
        body: JSON.stringify({ name: nome, category: "UTILITY", language: "pt_BR", components: componentes }),
      },
    );
    const remoto = unwrapChakraPayload(resposta);
    const remotoId = String(remoto.id || remoto.message_template_id || nome);
    const statusMeta = String(remoto.status || "PENDING").toLowerCase();

    const { data: gravado, error: gravaErro } = await svc.from("whatsapp_official_templates")
      .upsert({
        provider: "chakra",
        content_sid: `chakra:${sender.chakra_plugin_id}:${remotoId}`,
        friendly_name: nome,
        language: "pt_BR",
        category: "UTILITY",
        body: corpo,
        variables: { "1": "Nome do medico", "2": "Competencia", "3": "Valor" },
        approval_status: statusMeta === "approved" ? "approved" : statusMeta === "rejected" ? "rejected" : "pending",
        twilio_payload: remoto,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" })
      .select("id, approval_status").single();
    if (gravaErro) throw gravaErro;

    // deixa a configuração pronta: quando a Meta aprovar, o envio já funciona.
    // tipo=lembrete grava na chave da cobrança para não sobrescrever a do pedido.
    const chaveTemplate = String(input.tipo || "solicitacao") === "lembrete"
      ? "financeiro_nf_whatsapp_template_lembrete_id"
      : "financeiro_nf_whatsapp_template_id";
    for (const [campo, valor] of [
      [chaveTemplate, gravado.id],
      ["financeiro_nf_whatsapp_botao_url", "1"],
    ] as [string, string][]) {
      await svc.from("config_lista_items").delete().eq("campo_nome", campo);
      await svc.from("config_lista_items").insert({ campo_nome: campo, valor });
    }

    return json({
      ok: true, template_id: gravado.id, nome, status: gravado.approval_status,
      remetente: sender.phone_e164, waba_id: sender.chakra_waba_id, resposta_provedor: remoto,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
