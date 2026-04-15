import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Pipeline → column mapping
    const PIPELINE_COLS: Record<string, { enrichCol: string; lastAttemptCol: string }> = {
      "enrich_v1":            { enrichCol: "enrich_one",   lastAttemptCol: "last_attempt_at_one" },
      "enrich_residentes":    { enrichCol: "enrich_two",   lastAttemptCol: "last_attempt_at_two" },
      "enrich_lemit":         { enrichCol: "enrich_three", lastAttemptCol: "last_attempt_at_three" },
      "enrich_lifeshub":      { enrichCol: "enrich_four",  lastAttemptCol: "last_attempt_at_four" },
      "enrich_especialidade": { enrichCol: "enrich_five",  lastAttemptCol: "last_attempt_at_five" },
    };

    const cols = PIPELINE_COLS[pipeline];
    if (!cols) {
      return new Response(
        JSON.stringify({ error: `Unknown pipeline: ${pipeline}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== QUERY leads WHERE enrich_X = false ==========
    const { data: leads, error: queryError } = await supabase
      .from("leads")
      .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, email, especialidade_id, origem, created_at")
      .eq(cols.enrichCol, false)
      .is("merged_into_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);

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

    // ========== MARK last_attempt_at ==========
    const leadIds = leads.map((l: any) => l.id);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("leads")
      .update({ [cols.lastAttemptCol]: now })
      .in("id", leadIds);

    if (updateError) {
      console.error("[query-leads-for-enrich] Update error:", updateError);
      throw updateError;
    }

    // Also update lead_enrichments for audit (best-effort)
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
