// =====================================================================
// persona-generator
// Gera uma persona BR aleatória pra um chip — usada pelo aquecedor pra
// produzir conteúdo coerente. Persona é persistida em chip_persona.
//
// Input: { chip_id: uuid }
// Output: { persona: {...} }
//
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §6.2
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Pools curados ----------
const NOMES_M = [
  "André", "Bruno", "Carlos", "Daniel", "Eduardo", "Felipe", "Gabriel", "Henrique",
  "Igor", "João", "Lucas", "Marcelo", "Nicolas", "Otávio", "Pedro", "Rafael",
  "Rodrigo", "Tiago", "Vinícius", "Wagner", "Caio", "Diego", "Everton", "Gustavo",
];
const NOMES_F = [
  "Ana", "Beatriz", "Carolina", "Daniela", "Eliane", "Fernanda", "Gabriela", "Helena",
  "Isabela", "Juliana", "Karina", "Larissa", "Mariana", "Natália", "Patrícia", "Renata",
  "Sabrina", "Tatiana", "Vanessa", "Camila", "Bianca", "Letícia", "Priscila", "Júlia",
];
const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Lima", "Costa", "Ferreira",
  "Almeida", "Carvalho", "Ribeiro", "Rodrigues", "Gomes", "Martins", "Araújo",
  "Barbosa", "Dias", "Cardoso", "Moreira", "Nunes", "Mendes", "Cavalcanti",
];
const PROFISSOES = [
  "professora de escola pública", "professor de matemática", "auxiliar administrativo",
  "vendedora de loja", "balconista de farmácia", "técnico em informática",
  "motorista de aplicativo", "analista de RH", "atendente de call center",
  "secretária", "empresária autônoma", "barbeiro", "manicure", "personal trainer",
  "garçom", "operadora de caixa", "designer freelancer", "fotógrafa", "advogada júnior",
  "bancária", "contador", "estagiário", "pequeno comerciante", "técnico de enfermagem",
  "fisioterapeuta", "nutricionista", "corretor de imóveis", "auxiliar de produção",
];
const CIDADES_BR = [
  { cidade: "São Paulo", estado: "SP" }, { cidade: "Rio de Janeiro", estado: "RJ" },
  { cidade: "Belo Horizonte", estado: "MG" }, { cidade: "Salvador", estado: "BA" },
  { cidade: "Fortaleza", estado: "CE" }, { cidade: "Brasília", estado: "DF" },
  { cidade: "Curitiba", estado: "PR" }, { cidade: "Porto Alegre", estado: "RS" },
  { cidade: "Recife", estado: "PE" }, { cidade: "Manaus", estado: "AM" },
  { cidade: "Goiânia", estado: "GO" }, { cidade: "Campinas", estado: "SP" },
  { cidade: "Florianópolis", estado: "SC" }, { cidade: "Vitória", estado: "ES" },
  { cidade: "Natal", estado: "RN" }, { cidade: "João Pessoa", estado: "PB" },
  { cidade: "Cuiabá", estado: "MT" }, { cidade: "Maceió", estado: "AL" },
  { cidade: "Aracaju", estado: "SE" }, { cidade: "Belém", estado: "PA" },
  { cidade: "Joinville", estado: "SC" }, { cidade: "Sorocaba", estado: "SP" },
  { cidade: "Ribeirão Preto", estado: "SP" }, { cidade: "Niterói", estado: "RJ" },
];
const POOL_INTERESSES = [
  "futebol", "novela", "cozinhar", "viajar", "praia", "academia", "música sertaneja",
  "pop nacional", "MPB", "samba", "funk", "rock", "filmes", "séries netflix",
  "passear com cachorro", "jardinagem", "fotografia", "dança", "yoga",
  "leitura", "videogame", "bíblia", "igreja", "família", "filhos", "marido", "esposa",
  "automóveis", "moto", "decoração", "moda", "maquiagem", "barbear", "futebol",
];
const FAMILIA_TEMPLATES = [
  "casado(a) há {anos} anos, {filhos_text}",
  "solteiro(a), morando com {familia}",
  "divorciado(a), {filhos_text}",
  "namorando há {anos} anos, sem filhos",
  "casado(a) recente, ainda sem filhos",
];
const VOZES_TTS = ["nova", "onyx", "shimmer", "echo"];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function gerarPersona() {
  const isF = Math.random() < 0.55;
  const primeiroNome = isF ? pick(NOMES_F) : pick(NOMES_M);
  const sobrenome = `${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
  const nomeCompleto = `${primeiroNome} ${sobrenome}`;
  const idade = randInt(25, 55);
  const profissao = pick(PROFISSOES);
  const local = pick(CIDADES_BR);
  const interesses = pickN(POOL_INTERESSES, randInt(3, 6));

  // Família
  const familiaTemplate = pick(FAMILIA_TEMPLATES);
  const filhosText = idade > 30 && Math.random() < 0.65
    ? `com ${randInt(1, 3)} filho${Math.random() < 0.5 ? "" : "s"}`
    : "sem filhos";
  const vidaFamiliar = familiaTemplate
    .replace("{anos}", String(randInt(1, 20)))
    .replace("{filhos_text}", filhosText)
    .replace("{familia}", pick(["pais", "irmã", "amigas"]));

  // Estilo de escrita aleatorizado dentro de range natural
  const estiloEscrita = {
    formal: false,
    abreviacoes: Math.random() < 0.85,
    kkkk_freq: +(Math.random() * 0.25).toFixed(2),
    emoji_freq: +(Math.random() * 0.4 + 0.1).toFixed(2),
    typos_prob: +(Math.random() * 0.12 + 0.02).toFixed(2),
    pontuacao_completa: Math.random() < 0.3,
  };

  // Schedule pattern
  const wakeUp = randInt(6, 9);
  const sleepHour = randInt(22, 24);
  const workStart = randInt(8, 10);
  const workEnd = randInt(17, 19);
  const schedulePattern = {
    wake_up_hour: wakeUp,
    sleep_hour: sleepHour === 24 ? 0 : sleepHour,
    work_start: workStart,
    work_end: workEnd,
    lunch_start: 12,
    lunch_end: 13,
    weekend_active: Math.random() < 0.7,
    weekend_factor: 0.5,
    tz: "America/Sao_Paulo",
  };

  // Voz TTS (mulher → nova/shimmer; homem → onyx/echo)
  const vozTts = isF
    ? (Math.random() < 0.5 ? "nova" : "shimmer")
    : (Math.random() < 0.5 ? "onyx" : "echo");

  // System prompt persistente pro LLM gerar conteúdo coerente
  const systemPrompt = [
    `Você é ${primeiroNome}, ${idade} anos, ${profissao}, mora em ${local.cidade}/${local.estado}.`,
    `Vida familiar: ${vidaFamiliar}.`,
    `Interesses: ${interesses.join(", ")}.`,
    ``,
    `IMPORTANTE — você está conversando NO WHATSAPP com pessoas conhecidas (amigos, família, conhecidos). NÃO é atendimento profissional. NÃO é prospecção. É conversa casual normal de WhatsApp.`,
    ``,
    `Estilo de escrita:`,
    `- Use português brasileiro INFORMAL`,
    estiloEscrita.abreviacoes ? `- Use abreviações: vc, tbm, blz, kkk, oq, n (ao invés de "não")` : "- Sem abreviações",
    `- ${estiloEscrita.kkkk_freq > 0.1 ? "Use kkkk com frequência razoável quando rir" : "Raramente use kkkk"}`,
    `- Emojis: ${estiloEscrita.emoji_freq > 0.25 ? "use de vez em quando 👍❤️😂🙏" : "use raramente"}`,
    `- Typos eventuais (1 a cada 10 mensagens, mais natural)`,
    estiloEscrita.pontuacao_completa ? "- Pontuação completa" : "- Pontuação relaxada (vírgulas/pontos podem faltar)",
    `- NÃO use saudações formais como "Olá!" ou "Bom dia!" — use "oi", "eai", "tudo bem?", ou nem saudação`,
    `- Mensagens curtas (1-30 palavras tipicamente). Conversa casual, não monólogos.`,
    `- NÃO seja prestativa demais. Seja humana real, com opiniões, dúvidas, distrações.`,
    ``,
    `Quando alguém te perguntar algo sobre serviços, vagas, oportunidades médicas, etc — você NÃO sabe nada sobre isso. Você é ${profissao}. Responda como ${primeiroNome} responderia: "olha não sei do que vc tá falando", "acho que tu errou de número", "kkk não faço ideia", etc.`,
  ].join("\n");

  return {
    nome_completo: nomeCompleto,
    primeiro_nome: primeiroNome,
    idade,
    profissao,
    cidade: local.cidade,
    estado: local.estado,
    estilo_escrita: estiloEscrita,
    interesses,
    vida_familiar: vidaFamiliar,
    schedule_pattern: schedulePattern,
    llm_system_prompt: systemPrompt,
    voz_tts: vozTts,
    status_message: pick([
      "ocupada hoje 💼", "🌟 vivendo um dia de cada vez", "📱 só whats", "no trampo",
      "respondendo quando der", "Deus no controle 🙏", "tmj sempre",
      "📚 estudando", "vivendo", "modo offline ativado",
    ]),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const chipId: string | undefined = body.chip_id;
    const overwrite: boolean = !!body.overwrite;

    if (!chipId) {
      return json({ ok: false, error: "chip_id obrigatório" }, 400);
    }

    // Verifica chip existe
    const { data: chip } = await supabase
      .from("chips")
      .select("id, nome")
      .eq("id", chipId)
      .maybeSingle();
    if (!chip) {
      return json({ ok: false, error: "chip não encontrado" }, 404);
    }

    // Verifica se já tem persona
    const { data: existing } = await supabase
      .from("chip_persona")
      .select("chip_id")
      .eq("chip_id", chipId)
      .maybeSingle();

    if (existing && !overwrite) {
      return json({ ok: false, error: "persona já existe (use overwrite:true pra sobrescrever)" }, 409);
    }

    const persona = gerarPersona();

    if (existing && overwrite) {
      const { error } = await supabase.from("chip_persona").update({
        ...persona,
      }).eq("chip_id", chipId);
      if (error) return json({ ok: false, error: error.message }, 500);
    } else {
      const { error } = await supabase.from("chip_persona").insert({
        chip_id: chipId,
        ...persona,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
    }

    console.log(`[persona-generator] ${chip.nome} → ${persona.primeiro_nome}, ${persona.idade}, ${persona.profissao}, ${persona.cidade}/${persona.estado}`);

    return json({
      ok: true,
      chip_id: chipId,
      persona: {
        primeiro_nome: persona.primeiro_nome,
        idade: persona.idade,
        profissao: persona.profissao,
        cidade: persona.cidade,
        estado: persona.estado,
        voz_tts: persona.voz_tts,
      },
    });
  } catch (e: any) {
    console.error("[persona-generator] error", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
