import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Lead {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  especialidade?: string | null;
  uf?: string | null;
  cidade?: string | null;
}

interface Body {
  campanha_proposta_id: string;
  leads: Lead[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body.campanha_proposta_id || !Array.isArray(body.leads) || body.leads.length === 0) {
      return json({ error: "campanha_proposta_id e leads são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Carrega contexto da proposta/campanha
    const { data: cp } = await supabase
      .from("campanha_propostas")
      .select(
        "id, campanha:campanha_id(id, nome), proposta:proposta_id(id, id_proposta, descricao)"
      )
      .eq("id", body.campanha_proposta_id)
      .maybeSingle();

    // Busca config webhook + instância
    const { data: configs } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["trafego_pago_webhook_url", "trafego_pago_evolution_instance"]);

    const webhookUrl = configs?.find((c) => c.campo_nome === "trafego_pago_webhook_url")?.valor;
    const evolutionInstance = configs?.find(
      (c) => c.campo_nome === "trafego_pago_evolution_instance"
    )?.valor;

    if (!webhookUrl) {
      return json({ error: "trafego_pago_webhook_url não configurado em config_lista_items" }, 400);
    }

    // Marca canal em andamento
    await marcarCanal(supabase, body.campanha_proposta_id, "em_andamento", {
      total: body.leads.length,
    });

    // Gera XLSX
    const rows = body.leads.map((l) => ({
      ID: l.id,
      Nome: l.nome ?? "",
      Telefone: l.telefone ?? "",
      Email: l.email ?? "",
      Especialidade: l.especialidade ?? "",
      UF: l.uf ?? "",
      Cidade: l.cidade ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const xlsxBuf: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const base64 = bytesToBase64(xlsxBuf);

    const filename = `trafego_pago_${body.campanha_proposta_id}_${Date.now()}.xlsx`;

    // Carrega contexto da campanha_proposta para pegar campanha_id e proposta_id
    const { data: cpFull } = await supabase
      .from("campanha_propostas")
      .select("id, campanha_id, proposta_id")
      .eq("id", body.campanha_proposta_id)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    // Marca leads como tráfego pago + grava histórico de envio + evento de conversão
    const leadIds = body.leads.map((l) => l.id);
    if (leadIds.length > 0) {
      // 1. Marca leads
      await supabase
        .from("leads")
        .update({
          is_trafego_pago: true,
          trafego_pago_enviado_at: nowIso,
          trafego_pago_campanha_proposta_id: body.campanha_proposta_id,
          trafego_pago_instancia: evolutionInstance ?? null,
          trafego_pago_origem: {
            detectado_em: nowIso,
            fonte: "envio_xlsx",
            instancia: evolutionInstance ?? null,
            campanha_proposta_id: body.campanha_proposta_id,
          },
        })
        .in("id", leadIds);

      // 2. Histórico de envios
      const enviosRows = body.leads.map((l) => ({
        lead_id: l.id,
        campanha_proposta_id: body.campanha_proposta_id,
        campanha_id: cpFull?.campanha_id ?? null,
        proposta_id: cpFull?.proposta_id ?? null,
        instancia: evolutionInstance ?? null,
        telefone_enviado: l.telefone ?? null,
        arquivo_nome: filename,
        enviado_em: nowIso,
        metadados: { especialidade: l.especialidade ?? null, uf: l.uf ?? null },
      }));
      await supabase.from("trafego_pago_envios").insert(enviosRows);

      // 3. Evento de conversão "enviado"
      const conversoesRows = body.leads.map((l) => ({
        lead_id: l.id,
        campanha_proposta_id: body.campanha_proposta_id,
        campanha_id: cpFull?.campanha_id ?? null,
        proposta_id: cpFull?.proposta_id ?? null,
        instancia: evolutionInstance ?? null,
        evento: "enviado",
        ocorreu_em: nowIso,
        detalhes: { phone: l.telefone, arquivo: filename },
      }));
      await supabase.from("trafego_pago_conversoes").insert(conversoesRows);
    }

    const payload = {
      campanha_proposta_id: body.campanha_proposta_id,
      campanha: (cp?.campanha as any)?.nome ?? null,
      proposta: cp?.proposta
        ? {
            id: (cp.proposta as any).id,
            id_proposta: (cp.proposta as any).id_proposta,
            descricao: (cp.proposta as any).descricao,
          }
        : null,
      evolution_instance: evolutionInstance ?? null,
      total: body.leads.length,
      enviado_em: new Date().toISOString(),
      arquivo: {
        nome: filename,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64,
      },
    };

    const metadados: any = { total: body.leads.length, arquivo: filename };
    let sucesso = false;

    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      metadados.webhook = { status: r.status, body: text.slice(0, 2000) };
      sucesso = r.ok;
    } catch (e: any) {
      metadados.webhook_error = e.message;
    }

    await marcarCanal(
      supabase,
      body.campanha_proposta_id,
      sucesso ? "concluido" : "falha",
      metadados
    );

    if (sucesso) {
      await supabase
        .from("campanha_propostas")
        .update({ webhook_trafego_enviado_at: new Date().toISOString() })
        .eq("id", body.campanha_proposta_id);
    }

    return json({ ok: true, success: sucesso, total: body.leads.length, metadados });
  } catch (e: any) {
    console.error("[trafego-pago-enviar-xlsx] erro:", e);
    return json({ error: e.message }, 500);
  }
});

async function marcarCanal(
  supabase: any,
  cpId: string,
  status: string,
  metadados: any
) {
  await supabase
    .from("campanha_proposta_canais")
    .update({
      status,
      metadados,
      concluido_em: status === "concluido" ? new Date().toISOString() : null,
      iniciado_em: new Date().toISOString(),
    })
    .eq("campanha_proposta_id", cpId)
    .eq("canal", "trafego_pago");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as any
    );
  }
  return btoa(binary);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}