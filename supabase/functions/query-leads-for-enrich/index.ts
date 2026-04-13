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
    const hoursThreshold = parseFloat(url.searchParams.get("hours") || "6");
    const pipeline = url.searchParams.get("pipeline") || "enrich_v1";

    // ========== QUERY lead_enrichments PENDING ==========
    const { data: enrichments, error: queryError } = await supabase
      .from("lead_enrichments")
      .select("id, lead_id, pipeline, status, last_attempt_at")
      .eq("pipeline", pipeline)
      .in("status", ["pendente", "erro"])
      .or(
        `last_attempt_at.is.null,last_attempt_at.lt.${new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString()}`
      )
      .order("created_at", { ascending: true })
      .limit(limit);

    if (queryError) {
      console.error("[query-leads-for-enrich] Query error:", queryError);
      throw queryError;
    }

    if (!enrichments || enrichments.length === 0) {
      return new Response(
        JSON.stringify({ leads: [], total: 0, message: "No leads pending enrichment." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enrichIds = enrichments.map((e: any) => e.id);
    const leadIds = enrichments.map((e: any) => e.lead_id);

    // ========== MARK AS em_processamento ==========
    const { error: updateError } = await supabase
      .from("lead_enrichments")
      .update({
        status: "em_processamento",
        last_attempt_at: new Date().toISOString(),
        attempt_count: enrichments[0]?.attempt_count ? enrichments[0].attempt_count + 1 : 1,
      })
      .in("id", enrichIds);

    if (updateError) {
      console.error("[query-leads-for-enrich] Update error:", updateError);
      throw updateError;
    }

    // Fetch lead data
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, email, especialidade_id, origem, created_at")
      .in("id", leadIds);

    if (leadsError) {
      console.error("[query-leads-for-enrich] Leads query error:", leadsError);
      throw leadsError;
    }

    // Merge enrichment info
    const enrichMap = new Map(enrichments.map((e: any) => [e.lead_id, e]));
    const mergedLeads = (leads || []).map((lead: any) => {
      const enrich = enrichMap.get(lead.id);
      return {
        ...lead,
        api_enrich_status: enrich?.status ?? null,
        api_enrich_last_attempt: enrich?.last_attempt_at ?? null,
      };
    });

    console.log(`[query-leads-for-enrich] Returning ${mergedLeads.length} leads for enrichment (pipeline: ${pipeline}).`);

    return new Response(
      JSON.stringify({ leads: mergedLeads, total: mergedLeads.length }),
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
