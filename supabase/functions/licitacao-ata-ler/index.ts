import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Lê a ata da sessão anexada ao card e devolve, por lote, o arrematante e as empresas que ficaram
// à frente da GSS, com valores e situação (T7 de docs/arquitetura/licitacoes-contratos-gss.md;
// pedido da Bianca em 07/10: "só interessam as empresas acima da GSS e o arrematante").
// Não grava nada: a tela mostra para a equipe revisar e é ela quem salva. A IA apoia; quem decide
// é a equipe. Chamado pela tela, com o usuário logado.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKETS = new Set(["licitacoes-anexos", "editais-pdfs"]);
const GSS_CNPJ = "18670594000103";
const LIMITE_BYTES = 25 * 1024 * 1024;
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
// GSS pelo CNPJ; sem CNPJ na ata, pelo nome ("GSS - Gestão Serviços à Saúde Ltda")
const ehGss = (p: any) => soDigitos(p.cnpj) === GSS_CNPJ ||
  (!soDigitos(p.cnpj) && /\bGSS\b|GEST[AÃ]O\s+(DE\s+)?SERVI[CÇ]OS\s+(A|À|DE)\s+SA[UÚ]DE/i.test(String(p.empresa ?? "")));

const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["lotes", "observacao"],
  properties: {
    observacao: { type: ["string", "null"], description: "Algo importante da ata que não cabe nos campos (ex.: sessão suspensa, recurso aberto). Nulo se nada." },
    lotes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["lote", "descricao", "participantes"],
        properties: {
          lote: { type: ["string", "null"], description: "Número/nome do lote ou item como escrito na ata; nulo se a ata não divide em lotes." },
          descricao: { type: ["string", "null"] },
          participantes: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["posicao", "empresa", "cnpj", "valor", "situacao", "motivo", "vencedor"],
              properties: {
                posicao: { type: ["integer", "null"], description: "Classificação final depois da fase de lances/negociação." },
                empresa: { type: "string" },
                cnpj: { type: ["string", "null"] },
                valor: { type: ["number", "null"], description: "Valor final ofertado (lance final ou negociado), em reais, total do lote." },
                situacao: { type: ["string", "null"], enum: ["habilitada", "inabilitada", "desclassificada", null] },
                motivo: { type: ["string", "null"], description: "Motivo da inabilitação/desclassificação, se a ata disser." },
                vencedor: { type: "boolean", description: "Arrematante/adjudicatário do lote." },
              },
            },
          },
        },
      },
    },
  },
};

const INSTRUCOES = `Você lê atas de sessão de licitação pública brasileira (pregão, concorrência, dispensa).
Extraia, para cada lote ou item, todos os participantes com: classificação final, nome da empresa, CNPJ,
valor final ofertado (lance final ou negociado; total do lote, em reais), situação (habilitada,
inabilitada ou desclassificada), motivo da inabilitação/desclassificação e quem arrematou.
Regras: copie nomes e CNPJs como estão na ata. Nunca invente: o que a ata não disser fica nulo.
Valores em número (1234567.89), sem "R$". Se a ata não divide em lotes, use um único lote com lote nulo.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // usuário logado (a função não fica pública)
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth);
  let servico = false;
  if (!user && auth) {
    // chave de serviço (teste): prova lendo uma tabela que só ela lê; nunca confiar no "role" do JWT
    const { data, error } = await createClient(supabaseUrl, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    servico = !error && Array.isArray(data);
  }
  if (!user && !servico) return json({ ok: false, error: "Faça login de novo no Sigma." }, 401);

  try {
    const { licitacao_id, bucket, path } = await req.json();
    if (!licitacao_id || !BUCKETS.has(bucket) || typeof path !== "string" || !path.startsWith(`${licitacao_id}/`)) {
      return json({ ok: false, error: "Escolha um anexo deste card." }, 400);
    }
    const { data: arquivo, error: eDl } = await svc.storage.from(bucket).download(path);
    if (eDl || !arquivo) return json({ ok: false, error: "Não consegui abrir o arquivo da ata." }, 404);
    if (arquivo.size > LIMITE_BYTES) return json({ ok: false, error: "A ata passa de 25 MB. Anexe só as páginas do resultado." }, 413);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const cab = String.fromCharCode(...bytes.slice(0, 8));
    const ehPdf = cab.startsWith("%PDF");
    const ehImagem = bytes[0] === 0xff || cab.startsWith("\x89PNG");
    if (!ehPdf && !ehImagem) return json({ ok: false, error: "A ata precisa ser PDF ou imagem." }, 415);
    const b64 = encodeBase64(bytes);
    const conteudo = ehPdf
      ? { type: "file", file: { filename: path.split("/").pop() || "ata.pdf", file_data: `data:application/pdf;base64,${b64}` } }
      : { type: "image_url", image_url: { url: `data:${cab.startsWith("\x89PNG") ? "image/png" : "image/jpeg"};base64,${b64}` } };

    // OpenAI (gpt-4o lê o PDF com as imagens das páginas); se ela recusar (cota, limite, fora do ar),
    // Gemini 2.5 Pro pelo gateway do Lovable, o mesmo que lê a folha de ponto
    let lido: any = null; let uso: any = null; let modelo = "";
    const falhas: string[] = [];
    {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o", temperature: 0, max_tokens: 6000,
          response_format: { type: "json_schema", json_schema: { name: "ata_licitacao", strict: true, schema: ESQUEMA } },
          messages: [
            { role: "system", content: INSTRUCOES },
            { role: "user", content: [{ type: "text", text: "Extraia o resultado desta ata." }, conteudo] },
          ],
        }),
      });
      if (r.ok) {
        const resp = await r.json();
        lido = JSON.parse(resp.choices?.[0]?.message?.content || "{}"); uso = resp.usage; modelo = "gpt-4o";
      } else {
        falhas.push(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
      }
    }
    if (!lido && Deno.env.get("LOVABLE_API_KEY")) {
      const doc = ehPdf
        ? { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } }
        : conteudo;
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${INSTRUCOES}
Responda só com JSON neste formato (JSON Schema):
${JSON.stringify(ESQUEMA)}` },
            { role: "user", content: [{ type: "text", text: "Extraia o resultado desta ata." }, doc] },
          ],
        }),
      });
      if (r.ok) {
        const resp = await r.json();
        const txt = String(resp.choices?.[0]?.message?.content || "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
        lido = JSON.parse(txt); uso = resp.usage; modelo = "gemini-2.5-pro";
      } else {
        falhas.push(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
      }
    }
    if (!lido) {
      console.error("ata", falhas);
      return json({ ok: false, error: "A IA não conseguiu ler a ata agora. Tente de novo em alguns minutos.", detalhe: falhas }, 502);
    }

    // por lote: GSS, arrematante e quem ficou à frente da GSS
    const lotes = (lido.lotes ?? []).map((l: any) => {
      const ps = (l.participantes ?? []) as any[];
      const gss = ps.find(ehGss) ?? null;
      const posGss = gss?.posicao ?? null;
      const relevantes = ps.filter((p) => !ehGss(p) && (p.vencedor || (posGss != null && p.posicao != null && p.posicao < posGss)));
      return {
        lote: l.lote, descricao: l.descricao, total_participantes: ps.length,
        gss: gss ? { posicao: gss.posicao, valor: gss.valor, situacao: gss.situacao, motivo: gss.motivo, vencedor: !!gss.vencedor } : null,
        empresas: relevantes.sort((a, b) => (a.posicao ?? 99) - (b.posicao ?? 99)),
      };
    });
    return json({ ok: true, lotes, observacao: lido.observacao ?? null, modelo, uso, falhas_ia: falhas.length ? falhas : undefined });
  } catch (e: any) {
    console.error(e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
