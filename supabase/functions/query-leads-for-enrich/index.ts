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

  // Validate token against api_tokens table
  const { data: tokenId, error: tokenError } = await supabase
    .rpc("validate_api_token", { _token: token });

  if (tokenError || !tokenId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Invalid or expired token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse optional query params for limit and hours threshold
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 10000);
    const hoursThreshold = parseFloat(url.searchParams.get("hours") || "6");

    // ========== QUERY LEADS PENDING ENRICHMENT ==========
    const { data: leads, error: queryError } = await supabase
      .from("leads")
      .select("id, cpf, nome, crm, rqe, data_nascimento, cidade, uf, phone_e164, email, especialidade_id, origem, created_at, api_enrich_status, api_enrich_last_attempt")
      .in("api_enrich_status", ["pendente", "erro"])
      .or(
        `api_enrich_last_attempt.is.null,api_enrich_last_attempt.lt.${new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString()}`
      )
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

    const leadIds = leads.map((l: any) => l.id);

    // ========== MARK AS em_processamento ==========
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        api_enrich_status: "em_processamento",
        api_enrich_last_attempt: new Date().toISOString(),
      })
      .in("id", leadIds);

    if (updateError) {
      console.error("[query-leads-for-enrich] Update error:", updateError);
      throw updateError;
    }

    console.log(`[query-leads-for-enrich] Returning ${leads.length} leads for enrichment.`);

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
