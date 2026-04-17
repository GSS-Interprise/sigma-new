import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  campanha_proposta_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body.campanha_proposta_id) {
      return json({ error: "campanha_proposta_id obrigatório" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Carrega vínculo + lista + campanha + proposta
    const { data: cp, error: cpErr } = await supabase
      .from("campanha_propostas")
      .select(
        "id, campanha_id, proposta_id, lista_id, webhook_trafego_enviado_at, campanha:campanha_id(id, nome), proposta:proposta_id(id, id_proposta, descricao), lista:lista_id(id, nome, modo, filtro_ufs, filtro_cidades, filtro_especialidades, filtro_status, excluir_blacklist)"
      )
      .eq("id", body.campanha_proposta_id)
      .maybeSingle();

    if (cpErr) throw cpErr;
    if (!cp) return json({ error: "Vínculo não encontrado" }, 404);

    // Idempotência: já enviou
    if (cp.webhook_trafego_enviado_at) {
      return json({ ok: true, ja_enviado: true });
    }

    const lista: any = cp.lista;
    if (!lista) {
      await marcarCanal(supabase, cp.id, "falha", { erro: "Lista não vinculada" });
      return json({ error: "Lista não vinculada" }, 400);
    }

    // 2. Resolve contatos (réplica de resolverContatosDaLista)
    const leadsMap = new Map<string, any>();

    if (lista.modo === "manual" || lista.modo === "mista") {
      const { data: itens } = await supabase
        .from("disparo_lista_itens")
        .select(
          "leads:lead_id (id, nome, phone_e164, especialidade, uf, cidade, status, email)"
        )
        .eq("lista_id", lista.id);
      (itens || []).forEach((i: any) => {
        const l = i.leads;
        if (l?.id && l.phone_e164) leadsMap.set(l.id, l);
      });
    }

    if (lista.modo === "dinamica" || lista.modo === "mista") {
      let q = supabase
        .from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade, status, email")
        .not("phone_e164", "is", null)
        .is("merged_into_id", null);
      if (lista.filtro_ufs?.length) q = q.in("uf", lista.filtro_ufs);
      if (lista.filtro_cidades?.length) q = q.in("cidade", lista.filtro_cidades);
      if (lista.filtro_status?.length) q = q.in("status", lista.filtro_status);
      const { data: leads } = await q.limit(5000);
      (leads || []).forEach((l: any) => {
        if (
          lista.filtro_especialidades?.length &&
          (!l.especialidade ||
            !lista.filtro_especialidades.includes(l.especialidade))
        )
          return;
        if (l.phone_e164) leadsMap.set(l.id, l);
      });
    }

    if (lista.excluir_blacklist) {
      const { data: bl } = await supabase.from("blacklist").select("phone_e164");
      const blPhones = new Set(
        (bl || [])
          .map((b: any) => (b.phone_e164 || "").replace(/\D/g, ""))
          .filter(Boolean)
      );
      for (const [id, lead] of leadsMap.entries()) {
        const key = (lead.phone_e164 || "").replace(/\D/g, "");
        if (blPhones.has(key)) leadsMap.delete(id);
      }
    }

    const contatos = Array.from(leadsMap.values());

    // 3. Busca config webhook + instância
    const { data: configs } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["trafego_pago_webhook_url", "trafego_pago_evolution_instance"]);

    const webhookUrl = configs?.find(
      (c) => c.campo_nome === "trafego_pago_webhook_url"
    )?.valor;
    const evolutionInstance = configs?.find(
      (c) => c.campo_nome === "trafego_pago_evolution_instance"
    )?.valor;

    const payload = {
      campanha_proposta_id: cp.id,
      campanha: (cp.campanha as any)?.nome,
      proposta: {
        id: cp.proposta_id,
        id_proposta: (cp.proposta as any)?.id_proposta,
        descricao: (cp.proposta as any)?.descricao,
      },
      lista: { id: lista.id, nome: lista.nome, modo: lista.modo },
      total: contatos.length,
      evolution_instance: evolutionInstance ?? null,
      contatos: contatos.map((c) => ({
        id: c.id,
        nome: c.nome,
        telefone: c.phone_e164,
        email: c.email,
        especialidade: c.especialidade,
        uf: c.uf,
        cidade: c.cidade,
      })),
      enviado_em: new Date().toISOString(),
    };

    const metadados: any = { total: contatos.length };
    let sucesso = false;

    // 4. POST webhook (se configurado)
    if (webhookUrl) {
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
    } else {
      metadados.aviso = "trafego_pago_webhook_url não configurado em config_lista_items";
    }

    // 5. Atualiza canal trafego_pago
    await marcarCanal(
      supabase,
      cp.id,
      sucesso ? "concluido" : "falha",
      metadados
    );

    // 6. Marca idempotência se sucesso
    if (sucesso) {
      await supabase
        .from("campanha_propostas")
        .update({ webhook_trafego_enviado_at: new Date().toISOString() })
        .eq("id", cp.id);
    }

    return json({ ok: true, success: sucesso, total: contatos.length, metadados });
  } catch (e: any) {
    console.error("[trafego-pago-auto-dispatch] erro:", e);
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

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
