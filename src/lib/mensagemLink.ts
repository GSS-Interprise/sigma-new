/**
 * Extrai o link de "mensagem original do canal" de uma descrição de tarefa.
 * Procura por URLs no formato `/comunicacao?canal=...&mensagem=...`.
 */
export function extractMensagemLink(
  descricao: string | null | undefined,
): { canal: string; mensagem: string; href: string } | null {
  if (!descricao) return null;
  const re = /\/comunicacao\?canal=([^"&\s<]+)&(?:amp;)?mensagem=([^"&\s<]+)/i;
  const m = descricao.match(re);
  if (!m) return null;
  const canal = decodeURIComponent(m[1]);
  const mensagem = decodeURIComponent(m[2]);
  if (!canal || !mensagem) return null;
  return {
    canal,
    mensagem,
    href: `/comunicacao?canal=${canal}&mensagem=${mensagem}`,
  };
}