// T08 — processa em lote comprovantes de pagamento (PDFs) já subidos no bucket
// privado 'financeiro-anexos' e CASA cada arquivo a um médico pelo nome lido no
// PDF. Fluxo por arquivo:
//   1. baixa o PDF do bucket → extrai o texto (unpdf.extractText). PDF-imagem/erro → texto ''.
//   2. normaliza (minúsculas, sem acento) e procura, entre os candidatos, qual
//      profissional_nome aparece no texto (match por nome+sobrenome, ordem tolerada).
//   3. match EXATO (=1): anexa em financeiro_anexos (tipo=comprovante), marca o
//      pagamento como pago (comprovante_status=enviado, data_pagamento=hoje) e tenta
//      encaminhar à contabilidade via edge financeiro-enviar-comprovante (best-effort).
//   4. 0 ou >1 matches: joga em financeiro_comprovantes_pendentes p/ resolução manual.
// Candidatos = financeiro_pagamentos de fechamentos APROVADOS, ainda não pagos.
//
// Chamada do front autenticado → deploy com verificação JWT normal (SEM --no-verify-jwt).
// Um try/catch por arquivo garante que 1 PDF ruim não derruba o lote inteiro.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// remove acento, baixa caixa, colapsa espaços — pra casar nome do PDF com o cadastro.
function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // faixa de marcas diacríticas combinantes (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// tokens "de verdade" do nome (ignora conectivos e partículas curtas).
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "dr", "dra", "drª", "sr", "sra"]);
function nameTokens(nome: string): string[] {
  return norm(nome).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
}

// Casa um candidato ao texto do PDF: exige que os tokens fortes do nome
// (primeiro + último significativos) apareçam no texto, em qualquer ordem.
function matchesText(nome: string, textoNorm: string): boolean {
  const toks = nameTokens(nome);
  if (toks.length === 0) return false;
  // Precisamos do primeiro e do último token (nome + sobrenome) presentes.
  const primeiro = toks[0];
  const ultimo = toks[toks.length - 1];
  const temPrimeiro = new RegExp(`\\b${primeiro}\\b`).test(textoNorm);
  const temUltimo = new RegExp(`\\b${ultimo}\\b`).test(textoNorm);
  if (toks.length === 1) return temPrimeiro;
  return temPrimeiro && temUltimo;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { paths = [] } = await req.json().catch(() => ({}));
    if (!Array.isArray(paths) || paths.length === 0) {
      return json({ ok: false, error: "paths obrigatório (array não vazio)" }, 400);
    }

    // Autorização: a edge usa service_role (ignora RLS), então precisa checar o papel
    // do chamador na mão. Só gestor_financeiro/diretoria/admin processam comprovantes.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: uData } = await supabase.auth.getUser(token);
    const uid = uData?.user?.id;
    if (!uid) return json({ ok: false, error: "não autenticado" }, 401);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const autorizado = (roles ?? []).some((r: any) => ["gestor_financeiro", "diretoria", "admin"].includes(r.role));
    if (!autorizado) return json({ ok: false, error: "sem permissão para processar comprovantes" }, 403);

    // Candidatos: pagamentos de fechamentos aprovados, ainda não pagos.
    const { data: fechAprovados } = await supabase
      .from("financeiro_fechamentos")
      .select("id")
      .eq("status", "aprovado");
    const fechIds = (fechAprovados ?? []).map((f: any) => f.id);

    let candidatos: any[] = [];
    if (fechIds.length > 0) {
      const { data: pags } = await supabase
        .from("financeiro_pagamentos")
        .select("id, profissional_nome, profissional_crm, valor_total, fechamento_id, status")
        .in("fechamento_id", fechIds)
        .neq("status", "pago");
      candidatos = pags ?? [];
    }

    const casados: any[] = [];
    const pendentes: any[] = [];

    for (const item of paths) {
      const path = item?.path;
      const nome = item?.nome ?? (path ? String(path).split("/").pop() : "comprovante.pdf");
      const mime = item?.mime ?? "application/pdf";
      if (!path) continue;

      try {
        // 1. baixa o PDF do bucket privado.
        const { data: file, error: dErr } = await supabase.storage.from("financeiro-anexos").download(path);
        if (dErr || !file) {
          pendentes.push({ arquivo_path: path, arquivo_nome: nome, motivo: "falha ao baixar arquivo" });
          await supabase.from("financeiro_comprovantes_pendentes").insert({
            arquivo_path: path, arquivo_nome: nome, mime, texto_extraido: "", candidatos: [],
            motivo: "falha ao baixar arquivo", resolvido: false,
          });
          continue;
        }

        // 2. extrai texto. PDF-imagem/erro → texto vazio (cai em pendente).
        let texto = "";
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const pdf = await getDocumentProxy(bytes);
          const res = await extractText(pdf, { mergePages: true });
          texto = Array.isArray(res?.text) ? res.text.join("\n") : String(res?.text ?? "");
        } catch (_e) {
          texto = "";
        }
        const textoNorm = norm(texto);

        // 3. procura quais candidatos batem com o nome no texto.
        let matches: any[] = [];
        if (textoNorm) {
          matches = candidatos.filter((c) => matchesText(c.profissional_nome ?? "", textoNorm));
        }

        if (matches.length === 1) {
          const pag = matches[0];
          const hoje = new Date().toISOString().slice(0, 10);

          // anexa o comprovante ao pagamento — só marca pago se o anexo REALMENTE gravar.
          const { data: anexoIns, error: anexoErr } = await supabase.from("financeiro_anexos").insert({
            pagamento_id: pag.id, tipo: "comprovante", arquivo_path: path,
            arquivo_nome: nome, mime, status: "recebido",
          }).select("id").single();
          if (anexoErr || !anexoIns) {
            await supabase.from("financeiro_comprovantes_pendentes").insert({
              arquivo_path: path, arquivo_nome: nome, mime,
              texto_extraido: texto.slice(0, 2000), candidatos: [],
              motivo: `casou (${pag.profissional_nome}) mas falhou ao anexar: ${anexoErr?.message ?? "erro"}`,
              resolvido: false,
            });
            pendentes.push({ arquivo_path: path, arquivo_nome: nome, motivo: "falha ao anexar comprovante" });
            continue;
          }

          // marca o pagamento como pago. comprovante_status fica por conta da edge de envio
          // (financeiro-enviar-comprovante), que carimba 'enviado' só quando o e-mail confirma.
          await supabase.from("financeiro_pagamentos").update({
            status: "pago", data_pagamento: hoje,
          }).eq("id", pag.id);

          // encaminha à contabilidade (best-effort; não falha o casamento se der erro).
          try {
            await supabase.functions.invoke("financeiro-enviar-comprovante", {
              body: { pagamento_id: pag.id, anexo_id: anexoIns?.id, para: ["medico", "contabilidade"] },
            });
          } catch (_e) { /* best-effort */ }

          casados.push({
            arquivo_path: path, arquivo_nome: nome, pagamento_id: pag.id,
            profissional_nome: pag.profissional_nome, anexo_id: anexoIns?.id ?? null,
          });
          continue;
        }

        // 4. 0 ou >1 → pendente de resolução manual.
        const motivo = matches.length === 0 ? "nenhum médico casou" : "múltiplos médicos casaram";
        const cands = matches.map((c) => ({
          id: c.id, profissional_nome: c.profissional_nome,
          profissional_crm: c.profissional_crm ?? null, valor_total: c.valor_total ?? null,
        }));
        await supabase.from("financeiro_comprovantes_pendentes").insert({
          arquivo_path: path, arquivo_nome: nome, mime,
          texto_extraido: texto.slice(0, 2000), candidatos: cands, motivo, resolvido: false,
        });
        pendentes.push({ arquivo_path: path, arquivo_nome: nome, motivo, candidatos: cands });
      } catch (e: any) {
        // qualquer erro inesperado no arquivo → registra como pendente, segue o lote.
        try {
          await supabase.from("financeiro_comprovantes_pendentes").insert({
            arquivo_path: path, arquivo_nome: nome, mime,
            texto_extraido: "", candidatos: [], motivo: `erro: ${String(e?.message || e)}`, resolvido: false,
          });
        } catch (_e2) { /* ignore */ }
        pendentes.push({ arquivo_path: path, arquivo_nome: nome, motivo: `erro: ${String(e?.message || e)}` });
      }
    }

    return json({ ok: true, casados, pendentes });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
