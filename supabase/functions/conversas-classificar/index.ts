// Fase 7.2 (Raio-X do mercado): classifica cada conversa de campanha em um resultado e,
// quando houver, uma objeção principal. Categorias: docs/arquitetura/bi-raio-x-mercado-medico.md §3.
// Fila: RPC conversas_classificar_pendentes (médico respondeu depois do 1º envio e ainda não
// classificado, ou falou de novo). Cron a cada 10 min, 40 por rodada (limite por minuto do Gemini gratuito).
// Só service role (cron) ou admin. { teste: true } classifica 1 conversa e não grava.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PROMPT_CLASSIFICACAO as PROMPT, chaveClassificacao, entradaClassificacao, linhaClassificacao } from "../_shared/classificacao.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// Gemini desde 09/11: a OpenAI ficou sem crédito (D-G). gemini-2.5-* não aceita conta nova (404).
// Chave no plano gratuito: o limite é por minuto. Lote pequeno, 2 por vez, e cron a cada 10 min (não a cada 2 h).
// Plano gratuito tem cota diária por modelo (GenerateRequestsPerDayPerProjectPerModel-FreeTier). Com a fila da Zenvia
// (27/11) a cota do 1º esgotou à tarde e a classificação parou. Esgotou: passa para o próximo modelo até a virada.
const MODELOS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
let modeloAtual = 0;
const PARALELO = 2;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));



async function classificar(chave: string, conversa: string, tentativa = 0): Promise<any> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELOS[modeloAtual]}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: "user", parts: [{ text: conversa.slice(0, 12_000) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const corpo = await r.json().catch(() => ({}));
  // 429/503 = limite por minuto ou pico: espera e tenta de novo; na 3ª vez desiste e a conversa volta na próxima rodada.
  if (r.status === 429 && JSON.stringify(corpo).includes("PerDay") && modeloAtual < MODELOS.length - 1) {
    modeloAtual++;
    return classificar(chave, conversa, tentativa);
  }
  if ((r.status === 429 || r.status === 503) && tentativa < 2) { await espera(20_000); return classificar(chave, conversa, tentativa + 1); }
  if (!r.ok) {
    const codigo = corpo?.error?.status || `http_${r.status}`;
    // Chave inválida, sem cota ou cobrança: parar o lote. 503/429 de pico: só esta conversa falha e volta na próxima rodada.
    throw Object.assign(new Error(`${codigo}: ${String(corpo?.error?.message || "").slice(0, 120)}`), {
      fatal: r.status === 401 || r.status === 403 || r.status === 429,
    });
  }
  const txt = corpo.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}";
  return JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(url, serviceKey);

  // Mesmo critério de vagas-relatorio-diario: o JWT do cron pode não ser a env (self-hosted).
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let ok = !!auth && auth === serviceKey;
  if (!ok && auth) {
    const { data, error } = await createClient(url, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    ok = !error && Array.isArray(data);
  }
  if (!ok && auth) {
    const { data: { user } } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth);
    if (user) {
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      ok = (papeis ?? []).some((p: any) => p.role === "admin");
    }
  }
  if (!ok) return json({ ok: false, error: "sem_permissao" }, 401);

  const body = await req.json().catch(() => ({}));
  const teste = body?.teste === true;
  // Motor Hermes (27/11): com o tipo em 'hermes', esta rodada só põe as conversas na fila ia_trabalho; o Hermes da VPS
  // classifica com o Claude da assinatura e entrega pelo sigma-mcp. Sem cair para o Gemini sozinho.
  const { data: motor } = await svc.from("ia_motor").select("motor").eq("tipo", "classificar_conversa").maybeSingle();
  const hermes = motor?.motor === "hermes" && !teste;
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave && !hermes) return json({ ok: false, error: "sem_chave_gemini" }, 500);
  // Na fila não há limite por minuto: lote maior. A chave do item repete enquanto o Hermes não entrega (não duplica).
  const limite = teste ? 1 : hermes ? 150 : Math.min(Math.max(Number(body?.limite) || 20, 1), 40);

  const { data: fila, error } = await svc.rpc("conversas_classificar_pendentes", { p_limite: limite });
  if (error) return json({ ok: false, error: error.message }, 500);
  // Zenvia (27/11): as respostas dos disparos de fora do Sigma entram com o que sobrar do lote. Chave = telefone.
  let filaZenvia: any[] = [];
  if (!teste && (fila ?? []).length < limite) {
    const { data: z, error: ez } = await svc.rpc("zenvia_classificar_pendentes", { p_limite: limite - (fila ?? []).length });
    if (ez) return json({ ok: false, error: ez.message }, 500);
    filaZenvia = (z ?? []).map((x: any) => ({ ...x, campanha_lead_id: null, campanha_id: null }));
  }

  if (hermes) {
    const lista = [...((fila ?? []) as any[]), ...filaZenvia];
    const estados: Record<string, number> = {};
    for (const c of lista) {
      const { data: r, error: e } = await svc.rpc("ia_trabalho_enfileirar", { p_tipo: "classificar_conversa", p_chave: chaveClassificacao(c), p_entrada: entradaClassificacao(c) });
      const st = e ? "erro" : (r?.state ?? "?");
      estados[st] = (estados[st] ?? 0) + 1;
    }
    return json({ ok: true, motor: "hermes", na_fila: lista.length, enfileirar: estados });
  }

  let gravadas = 0;
  const erros: string[] = [];
  let parar = false;
  const lista = [...((fila ?? []) as any[]), ...filaZenvia];

  for (let i = 0; i < lista.length && !parar; i += PARALELO) {
    await Promise.all(lista.slice(i, i + PARALELO).map(async (c) => {
      try {
        const r = await classificar(chave!, c.conversa || "");
        const linha = linhaClassificacao(r, c, MODELOS[modeloAtual]);
        if (teste) { erros.push(JSON.stringify(linha)); return; }
        const { error: e } = await svc.from("conversa_classificacao")
          .upsert(linha, { onConflict: linha.zenvia_telefone ? "zenvia_telefone" : "campanha_lead_id" });
        if (e) throw e;
        gravadas++;
      } catch (e: any) {
        erros.push(e?.message || String(e));
        if (e?.fatal) parar = true;
      }
    }));
  }

  return json({ ok: !parar, na_fila: lista.length, gravadas, erros: erros.slice(0, 5), parou_por_credito: parar });
});
