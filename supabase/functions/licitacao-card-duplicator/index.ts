import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Duplicate a licitação card AGES <-> GSS.
// Body: { licitacao_id: string, tipo_destino?: 'AGES' | 'GSS', cnpj_orgao?: string }
// Returns: { id, card_gemeo_id }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth" }, 401);
    }

    // Validate the caller's JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => null);
    const licitacaoId: string | undefined = body?.licitacao_id;
    const tipoDestinoInput: string | undefined = body?.tipo_destino;
    const cnpjOrgaoOverride: string | undefined = body?.cnpj_orgao;
    if (!licitacaoId || typeof licitacaoId !== "string") {
      return json({ error: "invalid_body", detail: "licitacao_id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch source
    const { data: origem, error: e1 } = await admin
      .from("licitacoes")
      .select("*")
      .eq("id", licitacaoId)
      .maybeSingle();
    if (e1) return json({ error: "fetch_failed", detail: e1.message }, 500);
    if (!origem) return json({ error: "not_found" }, 404);

    if (origem.card_gemeo_id) {
      return json(
        { error: "already_duplicated", card_gemeo_id: origem.card_gemeo_id },
        409,
      );
    }

    const tipoOrigem = (origem.tipo_licitacao || "GSS").toUpperCase();
    const tipoDestino =
      tipoDestinoInput?.toUpperCase() ||
      (tipoOrigem === "AGES" ? "GSS" : "AGES");

    if (!["AGES", "GSS"].includes(tipoDestino)) {
      return json({ error: "invalid_tipo_destino" }, 400);
    }
    if (tipoDestino === tipoOrigem) {
      return json({ error: "same_tipo", detail: "destino deve diferir da origem" }, 400);
    }

    // Build duplicate payload (omit primary key + tracking fields)
    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      card_origem_id: _co,
      card_gemeo_id: _cg,
      effect_id: _ef,
      ...rest
    } = origem as Record<string, unknown>;

    const novoPayload = {
      ...rest,
      tipo_licitacao: tipoDestino,
      cnpj_orgao: cnpjOrgaoOverride ?? null,
      empresa_disputante: tipoDestino,
      card_origem_id: origem.id,
    };

    const { data: novo, error: e2 } = await admin
      .from("licitacoes")
      .insert(novoPayload)
      .select("id")
      .single();
    if (e2 || !novo) return json({ error: "insert_failed", detail: e2?.message }, 500);

    // Link both ways
    await admin
      .from("licitacoes")
      .update({ card_gemeo_id: novo.id })
      .eq("id", origem.id);
    await admin
      .from("licitacoes")
      .update({ card_gemeo_id: origem.id })
      .eq("id", novo.id);

    // Copy itens
    const { data: itens } = await admin
      .from("licitacao_itens")
      .select("*")
      .eq("licitacao_id", origem.id);

    if (itens && itens.length > 0) {
      const itensClone = itens.map((it: Record<string, unknown>) => {
        const { id: _i, created_at: _c, updated_at: _u, ...r } = it;
        return { ...r, licitacao_id: novo.id };
      });
      await admin.from("licitacao_itens").insert(itensClone);
    }

    // Activity entries (best-effort)
    await admin.from("licitacoes_atividades").insert([
      {
        licitacao_id: origem.id,
        user_id: userId,
        tipo: "card_duplicado",
        descricao: `Card duplicado para ${tipoDestino}`,
        valor_novo: novo.id,
      },
      {
        licitacao_id: novo.id,
        user_id: userId,
        tipo: "card_criado_por_duplicacao",
        descricao: `Criado a partir de ${tipoOrigem}`,
        valor_antigo: origem.id,
      },
    ]);

    return json({ id: novo.id, card_gemeo_id: origem.id, tipo_destino: tipoDestino }, 200);
  } catch (err) {
    return json({ error: "internal", detail: String(err instanceof Error ? err.message : err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}