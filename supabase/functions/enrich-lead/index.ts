import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseDateBR(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// Fields eligible for enrichment (never-overwrite-non-null policy)
const ENRICHABLE_FIELDS = [
  "rqe", "especialidade_id", "data_nascimento", "data_formatura",
  "cidade", "uf", "email", "endereco", "cep",
] as const;

// Fields that are ALWAYS overwritten when provided (even if already filled)
const OVERWRITE_FIELDS = ["crm", "nome"] as const;

// Pipeline → column mapping
const PIPELINE_ENRICH_COL: Record<string, string> = {
  enrich_v1: "enrich_one",
  enrich_residentes: "enrich_two",
  enrich_lemit: "enrich_three",
  enrich_lifeshub: "enrich_four",
  enrich_especialidade: "enrich_five",
};

const PIPELINE_ATTEMPT_COL: Record<string, string> = {
  enrich_v1: "last_attempt_at_one",
  enrich_residentes: "last_attempt_at_two",
  enrich_lemit: "last_attempt_at_three",
  enrich_lifeshub: "last_attempt_at_four",
  enrich_especialidade: "last_attempt_at_five",
};

const PIPELINE_EXPIRES_COL: Record<string, string> = {
  enrich_v1: "expires_at_one",
  enrich_residentes: "expires_at_two",
  enrich_lemit: "expires_at_three",
  enrich_lifeshub: "expires_at_four",
  enrich_especialidade: "expires_at_five",
};

// Pipeline → validity in months (null = no expiration)
const PIPELINE_VALIDITY: Record<string, number | null> = {
  enrich_v1: 48,
  enrich_residentes: null,
  enrich_lemit: 48,
  enrich_lifeshub: 48,
  enrich_especialidade: null,
};

const VALID_PIPELINES = Object.keys(PIPELINE_ENRICH_COL);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "PATCH" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use PATCH." }),
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
    const pathParts = url.pathname.split("/").filter(Boolean);
    const urlId = pathParts[pathParts.length - 1];
    const pathId = (urlId && urlId !== "enrich-lead") ? urlId : null;

    const payload = await req.json();
    const { id: bodyId, api_enrich_status, api_enrich_source, telefones, emails, pipeline: payloadPipeline, ...rest } = payload;

    const id = pathId ?? bodyId;
    const pipeline = payloadPipeline || "enrich_v1";

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: id (pass as URL path /enrich-lead/{id} or in the request body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_PIPELINES.includes(pipeline)) {
      return new Response(
        JSON.stringify({ error: `Unknown pipeline: ${pipeline}. Valid: ${VALID_PIPELINES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const statusMap: Record<string, string> = {
      "enriquecido": "concluido",
      "non-encontrado": "erro",
      "pendente": "pendente",
      "concluido": "concluido",
      "alimentado": "alimentado",
      "erro": "erro",
    };

    if (!api_enrich_status || !(api_enrich_status in statusMap)) {
      return new Response(
        JSON.stringify({ error: "api_enrich_status must be 'enriquecido', 'non-encontrado' or 'pendente'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolved_status = statusMap[api_enrich_status];
    const now = new Date().toISOString();

    // ========== FETCH CURRENT LEAD ==========
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("id, crm, rqe, especialidade_id, data_nascimento, data_formatura, cidade, uf, email, emails_adicionais, endereco, cep, phone_e164, telefones_adicionais")
      .eq("id", id)
      .single();

    if (fetchError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found", lead_id: id }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== BUILD LEAD UPDATE PAYLOAD ==========
    const update: Record<string, unknown> = {};
    const fields_updated: string[] = [];

    if (resolved_status === "concluido" || resolved_status === "alimentado") {
      for (const field of ENRICHABLE_FIELDS) {
        const incoming = rest[field as string];
        const current = (lead as Record<string, unknown>)[field];
        if (incoming !== undefined && incoming !== null && incoming !== "") {
          const isEmpty = current === null || current === undefined || current === "";
          if (isEmpty) {
            let valueToStore = incoming;
            if (field === "data_nascimento" && typeof incoming === "string") {
              valueToStore = parseDateBR(incoming) ?? incoming;
            }
            update[field] = valueToStore;
            fields_updated.push(field);
          }
        }
      }

      for (const field of OVERWRITE_FIELDS) {
        const incoming = rest[field as string];
        if (incoming !== undefined && incoming !== null && incoming !== "") {
          update[field] = incoming;
          fields_updated.push(field);
        }
      }

      if (Array.isArray(telefones) && telefones.length > 0) {
        const currentAdditional: string[] = lead.telefones_adicionais ?? [];
        const currentPrimary = lead.phone_e164 ?? "";
        const allExisting = new Set<string>(
          [currentPrimary, ...currentAdditional].map((t) => t.replace(/\D/g, "")).filter(Boolean)
        );
        const newPhones: string[] = [];
        for (const t of telefones) {
          const digits = String(t).replace(/\D/g, "");
          if (digits && !allExisting.has(digits)) {
            allExisting.add(digits);
            newPhones.push(t);
          }
        }
        if (newPhones.length > 0) {
          update["telefones_adicionais"] = [...currentAdditional, ...newPhones];
          fields_updated.push("telefones_adicionais");
        }
      }

      if (Array.isArray(emails) && emails.length > 0) {
        const currentEmailsAdicionais: string[] = lead.emails_adicionais ?? [];
        const currentEmailPrimary = lead.email ?? "";
        const allExistingEmails = new Set<string>(
          [currentEmailPrimary, ...currentEmailsAdicionais].map((e) => e.trim().toLowerCase()).filter(Boolean)
        );
        const newEmails: string[] = [];
        for (const e of emails) {
          const normalized = String(e).trim().toLowerCase();
          if (normalized && !allExistingEmails.has(normalized)) {
            allExistingEmails.add(normalized);
            newEmails.push(String(e).trim());
          }
        }
        if (newEmails.length > 0) {
          update["emails_adicionais"] = [...currentEmailsAdicionais, ...newEmails];
          fields_updated.push("emails_adicionais");
        }
      }
    }

    // ========== APPLY LEAD UPDATE (only if there are field changes) ==========
    if (Object.keys(update).length > 0) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(update)
        .eq("id", id);

      if (updateError) {
        console.error("[enrich-lead] Update error:", updateError);
        throw updateError;
      }
    }

    // ========== UPDATE lead_enrichments TABLE (column-based) ==========
    const isSuccess = resolved_status === "concluido" || resolved_status === "alimentado";
    const enrichCol = PIPELINE_ENRICH_COL[pipeline];
    const attemptCol = PIPELINE_ATTEMPT_COL[pipeline];
    const expiresCol = PIPELINE_EXPIRES_COL[pipeline];
    const validityMonths = PIPELINE_VALIDITY[pipeline];

    const expiresAt = isSuccess && validityMonths !== null
      ? new Date(Date.now() + validityMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const enrichmentData: Record<string, unknown> = {
      lead_id: id,
      [enrichCol]: isSuccess,
      [attemptCol]: now,
      [expiresCol]: expiresAt,
      // Keep general columns for logging
      status: resolved_status,
      source: api_enrich_source ?? null,
      completed_at: isSuccess ? now : null,
      error_message: resolved_status === "erro" ? (rest.error_message || "non-encontrado") : null,
      result_data: isSuccess ? rest : null,
    };

    const { error: enrichUpsertError } = await supabase
      .from("lead_enrichments")
      .upsert(enrichmentData, { onConflict: "lead_id" });

    if (enrichUpsertError) {
      console.warn("[enrich-lead] lead_enrichments upsert error:", enrichUpsertError.message);
    }

    // Junction table
    if (update.especialidade_id) {
      await supabase.from("lead_especialidades").upsert(
        { lead_id: id, especialidade_id: update.especialidade_id, fonte: "enrich" },
        { onConflict: "lead_id,especialidade_id" }
      ).then(r => { if (r.error) console.warn("[enrich-lead] junction upsert:", r.error.message); });
    }

    console.log(`[enrich-lead] Lead ${id} enriched. Status: ${resolved_status}. Pipeline: ${pipeline} (${enrichCol}). Fields: ${fields_updated.join(", ")}`);

    return new Response(
      JSON.stringify({
        success: true,
        action: "enriched",
        lead_id: id,
        pipeline,
        enrich_column: enrichCol,
        enrich_status: resolved_status,
        fields_updated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[enrich-lead] Internal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
