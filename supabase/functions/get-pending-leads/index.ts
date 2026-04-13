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

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET." }),
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
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const pipeline = url.searchParams.get("pipeline") || "enrich_v1";

    // Query lead_enrichments for pending leads, then join lead data
    const { data: enrichments, error: queryError } = await supabase
      .from("lead_enrichments")
      .select("lead_id, pipeline, status, source, last_attempt_at")
      .eq("pipeline", pipeline)
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (queryError) {
      console.error("[get-pending-leads] Query error:", queryError);
      throw queryError;
    }

    if (!enrichments || enrichments.length === 0) {
      return new Response(
        JSON.stringify({ leads: [], total: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadIds = enrichments.map((e: any) => e.lead_id);

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, telefones_adicionais, email, emails_adicionais, especialidade_id, origem, status, created_at")
      .in("id", leadIds);

    if (leadsError) {
      console.error("[get-pending-leads] Leads query error:", leadsError);
      throw leadsError;
    }

    // Merge enrichment info into lead objects
    const enrichMap = new Map(enrichments.map((e: any) => [e.lead_id, e]));
    const mergedLeads = (leads || []).map((lead: any) => {
      const enrich = enrichMap.get(lead.id);
      return {
        ...lead,
        api_enrich_status: enrich?.status ?? null,
        api_enrich_last_attempt: enrich?.last_attempt_at ?? null,
        api_enrich_source: enrich?.source ?? null,
      };
    });

    return new Response(
      JSON.stringify({ leads: mergedLeads, total: mergedLeads.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[get-pending-leads] Internal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error?.message ?? String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
