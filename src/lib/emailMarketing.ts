// Cópia do modelo de e-mail marketing para a PRÉVIA na tela.
//
// ⚠ Fonte da verdade: supabase/functions/_shared/email-marketing.ts (é o que envia).
// As duas precisam gerar o mesmo HTML — mudou lá, muda aqui.

export type EmailConteudo = {
  modo?: "modelo" | "html" | null;
  titulo?: string | null;
  mensagem?: string | null;
  botao_texto?: string | null;
  botao_link?: string | null;
  imagem_url?: string | null; // arte no topo do modelo
  html?: string | null;       // HTML próprio
};

export type EmailVars = {
  nome?: string | null;
  especialidade?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export const MAX_HTML = 300_000; // caracteres; acima disso o Gmail corta o e-mail ("mensagem cortada")

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const primeiroNome = (nome?: string | null) => {
  const n = (nome ?? "").trim().replace(/^(dr|dra)\.?\s+/i, "").split(/\s+/)[0] ?? "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
};

/** Troca {{nome}}, {{primeiro_nome}}, {{especialidade}}, {{cidade}}, {{uf}}. */
export function aplicarVariaveis(texto: string, v: EmailVars): string {
  return texto
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, primeiroNome(v.nome) || "doutor(a)")
    .replace(/\{\{\s*nome\s*\}\}/gi, (v.nome ?? "").trim() || "doutor(a)")
    .replace(/\{\{\s*especialidade\s*\}\}/gi, (v.especialidade ?? "").trim())
    .replace(/\{\{\s*cidade\s*\}\}/gi, (v.cidade ?? "").trim())
    .replace(/\{\{\s*uf\s*\}\}/gi, (v.uf ?? "").trim());
}

/** O conteúdo tem o mínimo para ser enviado? */
export function conteudoPronto(c: EmailConteudo | null | undefined): boolean {
  if (!c) return false;
  return c.modo === "html" ? !!(c.html ?? "").trim() : !!(c.mensagem ?? "").trim();
}

// ── Modelo GSS (14/10): identidade das artes da GSS — fundo verde-limão e três cartões
// empilhados (verde-claro com o título, verde-escuro com o destaque, branco com o fechamento e
// o botão). A equipe escreve texto puro; a formatação vem de quatro marcas simples:
//   **negrito**   _itálico_   # subtítulo   - item (vira ✓)   1. item (numerado)   --- (troca de cartão)
// Sem "---" o texto vai inteiro no cartão branco. Com um "---": escuro + branco. Com dois:
// chamada no cartão do título + escuro + branco.
const MARCA = {
  limao: "#a7cc3e", claro: "#80c628", escuro: "#14653a", destaque: "#9fe03a", texto: "#2f4a3a",
  logo: "https://zupsbgtoeoixfokzkjro.supabase.co/storage/v1/object/public/email-artes/marca/gss-simbolo.png",
  fonte: "'Montserrat','Segoe UI',Arial,sans-serif",
};
type Tema = { texto: string; forte: string; subtitulo: string; check: string };
const TEMAS: Record<"claro" | "escuro" | "branco", Tema> = {
  claro: { texto: "#14653a", forte: "#0e4a2a", subtitulo: "#0e4a2a", check: "#ffffff" },
  escuro: { texto: "#e9f6ee", forte: "#ffffff", subtitulo: MARCA.destaque, check: MARCA.destaque },
  branco: { texto: MARCA.texto, forte: MARCA.escuro, subtitulo: MARCA.escuro, check: MARCA.claro },
};

// _itálico_ só com espaço ou pontuação em volta: {{primeiro_nome}} e endereços com "_" ficam intactos
const negrito = (s: string, cor: string) => esc(s).replace(/\*\*(.+?)\*\*/g, `<b style="color:${cor}">$1</b>`)
  .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,;:!?)]|$)/g, "$1<i>$2</i>");

/** Texto puro → blocos do e-mail: parágrafo, "# subtítulo" e "- item" (lista com ✓). */
function blocos(texto: string, t: Tema): string {
  const saida: string[] = [];
  let par: string[] = [], lista: string[] = [], numerada = false;
  const fechaPar = () => {
    if (par.length) saida.push(`<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${t.texto}">${par.map((l) => negrito(l, t.forte)).join("<br>")}</p>`);
    par = [];
  };
  const fechaLista = () => {
    if (lista.length) saida.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px">${lista.map((i, n) =>
      `<tr><td style="vertical-align:top;padding:1px 9px 7px 0;font-size:15px;line-height:1.5;font-weight:800;color:${t.check}">${numerada ? `${n + 1}.` : "&#10003;"}</td><td style="vertical-align:top;padding:0 0 7px;font-size:15px;line-height:1.5;color:${t.texto}">${negrito(i, t.forte)}</td></tr>`).join("")}</table>`);
    lista = [];
  };
  for (const bruta of texto.trim().split("\n")) {
    const l = bruta.trim();
    const item = l.match(/^[-•✓]\s+(.+)$/);
    const num = l.match(/^\d{1,2}[.)]\s+(.+)$/);
    const sub = l.match(/^#+\s+(.+)$/);
    if (!l) { fechaPar(); fechaLista(); }
    else if (sub) { fechaPar(); fechaLista(); saida.push(`<p style="margin:6px 0 10px;font-size:20px;line-height:1.25;font-weight:800;color:${t.subtitulo}">${negrito(sub[1], t.subtitulo)}</p>`); }
    else if (item || num) {
      fechaPar();
      // trocou de lista com ✓ para numerada (ou o contrário): fecha a anterior
      if (lista.length && numerada !== !!num) fechaLista();
      numerada = !!num; lista.push((item ?? num)![1]);
    }
    else { fechaLista(); par.push(l); }
  }
  fechaPar(); fechaLista();
  return saida.join("");
}

/** Tira as marcas de formatação (para a versão em texto e para a linha de prévia do e-mail). */
const semMarcas = (s: string) => s.replace(/^\s*-{3,}\s*$/gm, "").replace(/^\s*#+\s+/gm, "").replace(/\*\*/g, "")
  .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,;:!?)]|$)/g, "$1$2").replace(/\n{3,}/g, "\n\n").trim();

const rodapeLegal = (link: string) =>
  `GSS - Gestão Serviços a Saúde Ltda · CNPJ 18.670.594/0001-03 · Av. Osvaldo Reis, 2470, sala 10 — Itajaí/SC<br>
  Você recebe este e-mail por atuar na área médica e estar no cadastro de profissionais da GSS.
  <a href="${link}" style="color:#14653a;text-decoration:underline">Não quero mais receber estes e-mails</a>.`;

/** HTML do modelo GSS. Recebe os textos já como devem sair (com ou sem variáveis trocadas). */
function montarModelo(titulo: string, mensagem: string, botaoTexto: string, botaoLink: string, imagem: string, link: string) {
  const partes = mensagem.split(/\n\s*-{3,}\s*(?:\n|$)/).map((p) => p.trim()).filter(Boolean);
  const chamada = partes.length >= 3 ? partes[0] : "";
  const escuro = partes.length >= 3 ? partes[1] : partes.length === 2 ? partes[0] : "";
  const branco = (partes.length >= 3 ? partes.slice(2) : partes.slice(-1)).join("\n\n");
  // no título, **trecho** fica pesado e o resto leve, como nas artes ("Oportunidade para **Telerradiologia**")
  const temPeso = /\*\*.+?\*\*/.test(titulo);
  const tituloHtml = esc(titulo).replace(/\*\*(.+?)\*\*/g, `<span style="font-weight:800">$1</span>`);
  const abaixoDoTitulo = escuro ? MARCA.escuro : "#ffffff";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&display=swap" rel="stylesheet"></head><body style="margin:0;padding:0;background:${MARCA.limao}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(semMarcas(mensagem).slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.limao};padding:26px 12px;font-family:${MARCA.fonte}">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 6px 18px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td width="58" height="58" align="center" valign="middle" style="width:58px;height:58px;background:#ffffff;border-radius:50%"><img src="${MARCA.logo}" width="30" alt="GSS" style="display:block;width:30px;height:auto;border:0;margin:0 auto"></td>
    <td style="padding-left:12px"><div style="font-size:27px;line-height:1;font-weight:800;letter-spacing:.5px;color:${MARCA.escuro}">GSS</div>
      <div style="padding-top:3px;font-size:9px;line-height:1.25;font-weight:700;letter-spacing:.7px;color:${MARCA.escuro}">GESTÃO DE SERVIÇOS<br>DE SAÚDE</div></td>
  </tr></table>
</td></tr>
${imagem ? `<tr><td style="padding:0 0 12px"><img src="${esc(imagem)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:26px"></td></tr>` : ""}
<tr><td style="background:${abaixoDoTitulo};border-radius:28px 28px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${MARCA.claro};border-radius:28px 28px 64px 0;padding:26px 30px 30px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.3px;color:#ffffff;padding-bottom:12px">gestaoservicosaude.com.br</div>
    ${titulo ? `<h1 style="margin:0;font-size:30px;line-height:1.15;font-weight:${temPeso ? 500 : 800};color:${MARCA.escuro}">${tituloHtml}</h1>` : ""}
    ${chamada ? `<div style="padding-top:14px">${blocos(chamada, TEMAS.claro)}</div>` : ""}
  </td></tr></table>
</td></tr>
${escuro ? `<tr><td style="background:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${MARCA.escuro};border-radius:0 0 64px 0;padding:26px 30px 22px">
    ${blocos(escuro, TEMAS.escuro)}
  </td></tr></table>
</td></tr>` : ""}
<tr><td style="background:#ffffff;border-radius:0 0 28px 28px;padding:26px 30px 28px">
  ${blocos(branco, TEMAS.branco)}
  ${botaoTexto && botaoLink ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 4px"><tr><td style="background:${MARCA.escuro};border-radius:999px">
    <a href="${esc(botaoLink)}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none">${esc(botaoTexto)}</a>
  </td></tr></table>` : ""}
</td></tr>
<tr><td style="padding:18px 10px 0;font-size:11px;line-height:1.6;color:#1f4d2b">
  ${rodapeLegal(link)}
</td></tr>
</table></td></tr></table></body></html>`;
}

/** O modelo GSS como ponto de partida para o HTML próprio: variáveis e descadastro ficam como {{...}}. */
export function modeloBaseHtml(c: EmailConteudo): string {
  return montarModelo(c.titulo ?? "", c.mensagem || "Olá, {{primeiro_nome}}!\n\nEscreva aqui a mensagem.",
    c.botao_texto ?? "", (c.botao_link ?? "").trim(), (c.imagem_url ?? "").trim(), "{{link_descadastro}}");
}

/** O HTML próprio traz o link de descadastro? Sem ele o rodapé legal entra sozinho. */
export const temDescadastro = (html: string) => /\{\{\s*link_descadastro\s*\}\}/i.test(html);

function renderHtmlProprio(bruto: string, vars: EmailVars, link: string) {
  // script não roda em nenhum cliente de e-mail e derruba a reputação no filtro de spam
  let html = bruto.slice(0, MAX_HTML).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const seguro: EmailVars = {
    nome: esc(vars.nome ?? ""), especialidade: esc(vars.especialidade ?? ""),
    cidade: esc(vars.cidade ?? ""), uf: esc(vars.uf ?? ""),
  };
  const tinhaLink = temDescadastro(html);
  html = aplicarVariaveis(html, seguro).replace(/\{\{\s*link_descadastro\s*\}\}/gi, esc(link));
  if (!tinhaLink) {
    const bloco = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:18px 16px;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#8a99ab">${rodapeLegal(esc(link))}</td></tr></table>`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bloco}</body>`) : html + bloco;
  }
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>|<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim() + (tinhaLink ? `\n\nPara não receber mais: ${link}` : "");
  return { html, text };
}

export function renderEmail(conteudo: EmailConteudo, vars: EmailVars, linkDescadastro: string) {
  if (conteudo.modo === "html" && (conteudo.html ?? "").trim()) {
    return renderHtmlProprio(conteudo.html!, vars, linkDescadastro);
  }
  const titulo = aplicarVariaveis(conteudo.titulo ?? "", vars);
  const mensagem = aplicarVariaveis(conteudo.mensagem ?? "", vars);
  const botaoTexto = aplicarVariaveis(conteudo.botao_texto ?? "", vars);
  const botaoLink = (conteudo.botao_link ?? "").trim();

  const html = montarModelo(titulo, mensagem, botaoTexto, botaoLink, (conteudo.imagem_url ?? "").trim(), esc(linkDescadastro));
  const text = [
    semMarcas(titulo), "", semMarcas(mensagem), botaoTexto && botaoLink ? `\n${botaoTexto}: ${botaoLink}` : "", "",
    "—", "GSS - Gestão Serviços a Saúde Ltda · Itajaí/SC",
    `Para não receber mais: ${linkDescadastro}`,
  ].join("\n");

  return { html, text };
}
