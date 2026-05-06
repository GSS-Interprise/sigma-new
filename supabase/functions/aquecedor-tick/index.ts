// =====================================================================
// aquecedor-tick
// Cron a cada 2 min — pra cada chip em fase aquecimento/pronto/producao,
// decide se é hora de gerar evento orgânico, sorteia parceiro power-law,
// gera mensagem via OpenAI com persona, envia via helper anti-ban.
//
// Ratio de eventos:
//  - aquecimento (dia 1-7): ~10-50 eventos/dia (rampa progressiva)
//  - pronto/producao: ~5-10 eventos/dia (manutenção orgânica)
//
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §6.1 §6.2
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText, getEvoConfig } from "../_shared/evo-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

interface ChipInfo {
  chip_id: string;
  instance_name: string;
  numero: string;
  fase: string;
  warmup_start_date: string | null;
  persona: any;
}

function tzNow(): { hour: number; isWeekend: boolean } {
  // BRT (UTC-3)
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  return { hour: brt.getUTCHours(), isWeekend: [0, 6].includes(brt.getUTCDay()) };
}

function shouldFireNow(chip: ChipInfo): boolean {
  const { hour, isWeekend } = tzNow();
  const sched = chip.persona?.schedule_pattern || {};
  const wakeUp = sched.wake_up_hour ?? 7;
  const sleepHour = sched.sleep_hour ?? 23;
  const weekendActive = sched.weekend_active ?? true;
  const weekendFactor = sched.weekend_factor ?? 0.5;

  // Dead zone (sono) — quase nada
  if (hour < wakeUp || (sleepHour > 0 && hour >= sleepHour)) {
    return Math.random() < 0.02; // 2% chance excepcional
  }
  if (isWeekend && !weekendActive) return false;

  // Probabilidade base por fase + dia warm-up
  const today = new Date();
  let p_base = 0.05; // 5% por tick (a cada 2 min) → ~36 eventos/dia em horário ativo

  if (chip.fase === "aquecimento" && chip.warmup_start_date) {
    const days = Math.max(1, Math.floor(
      (today.getTime() - new Date(chip.warmup_start_date).getTime()) / 86400_000
    ));
    // Curva: dia 1=10/dia, dia 2=20, dia 3=35, dia 4=50, dia 5=60, dia 6=70, dia 7=80
    const target = [10, 20, 35, 50, 60, 70, 80][Math.min(6, days - 1)] || 80;
    // ~15h ativas, 30 ticks por hora = 450 ticks/dia ativos
    // p_base = target / 450
    p_base = target / 450;
  } else if (chip.fase === "pronto" || chip.fase === "producao") {
    p_base = 8 / 450; // ~8 eventos/dia (manutenção)
  }

  // Weekend factor
  if (isWeekend) p_base *= weekendFactor;

  // Circadian: pico 9-11 e 19-21, médio 12-18, baixo 22-2, dead 3-6
  let circadian = 1.0;
  if (hour >= 9 && hour <= 11) circadian = 1.5;
  else if (hour >= 19 && hour <= 21) circadian = 1.3;
  else if (hour >= 12 && hour <= 18) circadian = 1.0;
  else if (hour >= 22 || hour <= 2) circadian = 0.4;
  else circadian = 0.1;
  p_base *= circadian;

  return Math.random() < p_base;
}

async function pickPartner(
  supabase: ReturnType<typeof createClient>,
  chipId: string
): Promise<ChipInfo | null> {
  // Lista pares ativos do chip, ponderado por intensidade (power-law)
  const { data: pares } = await supabase
    .from("aquecedor_par")
    .select("chip_a_id, chip_b_id, intensidade")
    .or(`chip_a_id.eq.${chipId},chip_b_id.eq.${chipId}`)
    .eq("fase", "ativo");

  if (!pares || pares.length === 0) return null;

  // Sorteio ponderado pela intensidade
  const totalWeight = pares.reduce((sum: number, p: any) => sum + Math.pow(p.intensidade, 2), 0);
  let r = Math.random() * totalWeight;
  let chosen: any = null;
  for (const p of pares) {
    r -= Math.pow(p.intensidade, 2);
    if (r <= 0) { chosen = p; break; }
  }
  if (!chosen) chosen = pares[pares.length - 1];

  const partnerId = chosen.chip_a_id === chipId ? chosen.chip_b_id : chosen.chip_a_id;

  // Busca info do parceiro
  const { data: partner } = await supabase
    .from("chips")
    .select("id, instance_name, numero")
    .eq("id", partnerId)
    .maybeSingle();

  if (!partner?.numero) return null;

  const { data: persona } = await supabase
    .from("chip_persona").select("*").eq("chip_id", partnerId).maybeSingle();

  return {
    chip_id: partner.id as string,
    instance_name: partner.instance_name as string,
    numero: partner.numero as string,
    fase: "",
    warmup_start_date: null,
    persona,
  };
}

async function fetchRecentContext(
  supabase: ReturnType<typeof createClient>,
  chipId: string,
  partnerJid: string
): Promise<string> {
  // Pega últimas 6 mensagens trocadas com esse parceiro pra dar contexto à IA
  const { data: msgs } = await supabase
    .from("chip_send_log")
    .select("evento_origem, sent_at, conteudo_tipo")
    .eq("chip_id", chipId)
    .eq("to_jid", partnerJid)
    .order("sent_at", { ascending: false })
    .limit(6);
  if (!msgs || msgs.length === 0) return "(primeira interação)";
  const lines = msgs.reverse().map((m: any) =>
    `- ${new Date(m.sent_at).toISOString().slice(11, 16)}: ${m.conteudo_tipo}`
  );
  return lines.join("\n");
}

async function generateMessage(persona: any, partnerName: string, contexto: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  if (!persona?.llm_system_prompt) return null;

  const userPrompt = [
    `Você está conversando NO WHATSAPP com ${partnerName}, um amigo seu.`,
    `Histórico recente das interações:`,
    contexto,
    ``,
    `Mande UMA mensagem curta e casual pra ${partnerName} agora — pode ser:`,
    `- Um "oi", "eai", "sumido" se faz tempo`,
    `- Uma pergunta casual ("vai pro futebol sábado?", "viu a novela ontem?")`,
    `- Comentário sobre o dia ("nossa que cansaço hoje", "to com fome kkk")`,
    `- Reação a algo da semana (notícia, tempo, time, série)`,
    `- Um meme verbal ("eu ein", "que isso", "para tudo")`,
    ``,
    `Mensagem curta (1-25 palavras). NÃO seja formal. NÃO use saudação completa tipo "Olá!". Seja humano real.`,
    `Responda APENAS com a mensagem, sem aspas, sem prefixo.`,
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 80,
      temperature: 0.95,
      messages: [
        { role: "system", content: persona.llm_system_prompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    console.error("[aquecedor-tick] OpenAI error:", await resp.text());
    return null;
  }
  const body = await resp.json();
  const content = body?.choices?.[0]?.message?.content?.trim();
  if (!content || content.length < 1 || content.length > 200) return null;
  // Remove aspas externas se LLM colocou
  return content.replace(/^["']|["']$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const evo = await getEvoConfig(supabase);

    // 1. Lista chips elegíveis (consultando a partir de chips, que tem FK direta com state e persona)
    const { data: chipsRaw, error } = await supabase
      .from("chips")
      .select(`
        id, instance_name, numero, connection_state,
        state:chip_state!chip_state_chip_id_fkey(fase, warmup_start_date, paused_until, health_score, aquecedor_ativo),
        persona:chip_persona!chip_persona_chip_id_fkey(*)
      `)
      .eq("connection_state", "open");
    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    const eligible = (chipsRaw || [])
      .filter((c: any) => {
        const s = Array.isArray(c.state) ? c.state[0] : c.state;
        const p = Array.isArray(c.persona) ? c.persona[0] : c.persona;
        if (!s || !p) return false;
        // Opt-in obrigatório: chips antigos têm aquecedor_ativo=false e ficam intactos
        if (!s.aquecedor_ativo) return false;
        if (!["aquecimento", "pronto", "producao"].includes(s.fase)) return false;
        if (s.health_score >= 60) return false;
        if (s.paused_until && new Date(s.paused_until) > new Date()) return false;
        if (!p.llm_system_prompt) return false;
        return true;
      })
      .map((c: any) => ({
        chip_id: c.id,
        chips: { id: c.id, instance_name: c.instance_name, numero: c.numero, connection_state: c.connection_state },
        fase: (Array.isArray(c.state) ? c.state[0] : c.state).fase,
        warmup_start_date: (Array.isArray(c.state) ? c.state[0] : c.state).warmup_start_date,
        paused_until: (Array.isArray(c.state) ? c.state[0] : c.state).paused_until,
        persona: Array.isArray(c.persona) ? c.persona[0] : c.persona,
      }));

    let fired = 0, skipped = 0, errors = 0;

    for (const cs of eligible) {
      const chipInfo: ChipInfo = {
        chip_id: cs.chip_id,
        instance_name: (cs.chips as any).instance_name,
        numero: (cs.chips as any).numero,
        fase: cs.fase,
        warmup_start_date: cs.warmup_start_date,
        persona: cs.persona,
      };

      if (!shouldFireNow(chipInfo)) {
        skipped++;
        continue;
      }

      // 2. Sorteia parceiro
      const partner = await pickPartner(supabase, cs.chip_id);
      if (!partner) {
        skipped++;
        continue;
      }

      // 3. Gera mensagem via OpenAI
      const contexto = await fetchRecentContext(supabase, cs.chip_id, partner.numero);
      const text = await generateMessage(
        chipInfo.persona,
        partner.persona?.primeiro_nome || "amigo",
        contexto
      );
      if (!text) {
        errors++;
        continue;
      }

      // 4. Envia via helper (pre_send_check + log)
      const result = await sendWhatsAppText({
        supabase,
        evo,
        chipId: cs.chip_id,
        instanceName: chipInfo.instance_name,
        toJid: partner.numero,
        text,
        eventoOrigem: "aquecimento",
        awaitDelay: false, // não bloqueia o cron com sleep longo
      });

      if (result.sent) {
        fired++;
        console.log(`[aquecedor] ✓ ${chipInfo.persona?.primeiro_nome || cs.chip_id.slice(0,6)} → ${partner.persona?.primeiro_nome || partner.chip_id.slice(0,6)}: "${text.slice(0,40)}"`);
      } else if (result.reason === "delay_pending") {
        // pre_send_check pediu delay — pula este tick, próximo cron tenta
        skipped++;
      } else {
        errors++;
        console.warn(`[aquecedor] ✗ ${cs.chip_id.slice(0,6)} → ${partner.chip_id.slice(0,6)}: ${result.reason}`);
      }
    }

    return json({
      ok: true,
      eligible_chips: eligible.length,
      fired,
      skipped,
      errors,
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[aquecedor-tick] error", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
