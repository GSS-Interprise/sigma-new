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

type EnrichableField = typeof ENRICHABLE_FIELDS[number];

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
    // ========== EXTRACT ID FROM URL PATH OR BODY ==========
    // Supports both:
    //   PATCH /enrich-lead/{id}   ← preferred (id from URL)
    //   PATCH /enrich-lead        ← legacy (id from body)
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const urlId = pathParts[pathParts.length - 1];
    // urlId will be "enrich-lead" if no path param was given
    const pathId = (urlId && urlId !== "enrich-lead") ? urlId : null;

    const payload = await req.json();
    const { id: bodyId, api_enrich_status, api_enrich_source, telefones, emails, ...rest } = payload;

    const id = pathId ?? bodyId;

    // ========== VALIDATE REQUIRED FIELDS ==========
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: id (pass as URL path /enrich-lead/{id} or in the request body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map display labels → internal DB values
    const statusMap: Record<string, string> = {
      "enriquecido": "concluido",
      "non-encontrado": "erro",
      "pendente": "pendente",
      // Also accept internal values directly for backwards compat
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

    // ========== FETCH CURRENT LEAD (by PK — O(1)) ==========
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

    // ========== BUILD UPDATE PAYLOAD ==========
    const update: Record<string, unknown> = {
      api_enrich_status: resolved_status,
      api_enrich_source: api_enrich_source ?? null,
      api_enrich_last_attempt: new Date().toISOString(),
    };

    const fields_updated: string[] = ["api_enrich_status", "api_enrich_last_attempt"];
    if (api_enrich_source) fields_updated.push("api_enrich_source");

    // If status is "erro", skip data enrichment
    // "concluido" and "alimentado" both apply enrichment
    if (resolved_status === "concluido" || resolved_status === "alimentado") {

      // ---- Never Overwrite Non-Null for enrichable fields ----
      for (const field of ENRICHABLE_FIELDS) {
        const incoming = rest[field as string];
        const current = (lead as Record<string, unknown>)[field];

        // Only fill if incoming has a value AND current is null/empty
        if (incoming !== undefined && incoming !== null && incoming !== "") {
          const isEmpty = current === null || current === undefined || current === "";
          if (isEmpty) {
            // Convert DD/MM/YYYY → YYYY-MM-DD for data_nascimento
            let valueToStore = incoming;
            if (field === "data_nascimento" && typeof incoming === "string") {
              valueToStore = parseDateBR(incoming) ?? incoming;
            }
            update[field] = valueToStore;
            fields_updated.push(field);
          }
        }
      }

      // ---- Always overwrite fields (e.g. crm) ----
      for (const field of OVERWRITE_FIELDS) {
        const incoming = rest[field as string];
        if (incoming !== undefined && incoming !== null && incoming !== "") {
          update[field] = incoming;
          fields_updated.push(field);
        }
      }

      // ---- Telefones: merge without duplicates ----
      if (Array.isArray(telefones) && telefones.length > 0) {
        const currentAdditional: string[] = lead.telefones_adicionais ?? [];
        const currentPrimary = lead.phone_e164 ?? "";

        const allExisting = new Set<string>(
          [currentPrimary, ...currentAdditional]
            .map((t) => t.replace(/\D/g, ""))
            .filter(Boolean)
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

      // ---- Emails: merge without duplicates ----
      if (Array.isArray(emails) && emails.length > 0) {
        const currentEmailsAdicionais: string[] = lead.emails_adicionais ?? [];
        const currentEmailPrimary = lead.email ?? "";

        const allExistingEmails = new Set<string>(
          [currentEmailPrimary, ...currentEmailsAdicionais]
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
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

    // ========== APPLY UPDATE ==========
    const { error: updateError } = await supabase
      .from("leads")
      .update(update)
      .eq("id", id);

    if (updateError) {
      console.error("[enrich-lead] Update error:", updateError);
      throw updateError;
    }

    console.log(`[enrich-lead] Lead ${id} enriched. Status: ${resolved_status}. Fields: ${fields_updated.join(", ")}`);

    return new Response(
      JSON.stringify({
        success: true,
        action: "enriched",
        lead_id: id,
        api_enrich_status: resolved_status,
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
