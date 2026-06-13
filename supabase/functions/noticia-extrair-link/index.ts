import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extrai dados estruturados de uma notícia a partir do link (portal, Instagram, etc.)
// pra pré-preencher o cadastro no Banco de Notícias. Best-effort: se o fetch falhar
// (ex: Instagram com login wall), retorna ok:false e o usuário preenche manual.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return jsonResp({ ok: false, error: "OPENAI_API_KEY não configurada" }, 500);

  try {
    const { url } = await req.json();
    if (!url || !/^https?:\/\//i.test(url)) throw new Error("URL inválida");

    // 1. Buscar a página
    let html = "";
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        redirect: "follow",
      });
      html = await r.text();
    } catch (_) {
      return jsonResp({ ok: false, reason: "fetch_failed", message: "Não consegui abrir o link (pode exigir login, ex: Instagram). Preencha manualmente." });
    }

    // 2. Extrair texto relevante (og tags + título + corpo limpo)
    const meta = (prop: string) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
      const m = html.match(re);
      return m ? decodeEntities(m[1]) : "";
    };
    const titleTag = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
    const ogTitle = meta("og:title");
    const ogDesc = meta("og:description");
    const metaDesc = meta("description");
    const corpo = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    const contexto = [
      ogTitle && `Título: ${ogTitle}`,
      titleTag && `Página: ${titleTag}`,
      (ogDesc || metaDesc) && `Descrição: ${ogDesc || metaDesc}`,
      corpo && `Conteúdo: ${corpo}`,
    ].filter(Boolean).join("\n");

    if (contexto.length < 40) {
      return jsonResp({ ok: false, reason: "sem_conteudo", message: "Não consegui extrair conteúdo do link. Preencha manualmente." });
    }

    // 3. Estruturar via IA
    const prompt = `Você organiza um "banco de notícias" da GSS (agência de plantões médicos) sobre HOSPITAIS que não pagam ou têm má reputação, pras captadoras usarem de argumento com médicos.

Extraia do conteúdo abaixo os dados da ocorrência. Responda APENAS JSON:
{
  "hospital_nome": "nome do hospital/local citado (ou '' se não identificar)",
  "uf": "sigla do estado ou ''",
  "cidade": "cidade ou ''",
  "tipo": "calote | atraso_pagamento | processo_trabalhista | ma_reputacao | outro",
  "titulo": "título curto e objetivo da ocorrência",
  "resumo": "2-3 frases resumindo o que aconteceu",
  "data_fato": "AAAA-MM-DD ou null se não houver data clara",
  "gravidade": 1
}
gravidade: 1=baixa, 2=média, 3=alta (calote/processo grave = 3). Acentuação correta em PT-BR.

CONTEÚDO:
${contexto}`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`OpenAI ${aiResp.status}: ${t.slice(0, 200)}`);
    }
    const aiData = await aiResp.json();
    const dados = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

    return jsonResp({ ok: true, dados, fonte_url: url });
  } catch (err) {
    console.error("[noticia-extrair-link]", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
