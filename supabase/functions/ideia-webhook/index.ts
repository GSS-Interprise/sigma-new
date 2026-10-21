import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Webhook do Ideia Signer (T11 de docs/arquitetura/licitacoes-contratos-gss.md).
// O Ideia chama esta URL a cada evento da organização GSS (não dá para escolher o evento). Tudo o que
// chega fica em ideia_eventos, porque o formato exato só será conhecido no primeiro documento de teste.
// Quando o evento é a assinatura de um signatário que é médico/lead do Sigma (CPF ou e-mail), avisa
// quem converteu o médico (leads.convertido_por) e, sem conversor conhecido, a gestão de contratos.
// Autenticação: header X-Api-Key (ou Bearer, ou ?key=) igual à chave guardada em integracao_segredos.
// Responde 200 rápido sempre que a chave confere, para o Ideia não reenviar em loop.

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// percorre o JSON do Ideia sem depender do formato: guarda cada valor pelo caminho ("signer.name")
function coletar(obj: any, acc: Record<string, string[]> = {}, caminho = ""): Record<string, string[]> {
  if (obj == null) return acc;
  if (Array.isArray(obj)) { obj.forEach((v) => coletar(v, acc, caminho)); return acc; }
  if (typeof obj === "object") { for (const [k, v] of Object.entries(obj)) coletar(v, acc, caminho ? `${caminho}.${k.toLowerCase()}` : k.toLowerCase()); return acc; }
  (acc[caminho] ??= []).push(String(obj));
  return acc;
}
// primeiro valor cujo caminho casa com algum padrão, na ordem de preferência dos padrões
const primeiro = (acc: Record<string, string[]>, ...padroes: RegExp[]) => {
  for (const re of padroes) {
    const v = Object.entries(acc).find(([k]) => re.test(k))?.[1]?.find((x) => x && x !== "null");
    if (v) return v;
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method === "GET") return json({ ok: true, servico: "ideia-webhook" });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: seg } = await svc.from("integracao_segredos").select("valor").eq("nome", "ideia_webhook_key").maybeSingle();
  const esperada = seg?.valor || "";
  const recebida = req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("key") || "";
  if (!esperada || recebida !== esperada) return json({ ok: false, error: "nao_autorizado" }, 401);

  const bruto = await req.text();
  let payload: any;
  try { payload = JSON.parse(bruto); } catch { payload = { texto: bruto.slice(0, 20000) }; }

  const campos = coletar(payload);
  const evento = primeiro(campos, /(^|\.)(event|evento|type|tipo|action|acao)$/, /(^|\.)(status|situacao)$/);
  const documento = primeiro(campos, /(document|documento|envelope)[^.]*\.(name|nome|title|titulo|filename)$/, /(^|\.)(document_?name|nome_?documento|title|titulo|filename)$/, /^data\.name$/);
  // formato real (teste de 14/10, evento DocumentSigned): data.signature.{name, identifier = CPF, emailAddress}
  const email = primeiro(campos, /(signer|signatario|assinante|signatory|signature)[^.]*\.(e?-?mail|emailaddress)$/, /(^|\.|_)e?-?mail$/) ?? (bruto.match(RE_EMAIL)?.[0] ?? null);
  const cpfBruto = primeiro(campos, /(signer|signatario|assinante|signatory|signature)[^.]*\.(cpf|document_?number|documento|taxid|identifier)$/, /(cpf|document_?number|taxid)$/);
  const cpf = cpfBruto && soDigitos(cpfBruto).length === 11 ? soDigitos(cpfBruto) : null;
  const nome = primeiro(campos, /(signer|signatario|assinante|signatory|signature)[^.]*\.(name|nome|full_?name)$/, /(^|\.)(signer_?name|nome_?signatario|signatario)$/);
  const texto = `${evento ?? ""} ${bruto.slice(0, 4000)}`.toLowerCase();
  // assinatura de signatário: fala em assinar e não em recusar/cancelar
  const assinou = /(sign|assin)/.test(evento?.toLowerCase() ?? texto) && !/(recus|refus|reject|cancel|expir)/.test(evento?.toLowerCase() ?? "");

  const linha: any = { evento, documento, signatario_nome: nome, signatario_email: email?.toLowerCase() ?? null, signatario_cpf: cpf, payload, assinatura_medico: false };
  try {
    if (assinou && (cpf || email)) {
      // médico pelo CPF ou e-mail; senão o lead
      let medico: any = null, lead: any = null;
      if (cpf) ({ data: medico } = await svc.from("medicos").select("id, nome_completo, lead_id").eq("cpf", cpf).limit(1).maybeSingle());
      if (!medico && email) ({ data: medico } = await svc.from("medicos").select("id, nome_completo, lead_id").ilike("email", email).limit(1).maybeSingle());
      const leadId = medico?.lead_id ?? null;
      if (leadId) ({ data: lead } = await svc.from("leads").select("id, nome, convertido_por").eq("id", leadId).maybeSingle());
      if (!lead && cpf) ({ data: lead } = await svc.from("leads").select("id, nome, convertido_por").eq("cpf", cpf).limit(1).maybeSingle());
      if (!lead && email) ({ data: lead } = await svc.from("leads").select("id, nome, convertido_por").ilike("email", email).limit(1).maybeSingle());
      if (medico || lead) {
        linha.assinatura_medico = true;
        linha.medico_id = medico?.id ?? null;
        linha.lead_id = lead?.id ?? null;
        let avisar: string[] = lead?.convertido_por ? [lead.convertido_por] : [];
        if (!avisar.length) {
          const { data: gc } = await svc.from("user_roles").select("user_id").eq("role", "gestor_contratos");
          avisar = (gc ?? []).map((g: any) => g.user_id);
        }
        const quem = medico?.nome_completo || lead?.nome || nome || "Médico";
        await svc.from("system_notifications").insert(avisar.map((uid) => ({
          user_id: uid, tipo: "ideia_assinatura", titulo: `✍️ ${quem} assinou no Ideia`,
          mensagem: documento ? `Documento: ${documento}` : "Contrato assinado pelo médico no Ideia Signer.",
          link: medico?.id ? `/medicos?id=${medico.id}` : "/contratos", referencia_id: medico?.id ?? lead?.id ?? null,
        })));
        linha.avisados = avisar;
      }
    }
  } catch (e: any) {
    linha.erro = e?.message || String(e);
    console.error("ideia", linha.erro);
  }
  // Documento concluído: baixa o PDF assinado pela API do Ideia e anexa nos documentos de cada médico que assinou
  // (a assinatura do médico chegou antes, em DocumentSigned). Precisa da chave da API (integracao_segredos
  // "ideia_api_key", formato "app|chave"); sem ela não faz nada. Uma vez por médico e documento.
  try {
    const docId = payload?.data?.id;
    if (evento === "DocumentConcluded" && docId) {
      const { data: k } = await svc.from("integracao_segredos").select("valor").eq("nome", "ideia_api_key").maybeSingle();
      const { data: assinaturas } = await svc.from("ideia_eventos").select("medico_id")
        .eq("evento", "DocumentSigned").not("medico_id", "is", null).filter("payload->data->>id", "eq", docId);
      const medicos = [...new Set((assinaturas ?? []).map((a: any) => a.medico_id as string))];
      if (k?.valor && medicos.length) {
        const r = await fetch(`https://app.ideiasigner.com.br/api/documents/${docId}/content?type=PrinterFriendlyVersion`,
          { headers: { "X-Api-Key": k.valor } });
        if (!r.ok) throw new Error(`download_${r.status}`);
        const pdf = new Uint8Array(await r.arrayBuffer());
        const nomeArq = `${(documento || "contrato").replace(/[^\w\-. ]+/g, "_").slice(0, 80)}.pdf`;
        for (const medicoId of medicos) {
          const marca = `ideia:${docId}`;
          const { data: ja } = await svc.from("medico_documentos").select("id").eq("medico_id", medicoId).eq("observacoes", marca).maybeSingle();
          if (ja) continue;
          const path = `${medicoId}/${Date.now()}_${nomeArq}`;
          const { error: upErr } = await svc.storage.from("medicos-documentos").upload(path, pdf, { contentType: "application/pdf" });
          if (upErr) throw upErr;
          await svc.from("medico_documentos").insert({
            medico_id: medicoId, arquivo_path: path, arquivo_nome: `Contrato assinado - ${nomeArq}`,
            tipo_documento: "contrato_aditivo", emissor: "Ideia Signer", data_emissao: new Date().toISOString().slice(0, 10),
            observacoes: marca,
          });
        }
        linha.medico_id = medicos[0];
      }
    }
  } catch (e: any) {
    linha.erro = `pdf: ${e?.message || String(e)}`;
    console.error("ideia pdf", linha.erro);
  }

  const { error } = await svc.from("ideia_eventos").insert(linha);
  if (error) console.error("ideia_eventos", error.message);
  return json({ ok: true });
});
