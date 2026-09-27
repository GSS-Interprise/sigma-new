// Cópia do modelo de e-mail marketing para a PRÉVIA na tela.
//
// ⚠ Fonte da verdade: supabase/functions/_shared/email-marketing.ts (é o que envia).
// As duas precisam gerar o mesmo HTML — mudou lá, muda aqui.

export type EmailConteudo = {
  titulo?: string | null;
  mensagem?: string | null;
  botao_texto?: string | null;
  botao_link?: string | null;
};

export type EmailVars = {
  nome?: string | null;
  especialidade?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

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

/** Parágrafos por linha em branco; quebra simples vira <br>; **texto** vira negrito. */
function paragrafos(texto: string): string {
  return texto.trim().split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#33475b">${
      esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")
    }</p>`
  ).join("");
}

export function renderEmail(conteudo: EmailConteudo, vars: EmailVars, linkDescadastro: string) {
  const titulo = aplicarVariaveis(conteudo.titulo ?? "", vars);
  const mensagem = aplicarVariaveis(conteudo.mensagem ?? "", vars);
  const botaoTexto = aplicarVariaveis(conteudo.botao_texto ?? "", vars);
  const botaoLink = (conteudo.botao_link ?? "").trim();

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#eef1f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(mensagem.slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px;font-family:'Segoe UI',Arial,sans-serif">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1b3a5b;padding:24px 32px">
  <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">GSS <span style="font-weight:400;opacity:.85">Saúde</span></span>
</td></tr>
<tr><td style="background:#2563a8;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:32px">
  ${titulo ? `<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#1b3a5b">${esc(titulo)}</h1>` : ""}
  ${paragrafos(mensagem)}
  ${botaoTexto && botaoLink ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:#1b3a5b;border-radius:8px">
    <a href="${esc(botaoLink)}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">${esc(botaoTexto)}</a>
  </td></tr></table>` : ""}
</td></tr>
<tr><td style="background:#f6f8fa;padding:18px 32px;border-top:1px solid #e6ebf1;font-size:11px;line-height:1.6;color:#8a99ab">
  GSS - Gestão Serviços a Saúde Ltda · CNPJ 18.670.594/0001-03 · Av. Osvaldo Reis, 2470, sala 10 — Itajaí/SC<br>
  Você recebe este e-mail por atuar na área médica e estar no cadastro de profissionais da GSS.
  <a href="${esc(linkDescadastro)}" style="color:#5a7594">Não quero mais receber estes e-mails</a>.
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    titulo, "", mensagem, botaoTexto && botaoLink ? `\n${botaoTexto}: ${botaoLink}` : "", "",
    "—", "GSS - Gestão Serviços a Saúde Ltda · Itajaí/SC",
    `Para não receber mais: ${linkDescadastro}`,
  ].join("\n");

  return { html, text };
}
