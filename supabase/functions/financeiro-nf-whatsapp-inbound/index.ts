// O médico responde o pedido mandando a NOTA pelo WhatsApp — e ela entra sozinha no
// Sigma. Chamada pelo chakra-webhook (fire-and-forget) a cada mensagem recebida.
//
// Input: { payload, phone_number_id, silencioso? }
//
// O número do financeiro é o WhatsApp de trabalho de uma pessoa: passa de tudo por ali.
// Por isso a decisão combina DOIS critérios (27/09):
//   • o que o arquivo É — PDF legível só entra se for NFS-e com a GSS de tomadora; um
//     contrato ou RG é ignorado mesmo de quem tem nota pedida;
//   • de QUEM veio — foto ou PDF escaneado (sem texto) só entra se houver nota pedida
//     em aberto para aquele telefone, e mesmo assim como "a confirmar".
// Depois identifica o médico por sinais de confiança; o que não dá para decidir com
// segurança fica "a confirmar", com o palpite preenchido.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi } from "../_shared/chakra.ts";
import { lerNfse, type Nfse } from "../_shared/nfse.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 120);
// o cadastro guarda "48 99974-3464" e o WhatsApp manda "5548999743464": compara o fim
const sufixo = (fone: string) => digits(fone).slice(-8);
// "RODRIGO KOERICH DE LIMA LTDA" → "rodrigo koerich de lima": a PJ do médico costuma
// levar o nome dele com o sufixo societário
const nomeLimpo = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|servicos medicos|servicos de saude|saude)\b/g, " ")
    .replace(/^(dr|dra|dr\.|dra\.)\s+/, "")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

type Midia = { id: string; mime: string; nome: string };
type Confianca = "forte" | "media" | "fraca";

function extrairMensagem(payload: any) {
  const raiz = payload?.value ?? payload?.entry?.[0]?.changes?.[0]?.value ?? payload;
  const msg = raiz?.messages?.[0] ?? raiz?.message ?? (raiz?.item ?? null);
  if (!msg) return null;
  const de = digits(msg.from || msg.wa_id || raiz?.contacts?.[0]?.wa_id || "");
  const doc = msg.document || null;
  const img = msg.image || null;
  const midia: Midia | null = doc
    ? { id: String(doc.id || ""), mime: String(doc.mime_type || doc.mimeType || "application/pdf"), nome: String(doc.filename || doc.fileName || "nota.pdf") }
    : img
    ? { id: String(img.id || ""), mime: String(img.mime_type || img.mimeType || "image/jpeg"), nome: "nota.jpg" }
    : null;
  const nomePerfil = String(raiz?.contacts?.[0]?.profile?.name || msg.profile?.name || "");
  const mensagemId = String(msg.id || msg.message_id || "");
  // hora da mensagem, não a do processamento: reprocessar não pode reescrever o histórico
  const epoch = Number(msg.timestamp || 0);
  const quando = epoch > 0 ? new Date(epoch * 1000).toISOString() : "";
  return { de, midia, nomePerfil, mensagemId, quando };
}

/**
 * id da mídia → bytes, pelo endpoint documentado do Chakra (apidocs.chakrahq.com,
 * "Fetch Whatsapp Media API"): o GET devolve uma URL já proxiada por eles, que aceita o
 * mesmo token. A URL que vem no webhook (lookaside.fbsbx.com) exige o token da Meta.
 */
async function baixarMidia(mediaId: string): Promise<{ bytes: Uint8Array; mime?: string }> {
  const key = Deno.env.get("CHAKRA_API_KEY")?.trim();
  const h = { Authorization: `Bearer ${key}` };
  const r = await fetch(`https://api.chakrahq.com/v1/whatsapp/v24.0/media/${mediaId}`, { headers: h });
  if (!r.ok) throw new Error(`midia_meta_${r.status}:${(await r.text()).slice(0, 120)}`);
  const meta = await r.json();
  if (!meta?.url) throw new Error("midia_sem_url");
  const arq = await fetch(String(meta.url), { headers: h });
  if (!arq.ok) throw new Error(`midia_download_${arq.status}`);
  return { bytes: new Uint8Array(await arq.arrayBuffer()), mime: String(meta.mime_type || arq.headers.get("content-type") || "") };
}

/** Pedido de NF em aberto para este telefone: a solicitação que mandamos (60 dias) ou o
 *  médico do cadastro com nota pedida. Devolve o pagamento quando a solicitação o indica. */
async function pedidoEmAberto(svc: any, telefone: string): Promise<{ aberto: boolean; pagamentoId: string | null }> {
  const fim = sufixo(telefone);
  if (!fim) return { aberto: false, pagamentoId: null };
  const desde = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const { data: solic } = await svc.from("financeiro_nf_solicitacoes")
    .select("destino, pagamento_id, created_at").eq("status", "enviada").gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(500);
  const s = (solic ?? []).find((x: any) => sufixo(x.destino || "") === fim);
  if (s) return { aberto: true, pagamentoId: s.pagamento_id };

  const { data: medicos } = await svc.from("medicos").select("id, telefone").not("telefone", "is", null);
  const ids = (medicos ?? []).filter((m: any) => sufixo(m.telefone) === fim).map((m: any) => m.id);
  if (!ids.length) return { aberto: false, pagamentoId: null };
  const { count } = await svc.from("financeiro_pagamentos")
    .select("id", { count: "exact", head: true }).in("medico_id", ids).eq("nf_status", "solicitada");
  return { aberto: (count ?? 0) > 0, pagamentoId: null };
}

/**
 * De quem é a nota. Sinal FORTE decide sozinho; sinal MÉDIO só decide se o valor da nota
 * bater com um pagamento pendente do médico. O telefone impresso na nota nunca decide:
 * costuma ser do contador, que atende vários médicos (as 3 notas da JZMF caíram em outro
 * médico por isso, no teste de 27/09). O e-mail idem, quando é do escritório contábil —
 * por isso ele só conta quando bate com o cadastro do próprio médico.
 */
async function identificarMedico(svc: any, nota: Nfse, remetente: string, perfil: string, pedidoPagamentoId: string | null) {
  // 1. o pedido que nós mandamos para este número já diz de quem é
  if (pedidoPagamentoId) {
    const { data: p } = await svc.from("financeiro_pagamentos").select("medico_id").eq("id", pedidoPagamentoId).maybeSingle();
    return { medicoId: p?.medico_id ?? null, confianca: "forte" as Confianca, via: "pedido enviado a este número", pagamentoId: pedidoPagamentoId };
  }
  // 2. CNPJ que já foi confirmado antes
  if (nota.prestadorCnpj) {
    const { data: c } = await svc.from("financeiro_medico_cnpj").select("medico_id").eq("cnpj", nota.prestadorCnpj).maybeSingle();
    if (c?.medico_id) return { medicoId: c.medico_id, confianca: "forte" as Confianca, via: "CNPJ já conhecido", pagamentoId: null };
  }

  const { data: medicos } = await svc.from("medicos").select("id, nome_completo, email, telefone");
  const lista = (medicos ?? []) as any[];

  // 3. e-mail do prestador igual ao do cadastro do médico
  if (nota.prestadorEmail) {
    const m = lista.find((x) => (x.email || "").toLowerCase().trim() === nota.prestadorEmail);
    if (m) return { medicoId: m.id, confianca: "forte" as Confianca, via: "e-mail do prestador", pagamentoId: null };
  }
  // 4. nome da empresa = nome do médico
  const np = nomeLimpo(nota.prestadorNome);
  if (np.split(" ").length >= 2) {
    const iguais = lista.filter((x) => nomeLimpo(x.nome_completo) === np);
    if (iguais.length === 1) return { medicoId: iguais[0].id, confianca: "forte" as Confianca, via: "nome do prestador", pagamentoId: null };
  }
  // 5. telefone de quem mandou (não o impresso na nota)
  const fim = sufixo(remetente);
  const porFone = lista.filter((x) => sufixo(x.telefone || "") === fim);
  if (porFone.length === 1) return { medicoId: porFone[0].id, confianca: "media" as Confianca, via: "telefone de quem enviou", pagamentoId: null };
  // 6. nome do perfil do WhatsApp contido no nome do médico, e só um candidato
  const palavras = nomeLimpo(perfil).split(" ").filter((w) => w.length > 2);
  if (palavras.length) {
    const cands = lista.filter((x) => {
      const nm = nomeLimpo(x.nome_completo).split(" ");
      return palavras.every((w) => nm.includes(w));
    });
    if (cands.length === 1) return { medicoId: cands[0].id, confianca: "media" as Confianca, via: "nome do perfil no WhatsApp", pagamentoId: null };
  }
  return { medicoId: null, confianca: "fraca" as Confianca, via: "sem sinal", pagamentoId: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // silencioso = reprocessamento de evento antigo: guarda sem reavisar ninguém
    const { payload, phone_number_id, silencioso } = await req.json().catch(() => ({}));

    const { data: cfgRows } = await svc.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["financeiro_whatsapp_sender_id", "financeiro_canal_id"]);
    const cfg = (n: string) => cfgRows?.find((c: any) => c.campo_nome === n)?.valor || "";
    const senderId = cfg("financeiro_whatsapp_sender_id");
    if (!senderId) return json({ ok: true, ignorado: "financeiro_sem_remetente" });

    const { data: sender } = await svc.from("whatsapp_official_senders")
      .select("id, phone_e164, chakra_plugin_id, chakra_phone_number_id").eq("id", senderId).maybeSingle();
    // mensagem que chegou em outro número (prospecção) não é assunto do financeiro
    if (!sender || String(sender.chakra_phone_number_id) !== String(phone_number_id ?? "")) {
      return json({ ok: true, ignorado: "outro_numero" });
    }

    const msg = extrairMensagem(payload);
    if (!msg?.midia?.id) return json({ ok: true, ignorado: "sem_documento" });

    // nota já anexada a um pagamento não volta a ser decidida: reprocessar não desfaz vínculo
    if (msg.mensagemId) {
      const { data: ja } = await svc.from("financeiro_nf_inbox")
        .select("id, status").eq("mensagem_id", msg.mensagemId).maybeSingle();
      if (ja?.status === "vinculada" || ja?.status === "descartada") {
        return json({ ok: true, ignorado: `ja_${ja.status}`, inbox_id: ja.id });
      }
    }

    const pedido = await pedidoEmAberto(svc, msg.de);
    const agora = new Date().toISOString();

    // o arquivo vai para a MEMÓRIA primeiro; só é guardado se for aceito como nota
    let arquivo: { bytes: Uint8Array; mime?: string } | null = null;
    let erroDownload: string | null = null;
    try {
      arquivo = await baixarMidia(msg.midia.id);
    } catch (e: any) {
      erroDownload = String(e?.message || e).slice(0, 300);
    }
    if (!arquivo && !pedido.aberto) return json({ ok: true, ignorado: "sem_arquivo_e_sem_pedido" });

    const mime = arquivo?.mime || msg.midia.mime;
    const ehPdf = /pdf/i.test(mime) || /\.pdf$/i.test(msg.midia.nome);
    const nota: Nfse = arquivo && ehPdf
      ? await lerNfse(arquivo.bytes)
      : { legivel: false, ehNfse: false, tomadorGss: false, prestadorCnpj: null, prestadorNome: null, prestadorEmail: null, valor: null, chave: null, descricao: null };

    // CRITÉRIO 1 — o que o arquivo é
    if (nota.legivel && !(nota.ehNfse && nota.tomadorGss)) {
      return json({ ok: true, ignorado: "documento_nao_e_nf_da_gss" });
    }
    // CRITÉRIO 2 — sem texto para ler, só vale se houver pedido em aberto
    if (!nota.legivel && !pedido.aberto) {
      return json({ ok: true, ignorado: "ilegivel_e_sem_pedido" });
    }

    // a mesma nota mandada por duas pessoas entra uma vez só
    if (nota.chave) {
      const { data: repetida } = await svc.from("financeiro_nf_inbox").select("id, mensagem_id").eq("chave_acesso", nota.chave).maybeSingle();
      if (repetida && repetida.mensagem_id !== msg.mensagemId) return json({ ok: true, ignorado: "nota_repetida", inbox_id: repetida.id });
    }

    // DE QUEM É
    const quem = nota.legivel
      ? await identificarMedico(svc, nota, msg.de, msg.nomePerfil, pedido.pagamentoId)
      : { medicoId: null, confianca: "fraca" as Confianca, via: "arquivo sem texto (foto/escaneado)", pagamentoId: pedido.pagamentoId };

    // qual pagamento: o do pedido, ou um pendente do médico — preferindo o de valor igual
    let pagamentoId: string | null = quem.pagamentoId;
    let valorBate = false;
    if (!pagamentoId && quem.medicoId) {
      const { data: pend } = await svc.from("financeiro_pagamentos")
        .select("id, valor_total, ano_referencia, mes_referencia")
        .eq("medico_id", quem.medicoId).in("nf_status", ["solicitada", "nao_solicitada"])
        .order("ano_referencia", { ascending: false }).order("mes_referencia", { ascending: false });
      const igual = (pend ?? []).find((p: any) => nota.valor != null && Math.abs(Number(p.valor_total) - nota.valor) <= 1);
      if (igual) { pagamentoId = igual.id; valorBate = true; }
      else if (quem.confianca === "forte" && (pend ?? []).length === 1) pagamentoId = pend![0].id;
    }

    const { data: pag } = pagamentoId
      ? await svc.from("financeiro_pagamentos")
        .select("id, medico_id, profissional_nome, mes_referencia, ano_referencia, valor_total").eq("id", pagamentoId).maybeSingle()
      : { data: null as any };
    if (pag && nota.valor != null) valorBate = Math.abs(Number(pag.valor_total) - nota.valor) <= 1;

    // vincula sozinho: sinal forte com pagamento, ou sinal médio com valor batendo
    const vincula = !!pag && nota.legivel && (quem.confianca === "forte" || (quem.confianca === "media" && valorBate));
    const medicoId = quem.medicoId ?? pag?.medico_id ?? null;

    let motivo = `identificado por ${quem.via}`;
    if (pag && nota.valor != null && !valorBate) motivo += ` · valor da nota ${fmtBRL(nota.valor)} diferente do a pagar ${fmtBRL(Number(pag.valor_total))}`;
    if (!pag && medicoId) motivo += " · médico sem pagamento pendente (fechamento ainda não importado?)";
    if (erroDownload) motivo += ` · arquivo não baixado: ${erroDownload}`;

    // guarda o arquivo
    let path: string | null = null;
    if (arquivo) {
      const pasta = vincula && pag
        ? `nf/${pag.ano_referencia}-${String(pag.mes_referencia).padStart(2, "0")}/${pag.id}`
        : `nf/entrada/${agora.slice(0, 7)}`;
      // reprocessar não duplica o arquivo: reaproveita o que já foi guardado
      const { data: ja } = msg.mensagemId
        ? await svc.from("financeiro_nf_inbox").select("arquivo_path").eq("mensagem_id", msg.mensagemId).maybeSingle()
        : { data: null as any };
      if (ja?.arquivo_path) path = ja.arquivo_path;
      else {
        path = `${pasta}/${Date.now()}_${sanitize(msg.midia.nome)}`;
        const { error: upErr } = await svc.storage.from("financeiro-anexos")
          .upload(path, arquivo.bytes, { contentType: mime, upsert: false });
        if (upErr) throw upErr;
      }
    }

    const status = vincula && path ? "vinculada" : "pendente";
    await svc.from("financeiro_nf_inbox").upsert({
      origem: "whatsapp", remetente: msg.de, remetente_nome: msg.nomePerfil || null,
      arquivo_nome: msg.midia.nome, arquivo_path: path, mime,
      mensagem_id: msg.mensagemId || null, recebido_em: msg.quando || agora,
      status, pagamento_id: vincula ? pag?.id ?? null : null, vinculado_em: status === "vinculada" ? agora : null,
      eh_nfse: nota.legivel ? nota.ehNfse : null, tomador_gss: nota.legivel ? nota.tomadorGss : null,
      prestador_cnpj: nota.prestadorCnpj, prestador_nome: nota.prestadorNome, prestador_email: nota.prestadorEmail,
      valor_nota: nota.valor, chave_acesso: nota.chave, descricao: nota.descricao,
      medico_id: medicoId, confianca: quem.confianca, motivo,
    }, { onConflict: "mensagem_id" });

    // aprende o CNPJ quando a identificação foi forte
    if (nota.prestadorCnpj && medicoId && quem.confianca === "forte") {
      await svc.from("financeiro_medico_cnpj").upsert({
        cnpj: nota.prestadorCnpj, medico_id: medicoId, razao: nota.prestadorNome, origem: quem.via,
      }, { onConflict: "cnpj", ignoreDuplicates: true });
    }

    if (status === "vinculada" && pag && path) {
      await svc.from("financeiro_anexos").insert({
        pagamento_id: pag.id, tipo: "nf", arquivo_path: path, arquivo_nome: msg.midia.nome, mime, status: "recebido",
      });
      await svc.from("financeiro_pagamentos").update({
        nf_status: "recebida", nf_recebida_em: agora, nf_arquivo_path: path,
      }).eq("id", pag.id);
      await svc.from("financeiro_nf_solicitacoes").update({ status: "recebida", recebida_em: agora })
        .eq("pagamento_id", pag.id).eq("status", "enviada");
    }

    if (!silencioso) {
      // confirma o recebimento para quem mandou — dentro das 24h a resposta é livre
      try {
        await chakraApi(
          `/v1/ext/plugin/whatsapp/${sender.chakra_plugin_id}/api/v24.0/${sender.chakra_phone_number_id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              messaging_product: "whatsapp", recipient_type: "individual", to: msg.de, type: "text",
              text: { body: "Nota fiscal recebida. Obrigado! Qualquer pendência o financeiro da GSS retorna por aqui." },
            }),
          },
        );
      } catch (e) {
        console.warn("[nf-whatsapp] falha ao confirmar recebimento", e);
      }

      const canalId = cfg("financeiro_canal_id");
      if (canalId) {
        const { data: parts } = await svc.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
        const autor = parts?.[0]?.user_id;
        if (autor) {
          const comp = pag ? `${MESES[pag.mes_referencia - 1]}/${pag.ano_referencia}` : "";
          const texto = status === "vinculada"
            ? `📄 *NF recebida* — Dr(a). ${pag!.profissional_nome}, ${comp}, ${fmtBRL(Number(nota.valor ?? pag!.valor_total))}. Anexada ao pagamento.`
            : `📄 *NF para confirmar* — ${nota.prestadorNome || msg.nomePerfil || msg.de}` +
              `${nota.valor != null ? `, ${fmtBRL(nota.valor)}` : ""}. ${motivo}.`;
          const { data: m } = await svc.from("comunicacao_mensagens").insert({
            canal_id: canalId, user_id: autor, user_nome: "Notas fiscais", mensagem: texto,
          }).select("id").single();
          if (m && parts?.length) {
            await svc.from("comunicacao_notificacoes").insert(
              parts.filter((p: any) => p.user_id !== autor).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id })),
            );
          }
        }
      }
    }

    return json({
      ok: true, status, confianca: quem.confianca, via: quem.via, valor_bate: valorBate,
      prestador: nota.prestadorNome, valor: nota.valor, medico_id: medicoId, pagamento_id: vincula ? pag?.id : null,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
