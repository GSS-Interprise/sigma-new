import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_COLUMNS = [
  "enrich_one",
  "enrich_two",
  "enrich_three",
  "enrich_four",
  "enrich_five",
];

const VALID_LEAD_FIELDS = [
  "cpf", "nome", "crm", "rqe", "data_nascimento", "cidade", "uf",
  "phone_e164", "email", "especialidade_id", "origem", "created_at",
  "merged_into_id",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ========== AUTH: only "Enriquecedor-leads" token ==========
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Provide a Bearer token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("api_tokens")
    .select("id, nome")
    .eq("token", token)
    .eq("ativo", true)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Invalid or expired token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (tokenRow.nome !== "Enriquecedor-leads") {
    return new Response(
      JSON.stringify({ error: "Forbidden. This endpoint requires the 'Enriquecedor-leads' token." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  await supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  try {
    // Read from POST body
    const body = await req.json().catch(() => ({}));
    const column = body.column;
    const limit = Math.min(parseInt(body.limit || "500"), 10000);
    const notNullFields: string[] = Array.isArray(body.not_null_fields) ? body.not_null_fields : [];

    if (!column || !VALID_COLUMNS.includes(column)) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing 'column'. Valid: ${VALID_COLUMNS.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate not_null_fields
    for (const field of notNullFields) {
      if (!VALID_LEAD_FIELDS.includes(field)) {
        return new Response(
          JSON.stringify({
            error: `Invalid field in not_null_fields: '${field}'. Valid: ${VALID_LEAD_FIELDS.join(", ")}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build query
    let query = supabase
      .from("leads")
      .select(`
        id, cpf, nome, crm, rqe, data_nascimento, cidade, uf,
        phone_e164, email, especialidade_id, origem, created_at,
        lead_enrichments!inner(${column})
      `)
      .eq(`lead_enrichments.${column}`, false)
      .is("merged_into_id", null);

    // Apply not_null filters with OR logic (at least one must be non-null)
    if (notNullFields.length > 0) {
      const orExpr = notNullFields.map((f) => `${f}.not.is.null`).join(",");
      query = query.or(orExpr);
    }

    query = query.order("created_at", { ascending: true }).limit(limit);

    const { data: leads, error: queryError } = await query;

    if (queryError) {
      console.error("[query-leads-by-enrich] Query error:", queryError);
      throw queryError;
    }

    const cleanLeads = (leads || []).map(({ lead_enrichments, ...lead }: any) => lead);

    console.log(`[query-leads-by-enrich] Returning ${cleanLeads.length} leads where ${column} = false, not_null: [${notNullFields.join(",")}]`);

    return new Response(
      JSON.stringify({ leads: cleanLeads, total: cleanLeads.length, column }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[query-leads-by-enrich] Internal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
