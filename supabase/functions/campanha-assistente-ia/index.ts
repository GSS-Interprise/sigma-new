// Assistente de campanha com IA (Raul/Maikon, 17/11/2026): o dono escreve em português o que esta campanha tem de
// especial ("não quero citar o hospital nem a cidade, só que é na região Sul, pelo menos no início") e a IA devolve o
// que entendeu em campos que o Sigma sabe aplicar (sigilo do local, como falar a região, se a IA passa valor) e uma
// regra curta para a IA da conversa. Nada é gravado aqui: o assistente mostra "Entendi: ..." e o dono aplica ou não.
// Motor (Raul, 17/11): primeiro o Claude da GSS (Hermes na VPS, rotina ia_claude_assistente_campanha,
// docs/arquitetura/motor-ia-hermes-claude.md); sem login, demora ou erro, o Gemini da IA das campanhas responde
// (GEMINI_API_KEY, conta bi@; a OpenAI está sem crédito desde 14/10). As mesmas instruções servem aos dois.
// Quem lê os campos: _shared/sigilo.ts (briefingPublico e regrasDaCampanha).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizarParticularidades } from "../_shared/sigilo.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELOS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

const PROMPT = `Você ajuda o dono da GSS (empresa que oferece plantões e vagas a médicos) a montar uma campanha de prospecção
por WhatsApp. Ele escreve o que esta campanha tem de especial. Você traduz em campos. Devolva SÓ um JSON:
- "entendi": 1 ou 2 frases curtas, em português, dizendo o que vai mudar na campanha (fale com o dono, "você").
- "ocultar_hospital": true se ele não quer que o hospital/unidade seja citado ao médico.
- "ocultar_cidade": true se ele não quer que a cidade/localização exata seja citada.
- "como_falar_local": como falar do local quando ele estiver oculto, curto (ex.: "região Sul", "interior de SC"),
  ou null.
- "ia_informa_valor": true se ele quer que a IA passe o valor ao médico, false se ele proibiu falar valor, null se não
  disse nada sobre valor.
- "instrucoes_ia": o que mais ele pediu, escrito como UMA regra curta e imperativa para a IA que conversa com o médico
  (ex.: "Diga que os plantões são só aos fins de semana."). Não repita o que já está nos campos acima. null se não há.
- "duvida": se o pedido for ambíguo, UMA pergunta curta para o dono; senão null.
Nunca invente fato da vaga que ele não escreveu.`;

const pedidoDoDono = (texto: string, rascunho: unknown) =>
  `Campanha até agora: ${JSON.stringify(rascunho).slice(0, 2000)}\n\nPedido do dono: ${texto}`;

// deno-lint-ignore no-explicit-any
type Svc = any;

// O Claude está ligado? Vale o último pedido do motor que terminou: login, teste, desconexão ou o próprio assistente.
// Sem login nenhum (o caso até a GSS conectar) a edge vai direto ao Gemini, sem esperar a VPS.
async function claudeLigado(svc: Svc): Promise<boolean> {
  const { data } = await svc.from("rotina_pedidos").select("tipo, status, resultado, erro")
    .in("tipo", ["ia_claude_situacao", "ia_claude_codigo", "ia_claude_teste", "ia_claude_sair", "ia_claude_assistente_campanha"])
    .in("status", ["feito", "erro"]).order("concluido_em", { ascending: false }).limit(10);
  for (const p of data || []) {
    if (p.tipo === "ia_claude_sair" && p.status === "feito") return false;
    if (p.tipo === "ia_claude_codigo" && p.status === "feito") return true;
    if (p.tipo === "ia_claude_situacao" && p.status === "feito") return !!p.resultado?.conectado;
    if (p.tipo === "ia_claude_teste" && p.status === "feito") return !!p.resultado?.ok;
    if (p.tipo === "ia_claude_assistente_campanha") return !String(p.erro || "").includes("sem-login");
  }
  return false;
}

// Pede ao worker da VPS (laço rápido: 8 s parado) e espera até 60 s. null = cai no Gemini.
async function interpretarComClaude(svc: Svc, texto: string, rascunho: unknown) {
  const { data: id, error } = await svc.rpc("rotina_pedir", {
    p_tipo: "ia_claude_assistente_campanha",
    p_payload: { instrucoes: PROMPT, pedido: pedidoDoDono(texto, rascunho) },
  });
  if (error || !id) return null;
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data: p } = await svc.from("rotina_pedidos").select("status, resultado").eq("id", id).single();
    if (p?.status === "feito") return p.resultado?.particularidades ?? null;
    if (p?.status === "erro") return null;
  }
  // Desistiu: se a VPS ainda não pegou, tira da fila para não gastar a cota com resposta que ninguém vai ler.
  await svc.from("rotina_pedidos").update({ status: "erro", erro: "a edge desistiu de esperar", concluido_em: new Date().toISOString() })
    .eq("id", id).eq("status", "pendente");
  return null;
}

async function interpretar(chave: string, texto: string, rascunho: unknown) {
  let ultimoErro = "";
  for (const modelo of MODELOS) {
    // 20 s por modelo: o flash às vezes passa de 40 s no primeiro pedido (17/11); aí o lite responde.
    let r: Response;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: "user", parts: [{ text: pedidoDoDono(texto, rascunho) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      ultimoErro = `${modelo}: ${(e as Error).message}`;
      continue;
    }
    const corpo = await r.json().catch(() => ({}));
    if (r.ok) {
      const t = corpo.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}";
      return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    }
    ultimoErro = `${corpo?.error?.status || r.status}: ${String(corpo?.error?.message || "").slice(0, 120)}`;
    if (r.status !== 404 && r.status !== 429 && r.status !== 503) break; // erro que o modelo reserva não resolve
  }
  throw new Error(ultimoErro || "sem resposta da IA");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // Só usuário logado no Sigma (o assistente). Nada é gravado, mas a chave da IA tem custo.
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Entre no Sigma de novo." }, 401);

    const { texto, rascunho } = await req.json().catch(() => ({}));
    const pedido = String(texto || "").trim();
    if (pedido.length < 5) return json({ error: "Escreva o que esta campanha tem de especial." }, 400);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const texto1500 = pedido.slice(0, 1500);
    if (await claudeLigado(svc).catch(() => false)) {
      const doClaude = await interpretarComClaude(svc, texto1500, rascunho ?? {}).catch(() => null);
      if (doClaude && typeof doClaude === "object") {
        return json({ ok: true, motor: "claude", particularidades: normalizarParticularidades(doClaude) });
      }
    }

    const chave = Deno.env.get("GEMINI_API_KEY");
    if (!chave) return json({ error: "A IA não está configurada (GEMINI_API_KEY)." }, 500);

    const bruto = await interpretar(chave, texto1500, rascunho ?? {});
    return json({ ok: true, motor: "gemini", particularidades: normalizarParticularidades(bruto) });
  } catch (e) {
    console.error("[campanha-assistente-ia]", e);
    return json({ error: `A IA não respondeu agora (${(e as Error).message}). Tente de novo.` }, 502);
  }
});
