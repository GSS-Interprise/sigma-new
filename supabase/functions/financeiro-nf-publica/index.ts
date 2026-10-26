// Link público da nota fiscal do médico, para o lançamento no Conta Azul (26/10/2026).
//
// A API do Conta Azul não aceita anexo, então a observação do lançamento leva
//   <SUPABASE_URL>/functions/v1/financeiro-nf-publica?t=<token>
// e a contabilidade abre a nota sem login. O token é aleatório (36 caracteres hexadecimais) e
// único por pagamento (financeiro_pagamentos.nf_link_token). Abre SÓ a nota daquele pagamento,
// por um link assinado de 5 minutos no bucket privado; nada mais do pagamento é exposto.
// O arquivo é lido na hora do acesso: lançamento feito SEM NF passa a abrir a nota quando ela chegar.
//
// verify_jwt = false (o acesso é pelo token, não por login).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "financeiro-anexos";
const pagina = (titulo: string, texto: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${titulo}</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#26354a">` +
    `<h2 style="color:#162a46">${titulo}</h2><p>${texto}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f]{36}$/.test(token)) return pagina("Link inválido", "Confira se o link foi copiado inteiro.", 400);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: p } = await svc.from("financeiro_pagamentos").select("nf_arquivo_path").eq("nf_link_token", token).maybeSingle();
  if (!p) return pagina("Link inválido", "Este link não corresponde a nenhuma nota.", 404);
  if (!p.nf_arquivo_path) return pagina("Nota ainda não recebida", "O médico ainda não enviou a nota fiscal deste pagamento. O mesmo link abre a nota assim que ela chegar.");

  const { data: assinado, error } = await svc.storage.from(BUCKET).createSignedUrl(p.nf_arquivo_path, 300);
  if (error || !assinado?.signedUrl) return pagina("Nota indisponível", "Não foi possível abrir a nota agora. Tente de novo em instantes.", 500);
  return Response.redirect(assinado.signedUrl, 302);
});
