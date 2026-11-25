// Recebe os eventos da Zenvia (assinaturas da API v2: MESSAGE_STATUS e MESSAGE IN/OUT do canal WhatsApp) e grava em
// zenvia_eventos, para o BI comparar os disparos da Zenvia com os da Chakra (Raul, 18/11; tabela e motivo na migração
// 20261118120000_zenvia_eventos.sql).
// Segurança: a assinatura na Zenvia manda o cabeçalho x-sigma-chave com o segredo ZENVIA_WEBHOOK_SEGREDO; sem ele,
// 401. verify_jwt desligado (a Zenvia não manda JWT do Supabase).
// Responde 200 rápido sempre que o segredo bate, mesmo com payload estranho (fica cru em payload): a Zenvia
// reenvia e pode desligar a assinatura se receber erro repetido.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Só dígitos e sempre com 55: a GSS cadastrou contatos sem DDI e a resposta volta com 55.
export function telefoneNorm(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

// deno-lint-ignore no-explicit-any
export function normalizar(ev: any) {
  const msg = ev?.message ?? {};
  const tipo = String(ev?.type ?? "").toUpperCase() || "DESCONHECIDO";
  const direcao = String(ev?.direction ?? msg?.direction ?? "").toUpperCase() || null;
  const de = msg?.from ?? null, para = msg?.to ?? null;
  // O médico é o "to" no nosso envio e o "from" na resposta.
  const tel = direcao === "IN" ? telefoneNorm(de) : telefoneNorm(para);
  // deno-lint-ignore no-explicit-any
  const texto = (msg?.contents ?? []).map((c: any) => c?.text ?? c?.payload ?? "").filter(Boolean).join("\n") || null;
  return {
    evento_id: ev?.id ? String(ev.id) : null,
    tipo,
    canal: ev?.channel ?? msg?.channel ?? null,
    direcao,
    message_id: ev?.messageId ?? msg?.id ?? null,
    status: ev?.messageStatus?.code ?? null,
    status_descricao: ev?.messageStatus?.description ?? null,
    evento_em: ev?.messageStatus?.timestamp ?? ev?.timestamp ?? msg?.timestamp ?? new Date().toISOString(),
    remetente: de, destinatario: para, telefone_norm: tel,
    // MESSAGE OUT (assinatura de 25/11): texto do que a Zenvia enviou (disparo ou resposta da equipe pela Zenvia),
    // para Conversas mostrar o texto em vez de só o status.
    texto: tipo === "MESSAGE" ? texto : null,
    payload: ev,
  };
}

if (import.meta.main) serve(async (req) => {
  if (req.method === "GET") return json({ ok: true }); // a Zenvia (e nós) podemos testar se a URL responde
  if (req.method !== "POST") return json({ ok: false }, 405);
  const segredo = Deno.env.get("ZENVIA_WEBHOOK_SEGREDO") || "";
  if (!segredo || req.headers.get("x-sigma-chave") !== segredo) return json({ ok: false, error: "sem_permissao" }, 401);
  const corpo = await req.json().catch(() => null);
  if (!corpo) return json({ ok: true, ignorado: "corpo_vazio" });
  const eventos = Array.isArray(corpo) ? corpo : [corpo];
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const linhas = eventos.map(normalizar);
  // Evento repetido (mesmo id) não duplica: o índice único ignora.
  const { error } = await sb.from("zenvia_eventos").upsert(linhas, { onConflict: "evento_id", ignoreDuplicates: true });
  if (error) {
    console.error("[zenvia-webhook]", error.message);
    // Grava sem o id para não perder o evento se o problema for o índice parcial.
    await sb.from("zenvia_eventos").insert(linhas.map((l) => ({ ...l, evento_id: null })));
  }
  return json({ ok: true, gravados: linhas.length });
});
