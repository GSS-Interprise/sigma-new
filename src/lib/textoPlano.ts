// Título e descrição de demanda podem vir do editor rico (Quill) com HTML cru, como
// `<div class="ql-advanced-banner"...>`. Na Home isso aparecia como texto; aqui vira texto plano de uma linha.
export function textoPlano(html: string | null | undefined): string {
  if (!html) return "";
  const semTags = html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return semTags.replace(/\s+/g, " ").trim();
}
