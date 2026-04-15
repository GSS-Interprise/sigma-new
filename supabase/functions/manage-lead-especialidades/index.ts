import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // --- Auth: validate Bearer token against api_tokens (nome = 'Enriquecedor-leads') ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokenRow } = await supabase
      .from("api_tokens")
      .select("id")
      .eq("token", token)
      .eq("nome", "Enriquecedor-leads")
      .eq("ativo", true)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "Invalid or inactive token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_used_at
    await supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

    // --- Parse & validate body ---
    const body = await req.json();

    if (!Array.isArray(body) || body.length === 0) {
      return new Response(JSON.stringify({ error: "Body must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows: { lead_id: string; especialidade_id: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < body.length; i++) {
      const item = body[i];
      if (!item.lead_id || !item.especialidade_id) {
        errors.push(`Item ${i}: missing lead_id or especialidade_id`);
        continue;
      }
      if (!UUID_RE.test(item.lead_id) || !UUID_RE.test(item.especialidade_id)) {
        errors.push(`Item ${i}: invalid UUID format`);
        continue;
      }
      rows.push({ lead_id: item.lead_id, especialidade_id: item.especialidade_id });
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid items", details: errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Upsert into lead_especialidades ---
    const { data, error } = await supabase
      .from("lead_especialidades")
      .upsert(rows, { onConflict: "lead_id,especialidade_id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error("Upsert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        inserted: data?.length ?? 0,
        total_received: body.length,
        ...(errors.length > 0 ? { validation_errors: errors } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
