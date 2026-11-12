// Monitor dos números oficiais (Chakra → Meta). Spec: docs/arquitetura/monitor-numeros-whatsapp.md.
// O healthStatus da Meta mente (141006 de pagamento preso por dias; "conectado" sem permissão), então
// só prova real conta. Três camadas, chamadas pelo cron com {"acao": ...}:
//   trafego    (1 h)  — resolve testes pendentes, recalcula a disponibilidade, alerta mudanças
//   sonda      (6 h)  — texto para um número inexistente: se a Meta recusa na hora, perdemos o acesso
//   teste_real (9h)   — modelo aprovado para um destinatário interno, só nos números parados há 48 h
//   tudo              — as três, na ordem (uso manual)
// Só service_role chama.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { chakraApi, ChakraApiError } from "../_shared/chakra.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Número que não existe no WhatsApp: a Meta aceita o pedido (e marca falha depois, sem cobrar)
// quando o nosso número está bem; quando perdemos o acesso, recusa na hora com erro 100/190/...
const DESTINO_SONDA = "5511900000000";
// Erros que dizem que o NOSSO acesso ao número quebrou (doc Meta/Chakra, pesquisa de 12/11).
const ERRO_PERMISSAO = /does not exist|missing permission|"code":\s*(100|190|200|10)\b|131005|133010|133000|access token/i;
const ALERTA_FONE = "555484351512"; // Raul, o mesmo do bridge-healthcheck-v2

function ehServiceRole(auth: string) {
  try {
    const p = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role === "service_role";
  } catch {
    return false;
  }
}

type Conexao = { id: string; phone_e164: string; phone_number_id: string; plugin_id: string; waba_id: string; status: string; disponibilidade: string | null; disponibilidade_motivo: string | null };

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("Authorization") || "")) return json({ ok: false, error: "service_role_only" }, 403);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  const { acao = "trafego" } = await req.json().catch(() => ({}));

  const { data: conns } = await admin.from("whatsapp_chakra_connections")
    .select("id, phone_e164, phone_number_id, plugin_id, waba_id, status, disponibilidade, disponibilidade_motivo")
    .neq("status", "desconectado");
  const conexoes = (conns || []) as Conexao[];
  const saida: Record<string, unknown> = {};

  if (acao === "sonda" || acao === "tudo") saida.sonda = await sonda(admin, conexoes);
  if (acao === "teste_real" || acao === "tudo") saida.teste_real = await testeReal(admin, conexoes, url, service);
  // O tráfego roda sempre por último: resolve os testes e recalcula com as sondas novas.
  saida.trafego = await trafego(admin);
  return json({ ok: true, ...saida });
});

async function sonda(admin: any, conexoes: Conexao[]) {
  const r: unknown[] = [];
  for (const c of conexoes) {
    const path = `/v1/ext/plugin/whatsapp/${c.plugin_id}/api/v24.0/${c.phone_number_id}/messages`;
    let resultado = "ok", categoria: string | null = null, codigo: string | null = null, detalhe = "A Meta aceitou o pedido: acesso ok.";
    try {
      await chakraApi(path, {
        method: "POST",
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: DESTINO_SONDA, type: "text", text: { body: "verificação automática do Sigma" } }),
      });
    } catch (e) {
      const msg = e instanceof ChakraApiError ? e.providerMessage : String(e);
      if (ERRO_PERMISSAO.test(msg)) {
        resultado = "falha"; categoria = "permissao"; codigo = msg.match(/"code":\s*(\d+)/)?.[1] || "100"; detalhe = msg.slice(0, 300);
      } else {
        // Outro erro síncrono (limite, número do destino inválido...): não prova perda de acesso.
        resultado = "sem_dado"; categoria = "outro"; detalhe = msg.slice(0, 300);
      }
    }
    await admin.from("whatsapp_monitor_checagens").insert({ phone_e164: c.phone_e164, tipo: "sonda", resultado, categoria, codigo, detalhe });
    r.push({ fone: c.phone_e164, resultado, categoria });
  }
  return r;
}

async function testeReal(admin: any, conexoes: Conexao[], url: string, service: string) {
  const { data: destinos } = await admin.from("whatsapp_monitor_destinos").select("nome, phone_e164").eq("ativo", true);
  if (!destinos?.length) return { aviso: "sem destinatário em whatsapp_monitor_destinos" };
  // Quem já recebeu teste hoje fica de fora: 2º marketing no dia para a mesma pessoa cai no 131049.
  const { data: hoje } = await admin.from("whatsapp_monitor_checagens").select("destino_fim")
    .eq("tipo", "teste_real").gte("em", new Date(Date.now() - 20 * 3600 * 1000).toISOString());
  const usados = new Set((hoje || []).map((h: any) => h.destino_fim));
  const livres = destinos.filter((d: any) => !usados.has(d.phone_e164.slice(-4)));

  const r: unknown[] = [];
  for (const c of conexoes) {
    // Só número parado: quem entregou qualquer coisa em 48 h já está provado pelo tráfego.
    const { data: entregue } = await admin.rpc("whatsapp_monitor_entregou_48h", { p_phone: c.phone_e164 });
    if (entregue) continue;
    const destino = livres.shift();
    if (!destino) { r.push({ fone: c.phone_e164, aviso: "sem destinatário livre hoje" }); continue; }
    const to = destino.phone_e164.replace(/\D/g, "");
    const resp = await fetch(`${url}/functions/v1/chakra-connect`, {
      method: "POST", headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_test", connectionId: c.id, to }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: String(e) }));
    const falhaPermissao = !resp.ok && ERRO_PERMISSAO.test(String(resp.error || ""));
    await admin.from("whatsapp_monitor_checagens").insert({
      phone_e164: c.phone_e164, tipo: "teste_real",
      resultado: resp.ok ? "aguardando" : resp.error === "numero_sem_template_aprovado" ? "sem_dado" : "falha",
      categoria: resp.ok ? null : falhaPermissao ? "permissao" : resp.error === "numero_sem_template_aprovado" ? "outro" : "outro",
      detalhe: resp.ok ? `modelo ${resp.template}` : String(resp.error || "").slice(0, 300),
      message_id: resp.messageId || null, destino_fim: to.slice(-4),
    });
    r.push({ fone: c.phone_e164, ok: resp.ok, modelo: resp.template, erro: resp.ok ? undefined : resp.error });
  }
  return r;
}

async function trafego(admin: any) {
  // 1. Testes reais esperando o webhook de entrega.
  const { data: pendentes } = await admin.from("whatsapp_monitor_checagens").select("id, message_id, em")
    .eq("resultado", "aguardando").not("message_id", "is", null);
  for (const p of pendentes || []) {
    const { data: st } = await admin.rpc("whatsapp_monitor_status_mensagem", { p_message_id: p.message_id });
    const status = String(st?.status || "");
    const erro = String(st?.erro || "");
    if (["delivered", "read"].includes(status)) {
      await admin.from("whatsapp_monitor_checagens").update({ resultado: "ok", detalhe: `entregue (${status})` }).eq("id", p.id);
    } else if (status === "failed") {
      // 131049/130472 são do destinatário: o nosso número mandou, a Meta segurou para a pessoa.
      const doDestino = /healthy ecosystem|experiment|131049|130472/i.test(erro);
      await admin.from("whatsapp_monitor_checagens").update({
        resultado: doDestino ? "ok" : "falha", categoria: doDestino ? "destinatario" : /payment|131042/i.test(erro) ? "pagamento" : "outro",
        detalhe: erro.slice(0, 300),
      }).eq("id", p.id);
    } else if (Date.now() - new Date(p.em).getTime() > 6 * 3600 * 1000) {
      await admin.from("whatsapp_monitor_checagens").update({ resultado: "sem_dado", detalhe: "sem retorno de entrega em 6 h" }).eq("id", p.id);
    }
  }

  // 2. Disponibilidade a partir da prova real.
  await admin.rpc("whatsapp_numeros_recalcular_disponibilidade");

  // 3. Alerta só na mudança (ok → problema). "Não usar" e "Atenção" viram alerta; voltar a ok fecha.
  const { data: agora } = await admin.from("whatsapp_chakra_connections")
    .select("phone_e164, disponibilidade, disponibilidade_motivo, uso").neq("status", "desconectado");
  const { data: antes } = await admin.from("whatsapp_monitor_alertas").select("phone_e164, estado, detalhe").eq("categoria", "disponibilidade");
  const mapa = new Map((antes || []).map((a: any) => [a.phone_e164, a]));
  const mudou: string[] = [];
  for (const n of agora || []) {
    const estado = n.disponibilidade === "disponivel" ? "ok" : "falha";
    const anterior: any = mapa.get(n.phone_e164);
    if (estado === "falha" && (!anterior || anterior.estado === "ok" || anterior.detalhe !== n.disponibilidade_motivo)) {
      mudou.push(`• ${n.phone_e164}: ${n.disponibilidade_motivo}`);
    }
    await admin.from("whatsapp_monitor_alertas").upsert({
      phone_e164: n.phone_e164, categoria: "disponibilidade", estado, detalhe: n.disponibilidade_motivo, atualizado_em: new Date().toISOString(),
    });
    await admin.from("whatsapp_monitor_checagens").insert({
      phone_e164: n.phone_e164, tipo: "trafego", resultado: estado, categoria: estado === "ok" ? null : "outro", detalhe: n.disponibilidade_motivo,
    });
  }
  const alertou = mudou.length ? await alertar(admin, "⚠️ Sigma: número oficial com problema", mudou.join("\n")) : false;
  return { avaliados: (agora || []).length, novos_problemas: mudou.length, alertou };
}

// E-mail (Resend, mesmo remetente dos avisos de contrato) para MONITOR_WHATSAPP_EMAILS (secret,
// separado por vírgula). O caminho do bridge-healthcheck-v2 (chip Evolution) fica como segunda
// tentativa, mas em 11/2026 nenhum chip Evolution está aberto: o e-mail é o canal que funciona.
async function alertar(admin: any, titulo: string, corpo: string) {
  const resend = Deno.env.get("RESEND_API_KEY");
  const para = (Deno.env.get("MONITOR_WHATSAPP_EMAILS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (resend && para.length) {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sigma GSS <avisos@gestaoservicosaude.com.br>", to: para, subject: titulo.replace(/^\S+\s/, ""),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px"><p><b>${esc(titulo)}</b></p>`
          + `<p style="white-space:pre-line">${esc(corpo)}</p>`
          + `<p><a href="https://sigma-gss.lovable.app/configuracoes?tab=whatsapp">Abrir Configurações › WhatsApp</a></p>`
          + `<p style="color:#9ca3af;font-size:12px">Monitor dos números oficiais (docs/arquitetura/monitor-numeros-whatsapp.md). O aviso só sai quando um número muda de estado.</p></div>`,
        tags: [{ name: "origem", value: "whatsapp_monitor" }],
      }),
    }).catch(() => null);
    if (r?.ok) return true;
  }
  try {
    const { data: cfg } = await admin.from("config_lista_items").select("campo_nome, valor").in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = cfg?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = cfg?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    const { data: chip } = await admin.from("chips").select("instance_name").eq("status", "ativo")
      .eq("tipo_instancia", "disparos").eq("connection_state", "open").limit(1).maybeSingle();
    if (!evoUrl || !evoKey || !chip?.instance_name) return false;
    const r = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(chip.instance_name)}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: ALERTA_FONE, text: `${titulo}\n\n${corpo}\n\nDetalhe: Configurações › WhatsApp no Sigma.` }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
