import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pipeline → coluna enrich_*
const PIPELINE_COLUMN: Record<string, string> = {
  enrich_v1: "enrich_one",
  enrich_residentes: "enrich_two",
  enrich_lemit: "enrich_three",
  enrich_lifeshub: "enrich_four",
  enrich_especialidade: "enrich_five",
};

const PIPELINE_ATTEMPT_COLUMN: Record<string, string> = {
  enrich_v1: "last_attempt_at_one",
  enrich_residentes: "last_attempt_at_two",
  enrich_lemit: "last_attempt_at_three",
  enrich_lifeshub: "last_attempt_at_four",
  enrich_especialidade: "last_attempt_at_five",
};

const VALID_PIPELINES = Object.keys(PIPELINE_COLUMN);

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
        JSON.stringify({ error: `Unknown pipeline: ${pipeline}. Valid: ${VALID_PIPELINES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enrichCol = PIPELINE_COLUMN[pipeline];
    const attemptCol = PIPELINE_ATTEMPT_COLUMN[pipeline];

    // ========== QUERY: leads NOT yet enriched for this pipeline ==========
    // Uses RPC to do a LEFT JOIN and filter on the specific boolean column
    const { data: leads, error: queryError } = await supabase
      .rpc("query_leads_not_enriched", {
        p_enrich_column: enrichCol,
        p_limit: limit,
      });

    // Fallback: if RPC doesn't exist, use direct query approach
    if (queryError && queryError.message?.includes("query_leads_not_enriched")) {
      console.warn("[query-leads-for-enrich] RPC not found, using direct query fallback");
      
      // Direct approach: get leads where lead_enrichments row doesn't exist or enrich_X = false
      const { data: enrichedLeadIds, error: enrichedError } = await supabase
        .from("lead_enrichments")
        .select("lead_id")
        .eq(enrichCol, true);

      if (enrichedError) {
        console.error("[query-leads-for-enrich] Enriched query error:", enrichedError);
        throw enrichedError;
      }

      const excludeIds = (enrichedLeadIds || []).map((r: any) => r.lead_id);

      let query = supabase
        .from("leads")
        .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, email, especialidade_id, origem, created_at")
        .is("merged_into_id", null)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (excludeIds.length > 0 && excludeIds.length <= 5000) {
        query = query.not("id", "in", `(${excludeIds.join(",")})`);
      }

      const { data: fallbackLeads, error: fallbackError } = await query;
      if (fallbackError) throw fallbackError;

      if (!fallbackLeads || fallbackLeads.length === 0) {
        return new Response(
          JSON.stringify({ leads: [], total: 0, message: "No leads pending enrichment." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark last_attempt_at for this pipeline
      const now = new Date().toISOString();
      for (const lead of fallbackLeads) {
        await supabase
          .from("lead_enrichments")
          .upsert(
            { lead_id: lead.id, [attemptCol]: now },
            { onConflict: "lead_id" }
          )
          .then(r => { if (r.error) console.warn("[query-leads-for-enrich] upsert:", r.error.message); });
      }

      return new Response(
        JSON.stringify({ leads: fallbackLeads, total: fallbackLeads.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // ========== MARK last_attempt_at for this pipeline ==========
    const now = new Date().toISOString();
    for (const lead of leads) {
      await supabase
        .from("lead_enrichments")
        .upsert(
          { lead_id: lead.id, [attemptCol]: now },
          { onConflict: "lead_id" }
        )
        .then(r => { if (r.error) console.warn("[query-leads-for-enrich] upsert:", r.error.message); });
    }

    console.log(`[query-leads-for-enrich] Returning ${leads.length} leads for enrichment (pipeline: ${pipeline}, column: ${enrichCol}).`);

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
