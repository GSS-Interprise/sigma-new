import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_EXECUTION_MS = 50_000;
const SEND_TIMEOUT_MS = 15_000;
const LOCK_DURATION_S = 90;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { campanha_id } = await req.json();
    if (!campanha_id) throw new Error("campanha_id obrigatório");

    // ── Buscar campanha ──
    const { data: camp, error: campErr } = await supabase
      .from("campanhas")
      .select("*")
      .eq("id", campanha_id)
      .single();

    if (campErr || !camp) throw new Error("Campanha não encontrada");
    if (["pausada", "finalizada", "arquivada"].includes(camp.status))
      return json({ ok: true, msg: `Campanha ${camp.status}` });

    // ── Lock atômico ──
    if (camp.status !== "ativa" && camp.status !== "rascunho")
      return json({ ok: true, msg: "Status incompatível" });

    if (camp.next_batch_at) {
      const nextTime = new Date(camp.next_batch_at).getTime();
      if (nextTime > Date.now()) {
        const waitMs = Math.min(nextTime - Date.now(), 23_000);
        await sleep(waitMs);
        selfInvoke(supabase, campanha_id);
        return json({ ok: true, msg: "Aguardando próximo lote" });
      }
    }

    const lockUntil = new Date(
      Date.now() + LOCK_DURATION_S * 1000
    ).toISOString();
    const { data: lockResult } = await supabase
      .from("campanhas")
      .update({ next_batch_at: lockUntil })
      .eq("id", campanha_id)
      .is("next_batch_at", null)
      .select("id");

    let locked = !!(lockResult && lockResult.length > 0);
    if (!locked) {
      const { data: lockResult2 } = await supabase
        .from("campanhas")
        .update({ next_batch_at: lockUntil })
        .eq("id", campanha_id)
        .lt("next_batch_at", new Date().toISOString())
        .select("id");
      locked = !!(lockResult2 && lockResult2.length > 0);
    }
    if (!locked)
      return json({ ok: true, msg: "Outro processo rodando" });

    // ── Buscar cadência da campanha (se ativa) ──
    let cadenciaPassos: any[] = [];
    if (camp.cadencia_template_id && camp.cadencia_ativa !== false) {
      const { data: passos } = await supabase
        .from("cadencia_passos")
        .select("id, ordem, dia_offset, canal, is_inicial, is_breakup")
        .eq("template_id", camp.cadencia_template_id)
        .order("ordem", { ascending: true });
      cadenciaPassos = passos || [];
    }
    const passoInicial = cadenciaPassos.find((p) => p.is_inicial === true) || cadenciaPassos[0];
    const passoSeguinte = passoInicial
      ? cadenciaPassos.find((p) => p.ordem > passoInicial.ordem)
      : null;

    // ── Config ──
    const batchSize = camp.batch_size || 10;
    const delayMinMs = camp.delay_min_ms || 8000;
    const delayMaxMs = camp.delay_max_ms || 25000;
    const delayBatchMinMs = (camp.delay_between_batches_min || 300) * 1000;
    const delayBatchMaxMs = (camp.delay_between_batches_max || 600) * 1000;
    const chipIds: string[] = camp.chip_ids || [];
    const rotation = camp.rotation_strategy || "round_robin";
    const limiteDiario = camp.limite_diario_campanha || 120;

    // ── Verificar limite diário ──
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const { count: enviadosHoje } = await supabase
      .from("campanha_leads")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanha_id)
      .neq("status", "frio")
      .gte("data_primeiro_contato", hoje.toISOString());

    if ((enviadosHoje || 0) >= limiteDiario) {
      await supabase
        .from("campanhas")
        .update({ next_batch_at: null })
        .eq("id", campanha_id);
      console.log(`[disparo] Limite diário atingido: ${enviadosHoje}/${limiteDiario}`);
      return json({ ok: true, msg: "Limite diário atingido", enviados: enviadosHoje });
    }

    // ── Buscar chips ativos ──
    let chipsDisponiveis: any[] = [];
    if (chipIds.length > 0) {
      const { data: chips } = await supabase
        .from("chips")
        .select("id, nome, numero, instance_name, status")
        .in("id", chipIds)
        .eq("status", "ativo");
      chipsDisponiveis = chips || [];
    } else if (camp.chip_id) {
      const { data: chip } = await supabase
        .from("chips")
        .select("id, nome, numero, instance_name, status")
        .eq("id", camp.chip_id)
        .eq("status", "ativo")
        .single();
      if (chip) chipsDisponiveis = [chip];
    }

    if (chipsDisponiveis.length === 0) {
      console.error("[disparo] Nenhum chip disponível");
      await supabase
        .from("campanhas")
        .update({ next_batch_at: null })
        .eq("id", campanha_id);
      return json({ ok: false, error: "Nenhum chip disponível" });
    }

    // ── Buscar Evolution API config ──
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

    const evoUrl = evoConfig
      ?.find((c: any) => c.campo_nome === "evolution_api_url")
      ?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find(
      (c: any) => c.campo_nome === "evolution_api_key"
    )?.valor;

    if (!evoUrl || !evoKey) throw new Error("Evolution API não configurada");

    // ── Buscar leads FRIO ──
    const restante = limiteDiario - (enviadosHoje || 0);
    const lote = Math.min(batchSize, restante);

    const { data: leadsFrio, error: leadsErr } = await supabase
      .from("campanha_leads")
      .select("id, lead_id, lead:lead_id(nome, phone_e164, especialidade, uf, cidade)")
      .eq("campanha_id", campanha_id)
      .eq("status", "frio")
      .order("created_at", { ascending: true })
      .limit(lote);

    if (leadsErr) throw new Error("Erro ao buscar leads: " + leadsErr.message);

    if (!leadsFrio || leadsFrio.length === 0) {
      await supabase
        .from("campanhas")
        .update({ next_batch_at: null })
        .eq("id", campanha_id);
      console.log("[disparo] Sem leads FRIO restantes");
      return json({ ok: true, msg: "Sem leads para disparar" });
    }

    // ── Processar lote ──
    const startTime = Date.now();
    let sent = 0,
      failed = 0,
      chipIndex = 0;
    // Métricas por chip nesta execução (pra detectar chip morto)
    const chipMetrics: Record<string, { sucessos: number; erros: number }> = {};
    const bumpChip = (id: string, ok: boolean) => {
      if (!chipMetrics[id]) chipMetrics[id] = { sucessos: 0, erros: 0 };
      if (ok) chipMetrics[id].sucessos++;
      else chipMetrics[id].erros++;
    };

    for (let i = 0; i < leadsFrio.length; i++) {
      const cl = leadsFrio[i];
      const lead = cl.lead as any;

      if (!lead?.phone_e164) {
        failed++;
        await supabase
          .from("campanha_leads")
          .update({ status: "descartado", erro_envio: "Sem telefone" })
          .eq("id", cl.id);
        continue;
      }

      // Timeout check
      if (Date.now() - startTime + SEND_TIMEOUT_MS + 2000 > MAX_EXECUTION_MS) {
        console.log("[disparo] Timeout atingido, continuando depois");
        break;
      }

      // Pause check a cada 5
      if (i > 0 && i % 5 === 0) {
        const { data: curr } = await supabase
          .from("campanhas")
          .select("status")
          .eq("id", campanha_id)
          .single();
        if (curr?.status === "pausada") break;
      }

      // ── Ordenar chips: primário primeiro, fallback depois ──
      const chipPrimario =
        rotation === "random"
          ? chipsDisponiveis[Math.floor(Math.random() * chipsDisponiveis.length)]
          : chipsDisponiveis[chipIndex % chipsDisponiveis.length];
      chipIndex++;
      const chipsParaTentar = [
        chipPrimario,
        ...chipsDisponiveis.filter((c) => c.id !== chipPrimario.id),
      ];

      // ── Resolver spintax ──
      const msgTemplate = camp.mensagem_inicial || "Olá, {{nome}}!";
      const { text: msgResolvida, indices } = resolveSpintax(msgTemplate);
      const msgFinal = applyTemplate(msgResolvida, {
        nome: stripDoctorPrefix(lead.nome) || "Dr(a)",
        especialidade: lead.especialidade || "",
        cidade: lead.cidade || "",
        uf: lead.uf || "",
      });

      // ── Normalizar telefone ──
      const phone = normalizeBrazilianPhone(lead.phone_e164);
      if (!phone) {
        failed++;
        await supabase
          .from("campanha_leads")
          .update({ status: "descartado", erro_envio: "Telefone inválido" })
          .eq("id", cl.id);
        continue;
      }

      // ── Enviar via Evolution API com fallback de chip ──
      let success = false;
      let chipUsado: any = null;
      let lastError = "";
      let tentativas = 0;

      for (const chipTry of chipsParaTentar) {
        tentativas++;
        try {
          const endpoint = `${evoUrl}/message/sendText/${encodeURIComponent(chipTry.instance_name)}`;
          const resp = await fetchWithTimeout(
            endpoint,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoKey },
              body: JSON.stringify({ number: phone, text: msgFinal }),
            },
            SEND_TIMEOUT_MS
          );

          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Evolution ${resp.status}: ${errText.slice(0, 200)}`);
          }

          success = true;
          chipUsado = chipTry;
          bumpChip(chipTry.id, true);
          if (tentativas > 1) {
            console.warn(
              `[disparo] ↻ Fallback OK pra ${lead.nome} via ${chipTry.nome} (após ${tentativas - 1} chip(s) falhar(em))`
            );
          }
          break;
        } catch (err: any) {
          lastError = err.message || String(err);
          bumpChip(chipTry.id, false);
          console.warn(
            `[disparo] ⚠️ ${chipTry.nome} falhou pra ${lead.nome}: ${lastError}`
          );
          // tenta próximo chip
        }
      }

      if (success && chipUsado) {
        // Agenda próximo touch se há cadência configurada
        const agoraIso = new Date().toISOString();
        const proximoTouchEm =
          passoSeguinte
            ? new Date(Date.now() + (passoSeguinte.dia_offset - (passoInicial?.dia_offset || 0)) * 86400_000).toISOString()
            : null;

        await supabase
          .from("campanha_leads")
          .update({
            status: "contatado",
            data_primeiro_contato: agoraIso,
            data_ultimo_contato: agoraIso,
            data_status: agoraIso,
            tentativas,
            canal_atual: "whatsapp",
            chip_usado_id: chipUsado.id,
            mensagem_enviada: msgFinal,
            variation_indices: indices,
            proximo_touch_em: proximoTouchEm,
            proximo_passo_id: passoSeguinte?.id || null,
            touches_executados: 1,
          })
          .eq("id", cl.id);

        // Registra o touch inicial em campanha_lead_touches
        if (passoInicial) {
          await supabase.from("campanha_lead_touches").insert({
            campanha_lead_id: cl.id,
            passo_id: passoInicial.id,
            ordem: passoInicial.ordem,
            canal: "whatsapp",
            chip_usado_id: chipUsado.id,
            executado_em: agoraIso,
            resultado: "enviado",
            conteudo_enviado: msgFinal,
          });
        }

        await supabase.from("lead_historico").insert({
          lead_id: cl.lead_id,
          tipo_evento: "campanha_disparo",
          descricao_resumida: `Disparo WhatsApp - campanha`,
          metadados: {
            campanha_id,
            chip_id: chipUsado.id,
            chip_nome: chipUsado.nome,
            tentativas,
            proximo_touch_em: proximoTouchEm,
          },
        });

        sent++;
        console.log(`[disparo] ✅ ${lead.nome} (${phone}) via ${chipUsado.nome}${proximoTouchEm ? ` (T${passoSeguinte?.ordem} em ${new Date(proximoTouchEm).toISOString().slice(0,10)})` : ""}`);
      } else {
        failed++;
        await supabase
          .from("campanha_leads")
          .update({
            erro_envio: `Todos ${tentativas} chip(s) falharam. Último: ${lastError.slice(0, 400)}`,
            tentativas,
          })
          .eq("id", cl.id);
        console.error(
          `[disparo] ❌ ${lead.nome}: todos ${tentativas} chip(s) falharam. Último: ${lastError}`
        );
      }

      // ── Delay entre msgs ──
      if (i < leadsFrio.length - 1) {
        const delay = randomDelay(delayMinMs, delayMaxMs);
        await sleep(delay);
      }
    }

    // ── Atualizar contadores ──
    await supabase
      .from("campanhas")
      .update({
        disparos_enviados: (camp.disparos_enviados || 0) + sent,
        disparos_falhas: (camp.disparos_falhas || 0) + failed,
      })
      .eq("id", campanha_id);

    console.log(`[disparo] Lote: sent=${sent} failed=${failed}`);

    // ── Diagnóstico de chips: marca como suspeito quem teve >50% erros e >=3 tentativas ──
    for (const [chipId, m] of Object.entries(chipMetrics)) {
      const total = m.sucessos + m.erros;
      const taxaErro = total > 0 ? m.erros / total : 0;
      console.log(
        `[disparo] chip ${chipId}: ok=${m.sucessos} err=${m.erros} (${Math.round(taxaErro * 100)}%)`
      );
      if (total >= 3 && taxaErro >= 0.5) {
        await supabase
          .from("chips")
          .update({ status: "suspeito" })
          .eq("id", chipId);
        console.warn(
          `[disparo] 🚨 Chip ${chipId} marcado como suspeito (${m.erros}/${total} erros)`
        );
      }
    }

    // ── Verificar restantes ──
    const { count: remaining } = await supabase
      .from("campanha_leads")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanha_id)
      .eq("status", "frio");

    if ((remaining || 0) > 0) {
      const { data: latestCamp } = await supabase
        .from("campanhas")
        .select("status")
        .eq("id", campanha_id)
        .single();

      if (latestCamp?.status === "ativa") {
        const batchPause = randomDelay(delayBatchMinMs, delayBatchMaxMs);
        const nextBatchAt = new Date(Date.now() + batchPause).toISOString();
        await supabase
          .from("campanhas")
          .update({ next_batch_at: nextBatchAt })
          .eq("id", campanha_id);
        console.log(`[disparo] Pausa até ${nextBatchAt} (${Math.round(batchPause / 1000)}s)`);
        await sleep(500);
        selfInvoke(supabase, campanha_id);
      } else {
        await supabase
          .from("campanhas")
          .update({ next_batch_at: null })
          .eq("id", campanha_id);
      }
    } else {
      await supabase
        .from("campanhas")
        .update({ next_batch_at: null })
        .eq("id", campanha_id);
      console.log("[disparo] Todos os leads processados nesta campanha");
    }

    return json({ ok: true, sent, failed, remaining: remaining || 0 });
  } catch (err: any) {
    console.error("[disparo] ERRO:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ──

function json(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function selfInvoke(supabase: any, campanha_id: string) {
  supabase.functions
    .invoke("campanha-disparo-processor", { body: { campanha_id } })
    .catch(console.error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBrazilianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  if (digits.length === 10) {
    const d = parseInt(digits[2], 10);
    if (d >= 6) digits = digits.slice(0, 2) + "9" + digits.slice(2);
  }
  return "55" + digits;
}

function resolveSpintax(text: string): { text: string; indices: number[] } {
  const indices: number[] = [];
  const placeholders: string[] = [];
  let result = text.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    const idx = placeholders.length;
    placeholders.push(`{{${name}}}`);
    return `\x00VAR${idx}\x00`;
  });

  result = result.replace(/\[OPCIONAL\]\s*([^\n]*)/gi, () => {
    const pick = Math.random() > 0.5 ? 0 : 1;
    indices.push(pick);
    return pick === 0 ? "" : "";
  });

  const MAX_ITER = 50;
  let i = 0;
  while (result.includes("{") && i < MAX_ITER) {
    result = result.replace(/\{([^{}]+)\}/g, (_, group) => {
      const options = group.split("|");
      const pick = Math.floor(Math.random() * options.length);
      indices.push(pick);
      return options[pick].trim();
    });
    i++;
  }

  result = result.replace(
    /\x00VAR(\d+)\x00/g,
    (_, idx) => placeholders[parseInt(idx)]
  );
  return {
    text: result.replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim(),
    indices,
  };
}

function applyTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => vars[key] ?? match
  );
}

// Remove prefixos "Dr.", "Dra.", "Dr(a)." do início pra evitar duplicação
// com templates tipo "Boa tarde, Dr(a). {{nome}}". Não toca se o nome
// não começa com prefixo.
function stripDoctorPrefix(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/^\s*(dr\.?\s*\(a\)\.?|dra?\.?)\s+/i, "")
    .trim();
}
