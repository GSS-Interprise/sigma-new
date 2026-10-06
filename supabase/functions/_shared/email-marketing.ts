// Modelo do e-mail marketing da GSS. Dois modos:
//  - "modelo": a equipe preenche título, mensagem, botão e (opcional) uma arte de topo;
//    layout, rodapé legal e descadastro são sempre os mesmos.
//  - "html": HTML próprio (arte feita fora, por quem faz design de e-mail). As variáveis
//    {{...}} continuam valendo e o descadastro é garantido: se o HTML não tiver
//    {{link_descadastro}}, o rodapé legal entra sozinho no fim.
//
// ⚠ Existe uma cópia em src/lib/emailMarketing.ts (prévia na tela). As duas precisam
// gerar o mesmo HTML — mudou aqui, muda lá.

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

/** Parágrafos por linha em branco; quebra simples vira <br>; **texto** vira negrito. */
function paragrafos(texto: string): string {
  return texto.trim().split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#33475b">${
      esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")
    }</p>`
  ).join("");
}

const rodapeLegal = (link: string) =>
  `GSS - Gestão Serviços a Saúde Ltda · CNPJ 18.670.594/0001-03 · Av. Osvaldo Reis, 2470, sala 10 — Itajaí/SC<br>
  Você recebe este e-mail por atuar na área médica e estar no cadastro de profissionais da GSS.
  <a href="${link}" style="color:#5a7594">Não quero mais receber estes e-mails</a>.`;

/** HTML do modelo GSS. Recebe os textos já como devem sair (com ou sem variáveis trocadas). */
function montarModelo(titulo: string, mensagem: string, botaoTexto: string, botaoLink: string, imagem: string, link: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef1f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(mensagem.slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px;font-family:'Segoe UI',Arial,sans-serif">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1b3a5b;padding:24px 32px">
  <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">GSS <span style="font-weight:400;opacity:.85">Saúde</span></span>
</td></tr>
<tr><td style="background:#2563a8;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
${imagem ? `<tr><td><img src="${esc(imagem)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : ""}
<tr><td style="padding:32px">
  ${titulo ? `<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#1b3a5b">${esc(titulo)}</h1>` : ""}
  ${paragrafos(mensagem)}
  ${botaoTexto && botaoLink ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:#1b3a5b;border-radius:8px">
    <a href="${esc(botaoLink)}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">${esc(botaoTexto)}</a>
  </td></tr></table>` : ""}
</td></tr>
<tr><td style="background:#f6f8fa;padding:18px 32px;border-top:1px solid #e6ebf1;font-size:11px;line-height:1.6;color:#8a99ab">
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
    titulo, "", mensagem, botaoTexto && botaoLink ? `\n${botaoTexto}: ${botaoLink}` : "", "",
    "—", "GSS - Gestão Serviços a Saúde Ltda · Itajaí/SC",
    `Para não receber mais: ${linkDescadastro}`,
  ].join("\n");

  return { html, text };
}
