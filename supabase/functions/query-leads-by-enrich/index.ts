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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET or POST." }),
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

  // Validate token and ensure it's specifically the "Enriquecedor-leads" token
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

  // Update last_used_at
  await supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  try {
    const url = new URL(req.url);
    const column = url.searchParams.get("column");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 10000);

    if (!column || !VALID_COLUMNS.includes(column)) {
      return new Response(
        JSON.stringify({
          error: `Invalid column. Valid: ${VALID_COLUMNS.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query leads where the specified enrich column = false
    const { data: leads, error: queryError } = await supabase
      .from("leads")
      .select(`
        id, cpf, nome, crm, rqe, data_nascimento, cidade, uf,
        phone_e164, email, especialidade_id, origem, created_at,
        lead_enrichments!inner(${column})
      `)
      .eq(`lead_enrichments.${column}`, false)
      .is("merged_into_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (queryError) {
      console.error("[query-leads-by-enrich] Query error:", queryError);
      throw queryError;
    }

    // Strip the join object from the response, return flat lead data
    const cleanLeads = (leads || []).map(({ lead_enrichments, ...lead }: any) => lead);

    console.log(`[query-leads-by-enrich] Returning ${cleanLeads.length} leads where ${column} = false`);

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
