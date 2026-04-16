import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_COLUMNS: Record<string, { attempt: string; expires: string; validity: number | null }> = {
  enrich_one:   { attempt: "last_attempt_at_one",   expires: "expires_at_one",   validity: 48 },
  enrich_two:   { attempt: "last_attempt_at_two",   expires: "expires_at_two",   validity: null },
  enrich_three: { attempt: "last_attempt_at_three", expires: "expires_at_three", validity: 48 },
  enrich_four:  { attempt: "last_attempt_at_four",  expires: "expires_at_four",  validity: 48 },
  enrich_five:  { attempt: "last_attempt_at_five",  expires: "expires_at_five",  validity: null },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "PATCH") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use PATCH." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Auth via Bearer token
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

  // Validate token — must be "Enriquecedor-leads"
  const { data: tokenRow, error: tokenError } = await supabase
    .from("api_tokens")
    .select("id, nome")
    .eq("token", token)
    .eq("ativo", true)
    .single();

  if (tokenError || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Invalid or expired token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (tokenRow.nome !== "Enriquecedor-leads") {
    return new Response(
      JSON.stringify({ error: "Forbidden. This token is not authorized for this endpoint." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Update last_used_at
  await supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  try {
    const body = await req.json();
    const { lead_id, column, status } = body;

    if (!lead_id || typeof lead_id !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid lead_id (UUID string required)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!column || !(column in VALID_COLUMNS)) {
      return new Response(
        JSON.stringify({ error: `Invalid column. Valid: ${Object.keys(VALID_COLUMNS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof status !== "boolean") {
      return new Response(
        JSON.stringify({ error: "status must be a boolean (true/false)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Horário do Brasil (UTC-3)
    const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const now = brNow.toISOString();
    const meta = VALID_COLUMNS[column];

    const expiresAt = status && meta.validity !== null
      ? new Date(brNow.getTime() + meta.validity * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const upsertData: Record<string, unknown> = {
      lead_id,
      [column]: status,
      [meta.attempt]: now,
      [meta.expires]: expiresAt,
    };

    const { error: upsertError } = await supabase
      .from("lead_enrichments")
      .upsert(upsertData, { onConflict: "lead_id" });

    if (upsertError) {
      console.error("[update-lead-enrichment] upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to update enrichment", detail: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[update-lead-enrichment] lead=${lead_id} ${column}=${status} expires=${expiresAt}`);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id,
        column,
        status,
        attempt_at: now,
        expires_at: expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[update-lead-enrichment] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
