import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid pipeline names
const VALID_PIPELINES = ["enrich_v1", "enrich_residentes", "enrich_lemit", "enrich_lifeshub", "enrich_especialidade"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET or POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ========== AUTH VIA BEARER TOKEN ==========
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

  const { data: tokenId, error: tokenError } = await supabase
    .rpc("validate_api_token", { _token: token });

  if (tokenError || !tokenId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Invalid or expired token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 10000);
    const pipeline = url.searchParams.get("pipeline") || "enrich_v1";

    if (!VALID_PIPELINES.includes(pipeline)) {
      return new Response(
        JSON.stringify({ error: `Unknown pipeline: ${pipeline}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== QUERY: leads NOT yet enriched for this pipeline ==========
    // Uses RPC or raw query via lead_enrichments LEFT JOIN
    // Strategy: get lead IDs that already have a completed enrichment for this pipeline,
    // then fetch leads NOT in that set.
    const { data: enrichedIds, error: enrichedError } = await supabase
      .from("lead_enrichments")
      .select("lead_id")
      .eq("pipeline", pipeline)
      .in("status", ["concluido", "alimentado"]);

    if (enrichedError) {
      console.error("[query-leads-for-enrich] Enriched IDs query error:", enrichedError);
      throw enrichedError;
    }

    const excludeIds = (enrichedIds || []).map((r: any) => r.lead_id);

    // Build query for leads not yet enriched
    let query = supabase
      .from("leads")
      .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, email, especialidade_id, origem, created_at")
      .is("merged_into_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    // Exclude already-enriched leads (Supabase doesn't support NOT IN directly for large sets)
    // For large exclude sets, we use a different approach with .not()
    if (excludeIds.length > 0 && excludeIds.length <= 5000) {
      // Use filter for manageable sets
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }
    // For very large sets (>5000), we still fetch and filter, but log a warning
    if (excludeIds.length > 5000) {
      console.warn(`[query-leads-for-enrich] Large exclude set: ${excludeIds.length} IDs. Consider using a DB function.`);
    }

    const { data: leads, error: queryError } = await query;

    if (queryError) {
      console.error("[query-leads-for-enrich] Query error:", queryError);
      throw queryError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ leads: [], total: 0, message: "No leads pending enrichment." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== MARK last_attempt_at in lead_enrichments ==========
    const leadIds = leads.map((l: any) => l.id);
    const now = new Date().toISOString();

    for (const leadId of leadIds) {
      await supabase
        .from("lead_enrichments")
        .upsert({
          lead_id: leadId,
          pipeline,
          status: "em_processamento",
          last_attempt_at: now,
        }, { onConflict: "lead_id,pipeline" })
        .then(r => { if (r.error) console.warn("[query-leads-for-enrich] enrichment upsert:", r.error.message); });
    }

    console.log(`[query-leads-for-enrich] Returning ${leads.length} leads for enrichment (pipeline: ${pipeline}).`);

    return new Response(
      JSON.stringify({ leads, total: leads.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[query-leads-for-enrich] Internal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
