// Relatório diário de vagas em aberto (plano GSS dono no comando, Fase 4, tarefa 4.3).
//
// modo "pdf"    → qualquer usuário logado: gera o PDF de agora e devolve um link (botão "Relatório de hoje").
// modo "enviar" → cron das 7h (service role) ou admin: gera o PDF, manda por e-mail aos sócios (Resend,
//                 PDF anexo) e por WhatsApp oficial ao destino configurado (modelo gss_vagas_diario_v1).
// Destinatários em vagas_relatorio_config; cada envio fica em vagas_relatorio_envios.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { chakraKeyFor } from "../_shared/chakra.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const DE = "Sigma GSS <avisos@gestaoservicosaude.com.br>";
const MODELO_WHATSAPP = "gss_vagas_diario_v1";
const BUCKET = "vagas-relatorios";

type Vaga = {
  id: string; dias_aberta: number; faixa: string; especialidade_nome: string; tipo: string; hospital_nome: string;
  cidade: string; uf: string | null; responsavel_nome: string | null; quantidade: number; prioridade: string;
  status: string; descricao: string | null; valor: string | null;
};

const TIPO: Record<string, string> = { plantao: "Plantão", ambulatorio: "Ambulatório", fixa: "Fixa", sobreaviso: "Sobreaviso" };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
// Helvetica padrão do pdf-lib só codifica WinAnsi: travessão vira hífen e o resto fora do Latin-1 sai.
const ansi = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
const hojeBR = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dataArquivo = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  let t = ansi(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + "...", tamanho) > largura) t = t.slice(0, -1);
  return t.trimEnd() + "...";
}

async function gerarPdf(vagas: Vaga[]) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cinza = rgb(0.42, 0.45, 0.5), preto = rgb(0.1, 0.1, 0.12), vermelho = rgb(0.8, 0.15, 0.15), ambar = rgb(0.75, 0.45, 0.02);
  const M = 40, L = 595 - 2 * M;
  let pagina: PDFPage = pdf.addPage([595, 842]);
  let y = 842 - M;
  const texto = (t: string, x: number, tam = 9, f = normal, cor = preto) => pagina.drawText(ansi(t), { x, y, size: tam, font: f, color: cor });
  const novaPagina = () => { pagina = pdf.addPage([595, 842]); y = 842 - M; };

  const total = vagas.reduce((s, v) => s + v.quantidade, 0);
  const antigas = vagas.filter((v) => v.faixa === "mais_30").reduce((s, v) => s + v.quantidade, 0);
  const urgentes = vagas.filter((v) => v.prioridade === "urgente").reduce((s, v) => s + v.quantidade, 0);

  texto("Vagas em aberto - GSS", M, 18, negrito); y -= 18;
  texto(hojeBR(), M, 10, normal, cinza); y -= 26;
  texto(plural(total, "vaga aberta", "vagas abertas"), M, 12, negrito);
  texto(`${antigas} há mais de 30 dias`, M + 150, 12, negrito, antigas ? vermelho : preto);
  texto(plural(urgentes, "urgente", "urgentes"), M + 320, 12, negrito, urgentes ? ambar : preto); y -= 28;

  // Total por especialidade, da que mais tem para a que menos tem.
  const porEsp = new Map<string, number>();
  vagas.forEach((v) => porEsp.set(titulo(v.especialidade_nome), (porEsp.get(titulo(v.especialidade_nome)) || 0) + v.quantidade));
  texto("Por especialidade", M, 11, negrito); y -= 16;
  const esp = [...porEsp].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const colunas = 3, larguraCol = L / colunas;
  esp.forEach(([nome, n], i) => {
    const col = i % colunas;
    texto(cortar(nome, normal, 9, larguraCol - 30), M + col * larguraCol, 9);
    pagina.drawText(String(n), { x: M + col * larguraCol + larguraCol - 24, y, size: 9, font: negrito, color: preto });
    if (col === colunas - 1 || i === esp.length - 1) y -= 14;
  });
  y -= 14;

  // Lista: a mais antiga no topo.
  const cols = [
    { t: "Dias", w: 38 }, { t: "Especialidade", w: 120 }, { t: "Tipo", w: 70 }, { t: "Hospital e cidade", w: 190 }, { t: "Responsável", w: L - 438 },
  ];
  const cabecalho = () => {
    let x = M;
    cols.forEach((c) => { texto(c.t, x, 8, negrito, cinza); x += c.w; });
    y -= 6;
    pagina.drawLine({ start: { x: M, y }, end: { x: M + L, y }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) });
    y -= 12;
  };
  texto("Todas as vagas abertas", M, 11, negrito); y -= 18;
  cabecalho();
  for (const v of vagas) {
    if (y < M + 20) { novaPagina(); cabecalho(); }
    const cor = v.faixa === "mais_30" ? vermelho : v.faixa === "16_a_30" ? ambar : preto;
    let x = M;
    pagina.drawText(String(v.dias_aberta), { x, y, size: 10, font: negrito, color: cor }); x += cols[0].w;
    texto(cortar(titulo(v.especialidade_nome) + (v.quantidade > 1 ? ` x${v.quantidade}` : ""), normal, 9, cols[1].w - 6), x, 9); x += cols[1].w;
    texto(cortar((TIPO[v.tipo] || v.tipo) + (v.prioridade === "urgente" ? " - urg." : ""), normal, 9, cols[2].w - 6), x, 9); x += cols[2].w;
    texto(cortar(`${v.hospital_nome}, ${v.cidade}${v.uf ? `-${v.uf}` : ""}`, normal, 9, cols[3].w - 6), x, 9); x += cols[3].w;
    texto(cortar(v.responsavel_nome || "Ninguém", normal, 9, cols[4].w), x, 9, normal, v.responsavel_nome ? preto : cinza);
    y -= 15;
  }
  return { bytes: await pdf.save(), total, antigas, urgentes, porEsp: esp };
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const modo = body?.modo === "enviar" ? "enviar" : "pdf";

  // Mesmo critério de contratos-avisos: o JWT do cron pode não ser igual à env SUPABASE_SERVICE_ROLE_KEY
  // (self-hosted); vale qualquer chave que leia integracao_segredos, que só o service role lê.
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let servico = !!auth && auth === serviceKey;
  if (!servico && auth) {
    const { data, error } = await createClient(supabaseUrl, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    servico = !error && Array.isArray(data);
  }
  let admin = false;
  if (!servico) {
    const { data: { user } } = auth ? await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth) : { data: { user: null } };
    if (!user) return json({ ok: false, error: "sem_permissao" }, 401);
    const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    admin = (papeis ?? []).some((p: any) => p.role === "admin");
  }
  if (modo === "enviar" && !servico && !admin) return json({ ok: false, error: "sem_permissao" }, 403);

  try {
    const { data: vagasBrutas, error } = await svc.from("vagas_abertas_v")
      .select("id, dias_aberta, faixa, especialidade_nome, tipo, hospital_nome, cidade, uf, responsavel_nome, quantidade, prioridade, status, descricao, valor")
      .order("aberta_em", { ascending: true }).order("created_at", { ascending: true });
    if (error) throw error;
    const vagas = (vagasBrutas || []) as Vaga[];

    const { data: config } = await svc.from("vagas_relatorio_config").select("*").eq("id", true).maybeSingle();
    if (modo === "enviar" && (!config?.ativo || vagas.length === 0)) {
      await svc.from("vagas_relatorio_envios").insert({ vagas_abertas: vagas.length, email_erro: vagas.length ? "desativado" : "sem_vagas" });
      return json({ ok: true, enviado: false, motivo: vagas.length ? "desativado" : "sem_vagas" });
    }

    const r = await gerarPdf(vagas);
    const caminho = `${dataArquivo()}/vagas-${Date.now()}.pdf`;
    const { error: upErro } = await svc.storage.from(BUCKET).upload(caminho, r.bytes, { contentType: "application/pdf", upsert: true });
    if (upErro) throw upErro;
    // 7 dias: o link do WhatsApp continua abrindo se o Maikon olhar no fim de semana.
    const { data: assinado, error: urlErro } = await svc.storage.from(BUCKET).createSignedUrl(caminho, 7 * 24 * 3600);
    if (urlErro) throw urlErro;
    if (modo === "pdf") return json({ ok: true, url: assinado.signedUrl, vagas: r.total });

    // E-mail aos sócios com o PDF anexo.
    let emailOk: boolean | null = null, emailErro: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const emails: string[] = config?.emails || [];
    if (!resendKey) emailErro = "sem_resend_key";
    else if (emails.length === 0) emailErro = "sem_destinatarios";
    else {
      const linhas = vagas.slice(0, 10).map((v) =>
        `<tr><td style="padding:4px 12px 4px 0;font-weight:600;color:${v.faixa === "mais_30" ? "#c62828" : v.faixa === "16_a_30" ? "#b26a00" : "#1a1a1f"}">${v.dias_aberta} dias</td>`
        + `<td style="padding:4px 12px 4px 0">${titulo(v.especialidade_nome)} · ${TIPO[v.tipo] || v.tipo}</td>`
        + `<td style="padding:4px 0;color:#555">${v.hospital_nome}, ${v.cidade}${v.uf ? `-${v.uf}` : ""}</td></tr>`).join("");
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1f">
        <p><b>${plural(r.total, "vaga aberta", "vagas abertas")}</b> · ${r.antigas} há mais de 30 dias · ${plural(r.urgentes, "urgente", "urgentes")}</p>
        <p style="margin:16px 0 6px;color:#555">As mais antigas:</p>
        <table style="border-collapse:collapse;font-size:13px">${linhas}</table>
        <p style="margin-top:16px;color:#555">A lista completa e o total por especialidade estão no PDF anexo.</p></div>`;
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: DE, to: emails, subject: `Vagas em aberto: ${r.total} hoje, ${r.antigas} há mais de 30 dias`, html,
          attachments: [{ filename: `vagas-em-aberto-${dataArquivo()}.pdf`, content: base64(r.bytes) }],
          tags: [{ name: "origem", value: "vagas_relatorio" }],
        }),
      });
      emailOk = resp.ok;
      if (!resp.ok) emailErro = `resend_${resp.status}:${(await resp.text()).slice(0, 200)}`;
    }

    // WhatsApp oficial ao Maikon: só sai com destino configurado e modelo aprovado no número de origem.
    let whatsappOk: boolean | null = null, whatsappErro: string | null = null;
    const destino = String(config?.whatsapp_destino || "").replace(/\D/g, "");
    if (!destino) whatsappErro = "sem_destino";
    else {
      const { data: conn } = await svc.from("whatsapp_chakra_connections").select("plugin_id, phone_number_id")
        .eq("phone_e164", config?.whatsapp_numero_origem || "").maybeSingle();
      const { data: modelo } = conn ? await svc.from("whatsapp_official_templates").select("friendly_name, language")
        .eq("provider", "chakra").eq("approval_status", "approved").eq("friendly_name", MODELO_WHATSAPP)
        .like("content_sid", `chakra:${conn.plugin_id}:%`).maybeSingle() : { data: null };
      if (!conn) whatsappErro = "numero_origem_nao_encontrado";
      else if (!modelo) whatsappErro = "modelo_nao_aprovado";
      else {
        const path = `/v1/ext/plugin/whatsapp/${conn.plugin_id}/api/v24.0/${conn.phone_number_id}/messages`;
        const resp = await fetch(`https://api.chakrahq.com${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${chakraKeyFor(path)}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", recipient_type: "individual", to: destino, type: "template",
            template: {
              name: MODELO_WHATSAPP, language: { policy: "deterministic", code: modelo.language || "pt_BR" },
              components: [{ type: "body", parameters: [String(r.total), String(r.antigas), assinado.signedUrl].map((t) => ({ type: "text", text: t })) }],
            },
          }),
        });
        const raw = await resp.text();
        whatsappOk = resp.ok;
        if (!resp.ok) whatsappErro = `chakra_${resp.status}:${raw.slice(0, 200)}`;
      }
    }

    await svc.from("vagas_relatorio_envios").insert({
      vagas_abertas: r.total, pdf_path: caminho, email_ok: emailOk, email_erro: emailErro, whatsapp_ok: whatsappOk, whatsapp_erro: whatsappErro,
    });
    return json({ ok: true, enviado: true, vagas: r.total, email_ok: emailOk, email_erro: emailErro, whatsapp_ok: whatsappOk, whatsapp_erro: whatsappErro });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
