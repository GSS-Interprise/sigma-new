// Manual curto do Sigma servido ao agente (domínio "processos", fase 4 do assistente; docs/arquitetura/assistente-ia-sigma.md §3g).
// A fonte é docs/manual-sigma/*.md, escrita a partir do código. A edge não lê o repositório: o texto entra embutido em
// paginas.gen.ts, gerado por `deno run -A scripts/gerar-manual-agente.ts`. O teste manual_test.ts falha se o gerado
// ficar diferente dos .md (alguém editou o manual e não rodou o gerador).
import { semAcento } from "../tempo.ts";

export type Pagina = { area: string; titulo: string; modulo: string; telas: string[]; texto: string };
export type Secao = { area: string; titulo: string; secao: string; texto: string };

/** Lê uma página do manual: frontmatter simples (chave: valor, telas em [a, b]) + corpo em markdown. */
export function lerPagina(md: string, arquivo = "?"): Pagina {
  const m = md.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${arquivo}: falta o frontmatter (--- ... ---)`);
  const meta: Record<string, string> = {};
  for (const linha of m[1].split("\n")) {
    const i = linha.indexOf(":");
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  for (const k of ["area", "titulo", "modulo"]) if (!meta[k]) throw new Error(`${arquivo}: falta "${k}" no frontmatter`);
  const telas = (meta.telas || "").replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean);
  return { area: meta.area, titulo: meta.titulo, modulo: meta.modulo, telas, texto: m[2].trim() };
}

/** Quebra a página nas seções "## ..." (a busca devolve seção, não a página inteira). */
export function secoes(p: Pagina): Secao[] {
  const out: Secao[] = [];
  let atual = { secao: "Introdução", linhas: [] as string[] };
  const fechar = () => { const t = atual.linhas.join("\n").trim(); if (t) out.push({ area: p.area, titulo: p.titulo, secao: atual.secao, texto: t }); };
  for (const linha of p.texto.split("\n")) {
    if (linha.startsWith("# ")) continue;
    const h = linha.match(/^##\s+(.*)$/);
    if (h) { fechar(); atual = { secao: h[1].trim(), linhas: [] }; } else atual.linhas.push(linha);
  }
  fechar();
  return out;
}

const VAZIAS = new Set(("a o as os de da do das dos e em no na nos nas um uma uns umas para pra por com sem que se como onde quando qual quais " +
  "eu meu minha voce vc sigma faco fazer faz posso pode consigo tem ter ver ao aos isso esse essa este esta ja nao sim mais muito").split(" "));

export const palavras = (s: string) => semAcento(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !VAZIAS.has(w));

/**
 * Busca determinística: pontua cada seção pelas palavras da pergunta (título da seção vale 3, nome da área 2, texto 1;
 * casa por prefixo de 5 letras para "contrato"/"contratos"; o trecho cobre ao menos metade das palavras). Empate = ordem do manual. Mesma pergunta = mesmas seções.
 */
export function buscar(paginas: Pagina[], pergunta: string, max = 3): (Secao & { pontos: number })[] {
  const q = [...new Set(palavras(pergunta))];
  if (!q.length) return [];
  const raiz = (w: string) => w.slice(0, 5);
  const tem = (alvo: string[], w: string) => alvo.some((a) => a === w || (w.length >= 5 && a.length >= 5 && raiz(a) === raiz(w)));
  const todas = paginas.flatMap(secoes);
  return todas
    .map((s, i) => {
      const tit = palavras(s.secao), area = palavras(`${s.area} ${s.titulo}`), txt = palavras(s.texto);
      const pontos = q.reduce((n, w) => n + (tem(tit, w) ? 3 : 0) + (tem(area, w) ? 2 : 0) + (tem(txt, w) ? 1 : 0), 0);
      const cobertas = q.filter((w) => tem(tit, w) || tem(area, w) || tem(txt, w)).length;
      return { ...s, pontos, cobertas, i };
    })
    // Metade das palavras da pergunta precisa aparecer no trecho: "mudar a senha do wifi" não casa só por "mudar".
    .filter((s) => s.pontos >= 2 && s.cobertas * 2 >= q.length)
    .sort((a, b) => b.pontos - a.pontos || a.i - b.i)
    .slice(0, max)
    .map(({ i: _i, cobertas: _c, ...s }) => s);
}
