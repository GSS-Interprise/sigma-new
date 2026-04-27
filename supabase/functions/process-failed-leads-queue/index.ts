import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 1000;

// =========================================================
// ABANDONMENT REASONS
// =========================================================
const REASON = {
  INVALID_PAYLOAD: "invalid_payload",
  PHONE_CONFLICT: "phone_conflict_unresolvable",
  LEAD_NOT_FOUND: "lead_not_found",
  MAX_RETRIES: "max_retries_exceeded",
  TIMEOUT: "timeout",
  UNKNOWN: "unknown_error",
} as const;

// =========================================================
// UTILIDADES (espelhadas do import-leads)
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

const INATIVO_PREFIX = "INATIVO:";
function getRawDigits(phone: string): string {
  const raw = phone.startsWith(INATIVO_PREFIX) ? phone.slice(INATIVO_PREFIX.length) : phone;
  return raw.replace(/\D/g, "");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

// =========================================================
// HANDLER
// =========================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========== VALIDAÇÃO DE TOKEN ==========
    const authHeader = req.headers.get("apikey") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: apikey header is required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staticToken = Deno.env.get("IMPORT_LEADS_TOKEN");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    let tokenValid = false;

    // Accept IMPORT_LEADS_TOKEN, SUPABASE_ANON_KEY (for internal cron calls), or api_tokens table
    if (staticToken && authHeader === staticToken) {
      tokenValid = true;
    } else if (anonKey && authHeader === anonKey) {
      tokenValid = true; // Internal pg_cron calls use the anon key
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

    // ========== BUSCAR ITENS DA FILA ==========
    const { data: queueItems, error: fetchError } = await supabase
      .from("import_leads_failed_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .lt("attempts", MAX_ATTEMPTS + 1)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[process-queue] Erro ao buscar fila:", fetchError);
      throw fetchError;
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Fila vazia" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-queue] Processando ${queueItems.length} itens da fila`);

    // Marcar como em processamento
    const ids = queueItems.map((i: any) => i.id);
    await supabase
      .from("import_leads_failed_queue")
      .update({ status: "processing" })
      .in("id", ids);

    const results = { resolved: 0, failed: 0, abandoned: 0 };

    for (const item of queueItems) {
      try {
        const payload = item.payload as Record<string, any>;
        const nome = (payload.nome || payload.name || "").trim();
        const cpfRaw = (payload.cpf || "").trim();
        const cpfClean = cpfRaw ? cleanCpf(cpfRaw) : "";
        const cnpjRaw = (payload.cnpj || "").trim();
        const cnpjClean = cnpjRaw ? cleanCpf(cnpjRaw) : "";

        // Detectar se "cpf" na verdade é CNPJ (14 dígitos)
        let isCnpj = cnpjClean.length === 14;
        let effectiveCpfClean = cpfClean;
        if (!isCnpj && cpfClean.length === 14) {
          isCnpj = true;
          effectiveCpfClean = "";
        }
        const finalCnpjClean = isCnpj ? (cnpjClean.length === 14 ? cnpjClean : cpfClean) : "";
        const finalCnpjRaw = isCnpj ? (cnpjRaw || cpfRaw) : "";

        // Payload inválido → abandonar imediatamente (precisa de nome + algum documento OU nome)
        if (!nome) {
          await supabase
            .from("import_leads_failed_queue")
            .update({
              status: "abandoned",
              error_message: "Payload inválido: nome ausente",
              abandonment_reason: REASON.INVALID_PAYLOAD,
            })
            .eq("id", item.id);
          results.abandoned++;
          console.warn(`[process-queue] Item ${item.id} abandonado: payload inválido`);
          continue;
        }

        // Buscar lead por CPF, CNPJ ou nome
        let existingLead: any = null;

        if (effectiveCpfClean && effectiveCpfClean.length === 11) {
          // Busca por CPF
          const cpfFormatado = `${effectiveCpfClean.slice(0,3)}.${effectiveCpfClean.slice(3,6)}.${effectiveCpfClean.slice(6,9)}-${effectiveCpfClean.slice(9,11)}`;
          const cpfVariants = [...new Set([cpfRaw, effectiveCpfClean, cpfFormatado].filter(Boolean) as string[])];
          const orFilter = cpfVariants.map(v => `cpf.eq.${v}`).join(",");

          const { data: leadRows } = await supabase
            .from("leads")
            .select("*")
            .or(orFilter)
            .limit(1);
          existingLead = leadRows && leadRows.length > 0 ? leadRows[0] : null;
        } else if (finalCnpjClean && finalCnpjClean.length === 14) {
          // Busca por CNPJ
          const cnpjFormatado = `${finalCnpjClean.slice(0,2)}.${finalCnpjClean.slice(2,5)}.${finalCnpjClean.slice(5,8)}/${finalCnpjClean.slice(8,12)}-${finalCnpjClean.slice(12)}`;
          const cnpjVariants = [...new Set([finalCnpjRaw, finalCnpjClean, cnpjFormatado].filter(Boolean) as string[])];
          const orFilter = cnpjVariants.map(v => `cnpj.eq.${v}`).join(",");

          const { data: leadRows } = await supabase
            .from("leads")
            .select("*")
            .or(orFilter)
            .limit(1);
          existingLead = leadRows && leadRows.length > 0 ? leadRows[0] : null;

          // Fallback: buscar por nome se CNPJ não encontrado
          if (!existingLead && nome) {
            const { data: nameRows } = await supabase
              .from("leads")
              .select("*")
              .ilike("nome", nome)
              .limit(1);
            existingLead = nameRows && nameRows.length > 0 ? nameRows[0] : null;
            if (existingLead) {
              console.log(`[process-queue] CNPJ não encontrado, mas nome "${nome}" encontrado: ${existingLead.id}`);
            }
          }
        } else if (nome) {
          // Sem documento válido — buscar por nome
          const { data: nameRows } = await supabase
            .from("leads")
            .select("*")
            .ilike("nome", nome)
            .limit(1);
          existingLead = nameRows && nameRows.length > 0 ? nameRows[0] : null;
        }

        if (!existingLead) {
          // ======== CRIAR LEAD NOVO (espelha lógica do import-leads) ========
          if (!effectiveCpfClean && !finalCnpjClean) {
            // Sem documento e sem match por nome → abandonar
            await supabase
              .from("import_leads_failed_queue")
              .update({
                status: "abandoned",
                error_message: "Lead não encontrado e sem CPF/CNPJ para criar",
                abandonment_reason: REASON.LEAD_NOT_FOUND,
              })
              .eq("id", item.id);
            results.abandoned++;
            console.warn(`[process-queue] Item ${item.id} abandonado: sem documento para criar`);
            continue;
          }

          const now = new Date().toISOString();
          const newLeadData: Record<string, any> = {
            nome,
            status: "Novo",
            origem: payload.source || payload.pipeline || "API Import",
            created_at: now,
            updated_at: now,
          };

          if (effectiveCpfClean) newLeadData.cpf = cpfRaw;
          if (finalCnpjClean) newLeadData.cnpj = finalCnpjRaw;
          if (payload.cidade) newLeadData.cidade = payload.cidade;
          if (payload.uf) newLeadData.uf = String(payload.uf).toUpperCase().substring(0, 2);
          if (payload.crm) newLeadData.crm = payload.crm;
          if (payload.rqe) newLeadData.rqe = payload.rqe;
          if (payload.email) newLeadData.email = payload.email;
          if (payload.endereco) newLeadData.endereco = payload.endereco;

          const cep = payload.endereco ? extractCep(payload.endereco) : null;
          if (cep) newLeadData.cep = cep;

          const dataNasc = payload.data_nascimento ? parseDateBR(payload.data_nascimento) : null;
          if (dataNasc) newLeadData.data_nascimento = dataNasc;

          // Especialidade
          const espNome = (payload.especialidades_crua || payload.especialidade || "").trim().toUpperCase();
          if (espNome) {
            const { data: espMatch } = await supabase
              .from("especialidades")
              .select("id")
              .eq("nome", espNome)
              .limit(1)
              .maybeSingle();
            if (espMatch) newLeadData.especialidade_id = espMatch.id;
          }

          // Telefones
          const newPhones = (payload.telefones || []) as string[];
          if (!newPhones.length && payload.phone) newPhones.push(payload.phone);
          const newPhonesE164 = newPhones.map((t: string) => normalizePhone(t)).filter((p): p is string => p !== null);
          const newPrimary = newPhonesE164[0] || null;

          if (newPrimary) {
            const { data: phoneConflict } = await supabase
              .from("leads")
              .select("id")
              .eq("phone_e164", newPrimary)
              .maybeSingle();
            if (!phoneConflict) {
              newLeadData.phone_e164 = newPrimary;
              if (newPhonesE164.length > 1) newLeadData.telefones_adicionais = newPhonesE164.slice(1);
            } else {
              newLeadData.telefones_adicionais = newPhonesE164;
            }
          }

          // Emails
          const newEmails = (payload.emails || []) as string[];
          if (!newEmails.length && payload.email) newEmails.push(payload.email);
          const validEmails = newEmails.map((e: string) => e.trim().toLowerCase()).filter(isValidEmail);
          if (validEmails[0]) newLeadData.email = validEmails[0];

          // Tags
          if (payload.tags && Array.isArray(payload.tags)) newLeadData.tags = payload.tags;

          const { data: created, error: createError } = await supabase
            .from("leads")
            .insert([newLeadData])
            .select("id")
            .single();

          if (createError) {
            console.error(`[process-queue] Erro ao criar lead:`, createError);
            const newAttempts = item.attempts + 1;
            if (newAttempts > MAX_ATTEMPTS) {
              await supabase.from("import_leads_failed_queue").update({
                status: "abandoned", attempts: newAttempts,
                error_code: createError.code, error_message: createError.message,
                abandonment_reason: createError.code === "23505" ? REASON.PHONE_CONFLICT : REASON.MAX_RETRIES,
              }).eq("id", item.id);
              results.abandoned++;
            } else {
              await supabase.from("import_leads_failed_queue").update({
                status: "pending", attempts: newAttempts,
                next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                error_code: createError.code, error_message: createError.message,
              }).eq("id", item.id);
              results.failed++;
            }
            continue;
          }

          // Sucesso — lead criado
          // Enriquecimento → tabela dedicada lead_enrichments
          {
            const enrichStatusToInsert = (payload.api_enrich_status as string) || "pendente";
            const isEnriched = enrichStatusToInsert === "concluido" || enrichStatusToInsert === "alimentado";
            const expiresAtOne = isEnriched
              ? new Date(Date.now() + 48 * 30 * 24 * 60 * 60 * 1000).toISOString()
              : null;
            await supabase.from("lead_enrichments").upsert(
              {
                lead_id: created.id,
                enrich_one: isEnriched,
                last_attempt_at_one: now,
                expires_at_one: expiresAtOne,
                status: enrichStatusToInsert,
                source: payload.api_enrich_source || null,
                completed_at: isEnriched ? now : null,
              },
              { onConflict: "lead_id" }
            ).then(r => { if (r.error) console.warn("[process-queue] lead_enrichments upsert:", r.error.message); });
          }
          await supabase.from("import_leads_failed_queue").update({
            status: "resolved", resolved_at: now, lead_id: created.id,
          }).eq("id", item.id);
          results.resolved++;
          console.log(`[process-queue] Novo lead criado ${created.id} (item ${item.id})`);
          continue;
        }

        // Telefones
        const telefones: string[] = payload.telefones || [];
        if (!telefones.length && payload.phone) telefones.push(payload.phone);
        const phonesE164 = telefones.map((t: string) => normalizePhone(t)).filter((p): p is string => p !== null);
        const primaryPhone = phonesE164[0] || null;

        // Montar atualização — NÃO atribuir phone_e164 se houver conflito
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

        if (primaryPhone && !existingLead.phone_e164) {
          const { data: phoneConflict } = await supabase
            .from("leads")
            .select("id")
            .eq("phone_e164", primaryPhone)
            .neq("id", existingLead.id)
            .maybeSingle();

          if (!phoneConflict) {
            updateData.phone_e164 = primaryPhone;
          } else {
            console.warn(`[process-queue] phone_e164 ${primaryPhone} conflitante para lead ${existingLead.id} — movendo para adicionais`);
          }
        }

        // Merge de telefones adicionais
        if (phonesE164.length > 0) {
          const existingDigits = new Set<string>();
          if (existingLead.phone_e164) existingDigits.add(getRawDigits(existingLead.phone_e164));
          const existingAdicionais: string[] = existingLead.telefones_adicionais || [];
          existingAdicionais.forEach((p: string) => existingDigits.add(getRawDigits(p)));

          const toAdd = phonesE164.filter(p => !existingDigits.has(getRawDigits(p)));
          if (toAdd.length > 0) {
            updateData.telefones_adicionais = [...existingAdicionais, ...toAdd];
          }
        }

        // Campos escalares
        if (finalCnpjClean) updateData.cnpj = finalCnpjRaw;
        if (effectiveCpfClean) updateData.cpf = cpfRaw;
        if (payload.cidade) updateData.cidade = payload.cidade;
        if (payload.uf) updateData.uf = payload.uf.toUpperCase().substring(0, 2);
        if (payload.crm) updateData.crm = payload.crm;
        if (payload.rqe) updateData.rqe = payload.rqe;
        if (payload.email) updateData.email = payload.email;
        if (payload.source) updateData.origem = payload.source;

        const { error: updateError } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", existingLead.id);

        if (updateError) {
          console.error(`[process-queue] Erro ao atualizar lead ${existingLead.id}:`, updateError);
          const newAttempts = item.attempts + 1;

          if (newAttempts > MAX_ATTEMPTS) {
            // Determinar razão de abandono
            let abandonmentReason: string = REASON.MAX_RETRIES;
            if (updateError.code === "23505") abandonmentReason = REASON.PHONE_CONFLICT;

            await supabase
              .from("import_leads_failed_queue")
              .update({
                status: "abandoned",
                attempts: newAttempts,
                error_code: updateError.code,
                error_message: updateError.message,
                abandonment_reason: abandonmentReason,
              })
              .eq("id", item.id);
            results.abandoned++;
            console.warn(`[process-queue] Item ${item.id} abandonado após ${newAttempts} tentativas — razão: ${abandonmentReason}`);
          } else {
            // Backoff incremental: 5min, 20min, 60min
            const backoffMinutes = [5, 20, 60];
            const delayMs = (backoffMinutes[newAttempts - 1] || 60) * 60 * 1000;
            const nextRetry = new Date(Date.now() + delayMs).toISOString();
            await supabase
              .from("import_leads_failed_queue")
              .update({
                status: "pending",
                attempts: newAttempts,
                next_retry_at: nextRetry,
                error_code: updateError.code,
                error_message: updateError.message,
              })
              .eq("id", item.id);
            results.failed++;
          }
        } else {
          // Sucesso
          // Enriquecimento → lead_enrichments (se vier no payload)
          if (payload.api_enrich_status || payload.api_enrich_source) {
            const nowIso = new Date().toISOString();
            const enrichStatusToInsert = (payload.api_enrich_status as string) || "pendente";
            const isEnriched = enrichStatusToInsert === "concluido" || enrichStatusToInsert === "alimentado";
            const expiresAtOne = isEnriched
              ? new Date(Date.now() + 48 * 30 * 24 * 60 * 60 * 1000).toISOString()
              : null;
            await supabase.from("lead_enrichments").upsert(
              {
                lead_id: existingLead.id,
                enrich_one: isEnriched,
                last_attempt_at_one: nowIso,
                expires_at_one: expiresAtOne,
                status: enrichStatusToInsert,
                source: payload.api_enrich_source || null,
                completed_at: isEnriched ? nowIso : null,
              },
              { onConflict: "lead_id" }
            ).then(r => { if (r.error) console.warn("[process-queue] lead_enrichments upsert:", r.error.message); });
          }
          await supabase
            .from("import_leads_failed_queue")
            .update({
              status: "resolved",
              resolved_at: new Date().toISOString(),
              lead_id: existingLead.id,
            })
            .eq("id", item.id);
          results.resolved++;
          console.log(`[process-queue] Lead ${existingLead.id} resolvido com sucesso (item ${item.id})`);
        }

      } catch (err: any) {
        console.error(`[process-queue] Erro inesperado no item ${item.id}:`, err);
        const newAttempts = item.attempts + 1;

        if (newAttempts > MAX_ATTEMPTS) {
          await supabase
            .from("import_leads_failed_queue")
            .update({
              status: "abandoned",
              attempts: newAttempts,
              error_message: err.message,
              abandonment_reason: REASON.MAX_RETRIES,
            })
            .eq("id", item.id);
          results.abandoned++;
        } else {
          await supabase
            .from("import_leads_failed_queue")
            .update({
              status: "pending",
              attempts: newAttempts,
              next_retry_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              error_message: err.message,
            })
            .eq("id", item.id);
          results.failed++;
        }
      }
    }

    console.log(`[process-queue] Resultado final: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({ success: true, processed: queueItems.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[process-queue] Erro interno:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
