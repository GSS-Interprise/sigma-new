// Fase 7.2 (Raio-X do mercado): classifica cada conversa de campanha em um resultado e,
// quando houver, uma objeção principal. Categorias: docs/arquitetura/bi-raio-x-mercado-medico.md §3.
// Fila: RPC conversas_classificar_pendentes (médico respondeu depois do 1º envio e ainda não
// classificado, ou falou de novo). Cron a cada 10 min, 40 por rodada (limite por minuto do Gemini gratuito).
// Só service role (cron) ou admin. { teste: true } classifica 1 conversa e não grava.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// Gemini desde 09/11: a OpenAI ficou sem crédito (D-G). gemini-2.5-* não aceita conta nova (404).
// Chave no plano gratuito: o limite é por minuto. Lote pequeno, 2 por vez, e cron a cada 10 min (não a cada 2 h).
const MODELO = "gemini-3.5-flash-lite";
const PARALELO = 2;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RESULTADOS = ["interessado", "objecao", "sem_interesse", "filtro_secretaria", "indicacao", "contato_errado", "fora_do_perfil", "desconfianca"];
const OBJECOES = ["distancia", "agenda", "valor", "modelo_trabalho", "so_remoto", "estrutura", "outro"];
const UNIDADES = ["plantao_12h", "plantao_24h", "hora", "exame", "mes"];

const PROMPT = `Você classifica conversas de WhatsApp entre a GSS (empresa que oferece plantões e vagas a médicos) e um médico.
Leia a conversa e devolva SÓ um JSON com estes campos:
- "resultado": um de
  "interessado" (quer detalhes, mandou datas, aceitou conversar),
  "objecao" (disse não e deu um motivo),
  "sem_interesse" (disse não sem motivo),
  "filtro_secretaria" (respondeu secretária, consultório ou resposta automática),
  "indicacao" (indicou outro médico),
  "contato_errado" (o número não é do médico),
  "fora_do_perfil" (aposentado, não atua mais, outra área),
  "desconfianca" (quer saber quem é ou de onde veio o contato).
  Vale a posição final do médico na conversa.
- "objecao": só se resultado = "objecao", um de "distancia" (mora longe, não muda de cidade), "agenda" (sem horário),
  "valor" (valor baixo), "modelo_trabalho" (vínculo, PJ, noturno, fim de semana, carga), "so_remoto" (só telemedicina),
  "estrutura" (estrutura ou volume do hospital), "outro". Senão null.
- "objecao_detalhe": até 80 caracteres explicando, ou null.
- "valor_pedido": número em reais que o MÉDICO pediu ou disse aceitar, ou null. Não use valor oferecido pela GSS.
- "valor_unidade": "plantao_12h", "plantao_24h", "hora", "exame" ou "mes", ou null.
- "cidade_medico" e "uf_medico": onde o médico diz que mora ou atua (UF com 2 letras), ou null.
- "disponibilidade": dias ou turnos que o médico citou (até 60 caracteres), ou null.
- "trecho": a frase do médico que melhor mostra o resultado, até 160 caracteres, SEM nomes de pessoas, ou null.
- "confianca": de 0 a 1.`;

async function classificar(chave: string, conversa: string, tentativa = 0): Promise<any> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
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

// A IA às vezes devolve fora da lista; o banco recusa (check), então limpa aqui.
const um = (v: unknown, lista: string[]) => (typeof v === "string" && lista.includes(v) ? v : null);
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null; };

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

  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) return json({ ok: false, error: "sem_chave_gemini" }, 500);
  const body = await req.json().catch(() => ({}));
  const teste = body?.teste === true;
  const limite = teste ? 1 : Math.min(Math.max(Number(body?.limite) || 20, 1), 40);

  const { data: fila, error } = await svc.rpc("conversas_classificar_pendentes", { p_limite: limite });
  if (error) return json({ ok: false, error: error.message }, 500);

  let gravadas = 0;
  const erros: string[] = [];
  let parar = false;
  const lista = (fila ?? []) as any[];

  for (let i = 0; i < lista.length && !parar; i += PARALELO) {
    await Promise.all(lista.slice(i, i + PARALELO).map(async (c) => {
      try {
        const r = await classificar(chave, c.conversa || "");
        const resultado = um(r.resultado, RESULTADOS) ?? "sem_interesse";
        const linha = {
          campanha_lead_id: c.campanha_lead_id, lead_id: c.lead_id, campanha_id: c.campanha_id, especialidade_id: c.especialidade_id,
          resultado,
          objecao: resultado === "objecao" ? um(r.objecao, OBJECOES) ?? "outro" : null,
          objecao_detalhe: texto(r.objecao_detalhe, 120),
          valor_pedido: numero(r.valor_pedido),
          valor_unidade: um(r.valor_unidade, UNIDADES),
          cidade_medico: texto(r.cidade_medico, 80),
          uf_medico: typeof r.uf_medico === "string" && /^[A-Za-z]{2}$/.test(r.uf_medico) ? r.uf_medico.toUpperCase() : null,
          disponibilidade: texto(r.disponibilidade, 80),
          trecho: texto(r.trecho, 160),
          confianca: Math.min(Math.max(Number(r.confianca) || 0, 0), 1),
          modelo: MODELO,
          mensagens_ate: c.ultima_do_medico,
          classificado_em: new Date().toISOString(),
        };
        if (teste) { erros.push(JSON.stringify(linha)); return; }
        const { error: e } = await svc.from("conversa_classificacao").upsert(linha, { onConflict: "campanha_lead_id" });
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
