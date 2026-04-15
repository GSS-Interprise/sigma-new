import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AbortController timeout: 8s — responde antes do limite de 150s do Edge Runtime
const PROCESSING_TIMEOUT_MS = 8000;

// =========================================================
// UTILIDADES
// =========================================================

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits;
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits;
  return null;
}

function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function parseDateBR(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractCep(endereco: string): string | null {
  if (!endereco) return null;
  const match = endereco.match(/(\d{5}-?\d{3})\s*$/);
  return match ? match[1] : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const INATIVO_PREFIX = "INATIVO:";
function getRawDigits(phone: string): string {
  const raw = phone.startsWith(INATIVO_PREFIX) ? phone.slice(INATIVO_PREFIX.length) : phone;
  return raw.replace(/\D/g, "");
}

// Enfileira payload para retry posterior com abandonment_reason
async function enqueueForRetry(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  payload: Record<string, any>,
  errorCode: string,
  errorMessage: string,
  abandonmentReason?: string,
) {
  const { error } = await supabase.from("import_leads_failed_queue").insert({
    payload,
    error_code: errorCode,
    error_message: errorMessage,
    status: "pending",
    next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    abandonment_reason: abandonmentReason ?? null,
  });
  if (error) {
    console.error("[import-leads] Falha ao enfileirar para retry:", error);
  }
}

// =========================================================
// TIPOS
// =========================================================

interface ImportLeadPayload {
  nome?: string;
  cpf?: string;
  cnpj?: string;
  especialidades_crua?: string;
  data_nascimento?: string;
  cidade?: string;
  uf?: string;
  telefones?: string[];
  emails?: string[];
  endereco?: string;
  tags?: string[];
  observacoes?: string;
  source?: string;
  crm?: string;
  rqe?: string;
  // Formato legado
  name?: string;
  email?: string;
  phone?: string;
  especialidade?: string;
  pipeline?: string;
}

// =========================================================
// LÓGICA PRINCIPAL (extraída para permitir AbortController)
// =========================================================

// deno-lint-ignore no-explicit-any
async function processImport(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  payload: ImportLeadPayload,
): Promise<Response> {
  // ========== NORMALIZAR PAYLOAD ==========
  const nome = (payload.nome || payload.name || "").trim();
  const cpfRaw = (payload.cpf || "").trim();
  const cpfClean = cpfRaw ? cleanCpf(cpfRaw) : "";
  const cnpjRaw = (payload.cnpj || "").trim();
  const cnpjClean = cnpjRaw ? cleanCpf(cnpjRaw) : "";

  // Detectar se o campo "cpf" na verdade contém um CNPJ (14 dígitos)
  let isCnpj = cnpjClean.length === 14;
  let effectiveCpfClean = cpfClean;
  let effectiveCpfRaw = cpfRaw;

  if (!isCnpj && cpfClean.length === 14) {
    // Campo cpf veio com 14 dígitos → é CNPJ
    isCnpj = true;
    effectiveCpfClean = "";
    effectiveCpfRaw = "";
  }

  const finalCnpjClean = isCnpj ? (cnpjClean.length === 14 ? cnpjClean : cpfClean) : "";
  const finalCnpjRaw = isCnpj ? (cnpjRaw || cpfRaw) : "";

  const telefones: string[] = payload.telefones || [];
  if (!telefones.length && payload.phone) telefones.push(payload.phone);

  const emailsList: string[] = payload.emails || [];
  if (!emailsList.length && payload.email) emailsList.push(payload.email);

  // ========== VALIDAÇÃO ==========
  if (!nome) {
    return new Response(
      JSON.stringify({ error: "nome is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Precisa de CPF ou CNPJ
  if (!effectiveCpfClean && !finalCnpjClean) {
    // Sem documento — tentar buscar por nome antes de rejeitar
    const { data: nameMatches } = await supabase
      .from("leads")
      .select("id, nome")
      .ilike("nome", nome)
      .limit(1);

    if (nameMatches && nameMatches.length > 0) {
      console.log(`[import-leads] Sem CPF/CNPJ, mas nome exato encontrado: ${nameMatches[0].id}`);
      // Tratar como update do lead encontrado por nome
      // Continuar com o fluxo existente usando o lead encontrado
    } else {
      return new Response(
        JSON.stringify({ error: "cpf or cnpj is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  if (effectiveCpfClean && effectiveCpfClean.length !== 11) {
    return new Response(
      JSON.stringify({ error: "cpf must have 11 digits" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (finalCnpjClean && finalCnpjClean.length !== 14) {
    return new Response(
      JSON.stringify({ error: "cnpj must have 14 digits" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ========== PREPARAR DADOS ==========
  const phonesE164 = telefones
    .map(t => normalizePhone(t))
    .filter((p): p is string => p !== null);

  const primaryPhone = phonesE164[0] || null;
  const additionalPhones = phonesE164.slice(1);

  const validEmails = emailsList
    .map(e => e.trim().toLowerCase())
    .filter(e => isValidEmail(e));

  const primaryEmail = validEmails[0] || null;
  const dataNascimento = payload.data_nascimento ? parseDateBR(payload.data_nascimento) : null;
  const cep = payload.endereco ? extractCep(payload.endereco) : null;

  // ========== BUSCAR LEAD POR CPF OU CNPJ ==========
  let existingLead: any = null;

  if (effectiveCpfClean) {
    // Busca por CPF (fluxo original)
    const cpfFormatado = `${effectiveCpfClean.slice(0,3)}.${effectiveCpfClean.slice(3,6)}.${effectiveCpfClean.slice(6,9)}-${effectiveCpfClean.slice(9,11)}`;
    const cpfVariants = [...new Set([effectiveCpfRaw, effectiveCpfClean, cpfFormatado].filter(Boolean) as string[])];
    const orFilter = cpfVariants.map(v => `cpf.eq.${v}`).join(",");

    const { data: existingLeads, error: searchError } = await supabase
      .from("leads")
      .select("id, nome, cpf, phone_e164, telefones_adicionais, email, tags, observacoes, especialidade_id, cidade, uf, origem, status")
      .or(orFilter)
      .limit(1);

    if (searchError) {
      console.error("[import-leads] Erro ao buscar por CPF:", searchError);
      await enqueueForRetry(supabase, payload as any, searchError.code, searchError.message, "unknown_error");
      return new Response(
        JSON.stringify({ success: false, action: "queued", message: "Erro na busca CPF — enfileirado para retry" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    existingLead = existingLeads && existingLeads.length > 0 ? existingLeads[0] : null;
    console.log(`[import-leads] Busca CPF: ${cpfVariants.join(" | ")} → ${existingLead ? "encontrado " + existingLead.id : "não encontrado"}`);
  } else if (finalCnpjClean) {
    // Busca por CNPJ
    const cnpjFormatado = `${finalCnpjClean.slice(0,2)}.${finalCnpjClean.slice(2,5)}.${finalCnpjClean.slice(5,8)}/${finalCnpjClean.slice(8,12)}-${finalCnpjClean.slice(12)}`;
    const cnpjVariants = [...new Set([finalCnpjRaw, finalCnpjClean, cnpjFormatado].filter(Boolean) as string[])];
    const orFilter = cnpjVariants.map(v => `cnpj.eq.${v}`).join(",");

    const { data: existingLeads, error: searchError } = await supabase
      .from("leads")
      .select("id, nome, cnpj, phone_e164, telefones_adicionais, email, tags, observacoes, especialidade_id, cidade, uf, origem, status")
      .or(orFilter)
      .limit(1);

    if (searchError) {
      console.error("[import-leads] Erro ao buscar por CNPJ:", searchError);
      await enqueueForRetry(supabase, payload as any, searchError.code, searchError.message, "unknown_error");
      return new Response(
        JSON.stringify({ success: false, action: "queued", message: "Erro na busca CNPJ — enfileirado para retry" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    existingLead = existingLeads && existingLeads.length > 0 ? existingLeads[0] : null;

    // Se CNPJ não encontrou, tentar por nome
    if (!existingLead) {
      const { data: nameMatches } = await supabase
        .from("leads")
        .select("id, nome, cnpj, phone_e164, telefones_adicionais, email, tags, observacoes, especialidade_id, cidade, uf, origem, status")
        .ilike("nome", nome)
        .limit(1);

      if (nameMatches && nameMatches.length > 0) {
        existingLead = nameMatches[0];
        console.log(`[import-leads] CNPJ não encontrado, mas nome "${nome}" encontrado: ${existingLead.id}`);
      }
    }
    console.log(`[import-leads] Busca CNPJ: ${finalCnpjClean} → ${existingLead ? "encontrado " + existingLead.id : "não encontrado"}`);
  }

  const now = new Date().toISOString();

  // ========== MAPEAR ESPECIALIDADE_ID ==========
  let especialidadeId: string | null = null;
  const espNome = (payload.especialidades_crua || payload.especialidade || "").trim().toUpperCase();
  if (espNome) {
    const { data: espMatch } = await supabase
      .from("especialidades")
      .select("id")
      .eq("nome", espNome)
      .limit(1)
      .maybeSingle();

    if (espMatch) especialidadeId = espMatch.id;
  }

  // ========== MONTAR DADOS DO LEAD ==========
  const leadData: Record<string, any> = {
    nome,
    updated_at: now,
  };

  // Atribuir CPF ou CNPJ conforme o tipo de documento
  if (effectiveCpfClean) {
    leadData.cpf = effectiveCpfRaw;
  }
  if (finalCnpjClean) {
    leadData.cnpj = finalCnpjRaw;
  }

  if (especialidadeId) leadData.especialidade_id = especialidadeId;

  // Fix UPDATE path: verificar conflito de phone_e164 ANTES de atribuir
  // Evita violação da constraint UNIQUE (error 23505) no UPDATE
  if (primaryPhone && !existingLead?.phone_e164) {
    const { data: phoneConflictUpdate } = await supabase
      .from("leads")
      .select("id")
      .eq("phone_e164", primaryPhone)
      .neq("id", existingLead?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (!phoneConflictUpdate) {
      leadData.phone_e164 = primaryPhone;
    } else {
      console.warn(`[import-leads] phone_e164 ${primaryPhone} já pertence ao lead ${phoneConflictUpdate.id} — não atribuindo ao lead ${existingLead?.id ?? "novo"}`);
    }
  }

  if (primaryEmail) leadData.email = primaryEmail;
  if (payload.cidade) leadData.cidade = payload.cidade;
  if (payload.uf) leadData.uf = payload.uf.toUpperCase().substring(0, 2);
  if (payload.endereco) leadData.endereco = payload.endereco;
  if (cep) leadData.cep = cep;
  if (dataNascimento) leadData.data_nascimento = dataNascimento;
  if (payload.source) leadData.origem = payload.source;
  if (payload.crm) leadData.crm = payload.crm;
  if (payload.rqe) leadData.rqe = payload.rqe;

  // Enriquecimento API — agora salvo em lead_enrichments (não mais na tabela leads)
  const enrichStatus = payload.api_enrich_status || null;
  const enrichSource = payload.api_enrich_source || null;

  // Merge de telefones
  if (phonesE164.length > 0 && existingLead) {
    const existingDigits = new Set<string>();
    if (existingLead.phone_e164) existingDigits.add(getRawDigits(existingLead.phone_e164));
    const existingAdicionais: string[] = existingLead.telefones_adicionais || [];
    existingAdicionais.forEach(p => existingDigits.add(getRawDigits(p)));

    const toAdd = phonesE164.filter(p => !existingDigits.has(getRawDigits(p)));
    if (toAdd.length > 0) {
      leadData.telefones_adicionais = [...existingAdicionais, ...toAdd];
    }
  } else if (phonesE164.length > 0 && !existingLead) {
    if (additionalPhones.length > 0) {
      leadData.telefones_adicionais = additionalPhones;
    }
  }

  // Merge de tags
  if (payload.tags && Array.isArray(payload.tags) && payload.tags.length > 0) {
    if (existingLead) {
      const existing = existingLead.tags || [];
      leadData.tags = [...new Set([...existing, ...payload.tags])];
    } else {
      leadData.tags = payload.tags;
    }
  }

  // especialidades_crua → campo RQE
  if (payload.especialidades_crua && !leadData.rqe) {
    leadData.rqe = payload.especialidades_crua;
  }

  // Observações (append)
  if (payload.observacoes) {
    if (existingLead?.observacoes) {
      leadData.observacoes = `${existingLead.observacoes}\n---\n[${now}] ${payload.observacoes}`;
    } else {
      leadData.observacoes = payload.observacoes;
    }
  }

  // ========== UPSERT ==========
  if (existingLead) {
    // UPDATE
    console.log(`[import-leads] Lead existente por CPF: ${existingLead.id}`);

    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update(leadData)
      .eq("id", existingLead.id)
      .select("id, nome, email, phone_e164, status, origem, cpf, cidade, uf")
      .single();

    if (updateError) {
      console.error("[import-leads] Erro ao atualizar:", updateError);

      // Capturar qualquer erro no UPDATE e enfileirar com abandonment_reason para diagnóstico
      let abandonmentReason = "unknown_error";
      if (updateError.code === "23505") abandonmentReason = "phone_conflict_unresolvable";

      await enqueueForRetry(supabase, payload as any, updateError.code, updateError.message, abandonmentReason);

      return new Response(
        JSON.stringify({
          success: false,
          action: "queued",
          message: `Lead enfileirado para retry: ${updateError.message}`,
          error_code: updateError.code,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Popular junction table de especialidades
    if (especialidadeId) {
      await supabase.from("lead_especialidades").upsert(
        { lead_id: updated.id, especialidade_id: especialidadeId, fonte: "import" },
        { onConflict: "lead_id,especialidade_id" }
      ).then(r => { if (r.error) console.warn("[import-leads] junction upsert:", r.error.message); });
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "updated",
        message: `Lead atualizado: ${updated.id}`,
        lead: updated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } else {
    // INSERT
    console.log(`[import-leads] Criando novo lead CPF: ${cpfRaw}`);

    leadData.status = "Novo";
    leadData.origem = payload.source || "API Import";
    leadData.created_at = now;

    // Verificar conflito de phone_e164 antes de inserir
    if (leadData.phone_e164) {
      const { data: phoneConflict } = await supabase
        .from("leads")
        .select("id")
        .eq("phone_e164", leadData.phone_e164)
        .maybeSingle();

      if (phoneConflict) {
        console.warn(`[import-leads] phone_e164 ${leadData.phone_e164} já pertence ao lead ${phoneConflict.id} — omitindo do novo lead CPF: ${cpfRaw}`);
        delete leadData.phone_e164;
        const existingAdicionais: string[] = leadData.telefones_adicionais || [];
        if (!existingAdicionais.includes(primaryPhone!)) {
          leadData.telefones_adicionais = [primaryPhone!, ...existingAdicionais];
        }
      }
    }

    const { data: created, error: createError } = await supabase
      .from("leads")
      .insert([leadData])
      .select("id, nome, email, phone_e164, status, origem, cpf, cidade, uf")
      .single();

    if (createError) {
      console.error("[import-leads] Erro ao criar:", createError);

      if (createError.code === "23505") {
        await enqueueForRetry(supabase, payload as any, createError.code, createError.message, "phone_conflict_unresolvable");
        return new Response(
          JSON.stringify({ success: false, action: "queued", message: "Conflito de dados — enfileirado para retry", code: "DUPLICATE" }),
          { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw createError;
    }

    // Popular junction table de especialidades
    if (especialidadeId) {
      await supabase.from("lead_especialidades").upsert(
        { lead_id: created.id, especialidade_id: especialidadeId, fonte: "import" },
        { onConflict: "lead_id,especialidade_id" }
      ).then(r => { if (r.error) console.warn("[import-leads] junction upsert:", r.error.message); });
    }

    // Inserir status de enriquecimento na tabela lead_enrichments
    const enrichStatusToInsert = enrichStatus || "pendente";
    await supabase.from("lead_enrichments").upsert(
      {
        lead_id: created.id,
        pipeline: "enrich_v1",
        status: enrichStatusToInsert,
        source: enrichSource,
        last_attempt_at: now,
      },
      { onConflict: "lead_id,pipeline" }
    ).then(r => { if (r.error) console.warn("[import-leads] lead_enrichments upsert:", r.error.message); });

    // If already enriched, update lead_enrichments with completed_at and expires_at
    if (enrichStatusToInsert === "concluido" || enrichStatusToInsert === "alimentado") {
      const expiresAt = new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("lead_enrichments").upsert(
        {
          lead_id: created.id,
          pipeline: "enrich_v1",
          status: enrichStatusToInsert,
          source: enrichSource,
          last_attempt_at: now,
          completed_at: now,
          expires_at: expiresAt,
        },
        { onConflict: "lead_id,pipeline" }
      ).then(r => { if (r.error) console.warn("[import-leads] lead_enrichments completed upsert:", r.error.message); });
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "created",
        message: `Novo lead criado: ${created.id}`,
        lead: created,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// =========================================================
// HANDLER PRINCIPAL
// =========================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========== VALIDAÇÃO DE TOKEN (fast-path via secret env) ==========
    const authHeader = req.headers.get("apikey") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: apikey header is required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staticToken = Deno.env.get("IMPORT_LEADS_TOKEN");
    let tokenValid = false;
    if (staticToken && authHeader === staticToken) {
      tokenValid = true;
    } else {
      const tokenId = await supabase.rpc("validate_api_token", { _token: authHeader });
      tokenValid = !!tokenId.data;
    }

    if (!tokenValid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: ImportLeadPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== AbortController: 8s timeout ==========
    // Se processamento demorar mais que PROCESSING_TIMEOUT_MS, enfileira e retorna 202
    // antes de atingir o limite de 150s do Edge Runtime (504 Gateway Timeout)
    let timeoutFired = false;
    const timeoutId = setTimeout(() => { timeoutFired = true; }, PROCESSING_TIMEOUT_MS);

    const processingPromise = processImport(supabase, payload);

    const timeoutPromise = new Promise<Response>((resolve) => {
      setTimeout(async () => {
        console.warn(`[import-leads] Timeout de ${PROCESSING_TIMEOUT_MS}ms atingido — enfileirando para retry`);
        await enqueueForRetry(
          supabase,
          payload as any,
          "TIMEOUT",
          `Processamento excedeu ${PROCESSING_TIMEOUT_MS}ms`,
          "timeout",
        );
        resolve(new Response(
          JSON.stringify({
            success: false,
            action: "queued",
            message: "Timeout de processamento — lead enfileirado para retry",
          }),
          { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        ));
      }, PROCESSING_TIMEOUT_MS);
    });

    const result = await Promise.race([processingPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;

  } catch (error: any) {
    console.error("[import-leads] Erro interno:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
