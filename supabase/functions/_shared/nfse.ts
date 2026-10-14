// Leitura da NFS-e (padrão nacional DANFSe e as variações municipais mais comuns).
//
// Serve para duas decisões do recebimento pelo WhatsApp: (1) o arquivo É uma nota para a
// GSS? — o número do financeiro é o WhatsApp de trabalho de uma pessoa, e passa de tudo
// por ali; (2) de QUEM é a nota — prestador, e-mail, valor.
//
// Nada aqui decide sozinho o médico: só extrai. Quem decide é o recebimento, com as
// regras de confiança (financeiro-nf-whatsapp-inbound).
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

export const CNPJ_GSS = "18670594000103";
// Tomador aceito: só a GSS (decisão do Raul, 28/09 — a Associação de Gestão Especializada
// em Saúde, mesmo endereço, NÃO conta). Outro CNPJ, se um dia precisar:
// config_lista_items.financeiro_cnpjs_tomador (separados por vírgula).
export const CNPJS_GRUPO_GSS = [CNPJ_GSS];

export type Nfse = {
  legivel: boolean;          // o PDF tem texto (não é escaneado)
  ehNfse: boolean;           // parece nota fiscal de serviço
  tomadorGss: boolean;       // a GSS é a tomadora
  prestadorCnpj: string | null;
  prestadorNome: string | null;
  prestadorEmail: string | null;
  valor: number | null;      // valor do serviço (bruto)
  chave: string | null;      // chave de acesso nacional (50 dígitos)
  descricao: string | null;
  // ── conferência fiscal (12/10). null = o layout não deixou ler; NÃO quer dizer zero ──
  numero: string | null;         // número da nota
  competencia: string | null;    // AAAA-MM-DD
  emissao: string | null;        // AAAA-MM-DD
  tomadorCnpj: string | null;
  tomadorNome: string | null;
  irrf: number | null;
  contribSociais: number | null; // PIS/COFINS/CSLL retidos
  inssRetido: number | null;     // contribuição previdenciária retida
  issRetido: number | null;
  totalRetencoes: number | null;
  valorLiquido: number | null;
  simplesNacional: boolean | null;
  impostosLidos: boolean;        // a nota trouxe o quadro de retenções de forma legível
};

const digitos = (s: string) => s.replace(/\D/g, "");
const limpa = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim() || null;
const numero = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Trecho entre dois rótulos, sem depender de quebra de linha (o extrator junta tudo). */
function entre(texto: string, de: RegExp, ate: RegExp): string | null {
  const i = texto.search(de);
  if (i < 0) return null;
  const resto = texto.slice(i).replace(de, "");
  const j = resto.search(ate);
  return limpa(j >= 0 ? resto.slice(0, j) : resto.slice(0, 200));
}

/** Texto corrido do PDF (diagnóstico de layout novo). */
export async function textoPdf(bytes: Uint8Array): Promise<string> {
  try {
    const r = await extractText(await getDocumentProxy(bytes), { mergePages: true });
    return String(Array.isArray(r.text) ? r.text.join(" ") : r.text || "").replace(/\s+/g, " ");
  } catch { return ""; }
}

// ── layout em grade (NFS-e municipal de Itajaí, sistema "Pública") ─────────────
// As notas que a GSS emite (ZIP da Mavi, fev–ago/2026) vêm nesse layout. No texto corrido os
// números do quadro de valores saem embaralhados, então a leitura é por posição: em cada célula o
// valor fica ~11pt abaixo do rótulo, alinhado à direita da célula (borda direita ≈ rótulo + 106pt);
// no bloco do prestador/tomador o valor fica na mesma linha, à direita do rótulo.
type ItemPos = { s: string; x0: number; x1: number; top: number };
// deno-lint-ignore no-explicit-any
async function itensPosicionados(pdf: any): Promise<ItemPos[]> {
  // todas as páginas: em nota longa o quadro de valores vai para a 2ª. Cada página ganha um
  // deslocamento grande no "top", então rótulo e valor só se casam dentro da mesma página.
  const itens: ItemPos[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages ?? 1, 4); n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // deno-lint-ignore no-explicit-any
    for (const i of tc.items as any[]) {
      if (!i.str || !i.str.trim()) continue;
      itens.push({ s: String(i.str).trim(), x0: i.transform[4], x1: i.transform[4] + (i.width ?? 0), top: (n - 1) * 10000 + vp.height - i.transform[5] });
    }
  }
  return itens;
}

function lerGrade(itens: ItemPos[], texto: string): Partial<Nfse> | null {
  const rot = (re: RegExp, depois = -1, antes = 1e9) => itens.find((i) => re.test(i.s) && i.top > depois && i.top < antes);
  // versão nova: "Contribuições Sociais Retidas"; versão antiga (fev/2026): PIS, COFINS e CSLL separados
  if (!rot(/^Valor l[ií]quido da NFS-?e$/i) || !(rot(/^Contribui[cç][oõ]es Sociais Retidas$/i) || rot(/^Valor CSLL$/i))) return null;
  const num = (s: string) => /^-?[\d.]+,\d{2}$/.test(s) ? numero(s) : null;
  // valor da célula: logo abaixo do rótulo e encostado na borda direita da célula
  const celula = (re: RegExp): number | null => {
    const r = rot(re);
    if (!r) return null;
    const c = itens.filter((i) => num(i.s) != null && Math.abs(i.top - (r.top + 11)) <= 5 && Math.abs(i.x1 - (r.x0 + 106)) <= 8)
      .sort((a, b) => Math.abs(a.x1 - (r.x0 + 106)) - Math.abs(b.x1 - (r.x0 + 106)))[0];
    return c ? num(c.s) : null;
  };
  // valor na mesma linha, à direita do rótulo, dentro do bloco (prestador ou tomador)
  const naLinha = (re: RegExp, de: number, ate: number) => {
    const r = rot(re, de, ate);
    if (!r) return null;
    return itens.filter((i) => i !== r && Math.abs(i.top - r.top) <= 2 && i.x0 > r.x1 && i.x0 - r.x1 < 120)
      .sort((a, b) => a.x0 - b.x0)[0]?.s ?? null;
  };
  const topo = (re: RegExp) => rot(re)?.top ?? -1;
  const pIni = topo(/^PRESTADOR DE SERVI[CÇ]OS$/i), tIni = topo(/^TOMADOR DE SERVI[CÇ]OS$/i);
  const tFim = topo(/^DISCRIMINA[CÇ][AÃ]O DOS SERVI[CÇ]OS$/i);
  const prestCnpj = naLinha(/^CPF\/CNPJ:$/i, pIni, tIni);
  const tomCnpj = naLinha(/^CPF\/CNPJ:$/i, tIni, tFim > 0 ? tFim : 1e9);

  const bruto = celula(/^Valor Servi[cç]os$/i);
  const irrf = celula(/^Valor IRR?F?$/i) ?? 0;
  const contrib = rot(/^Contribui[cç][oõ]es Sociais Retidas$/i)
    ? (celula(/^Contribui[cç][oõ]es Sociais Retidas$/i) ?? 0)
    : Math.round(((celula(/^Valor PIS$/i) ?? 0) + (celula(/^Valor COFINS$/i) ?? 0) + (celula(/^Valor CSLL$/i) ?? 0)) * 100) / 100;
  const inss = celula(/^Valor INSS$/i) ?? 0;
  const iss = celula(/^Valor ISS retido$/i) ?? 0;
  const outras = celula(/^Outras reten[cç][oõ]es$/i) ?? 0;
  const liquido = celula(/^Valor l[ií]quido da NFS-?e$/i);
  const total = Math.round((irrf + contrib + inss + iss + outras) * 100) / 100;

  const nr = itens.find((i) => /^0*\d{3,}\s*\/\s*[A-Z0-9]{1,3}$/.test(i.s))?.s.match(/^0*(\d+)/)?.[1] ?? null;
  const abaixo = (re: RegExp, valor: RegExp) => { const r = rot(re); return r ? itens.find((i) => valor.test(i.s) && i.top > r.top && i.top - r.top < 16)?.s ?? null : null; };
  const emis = abaixo(/^Data e Hora da Emiss[aã]o$/i, /^\d{2}\/\d{2}\/\d{4}/)?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const comp = abaixo(/^Compet[eê]ncia$/i, /^\d{1,2}\/\d{4}$/)?.match(/^(\d{1,2})\/(\d{4})$/);
  const impostosLidos = bruto != null && liquido != null && Math.abs(bruto - total - liquido) <= 0.05;
  return {
    prestadorCnpj: prestCnpj ? digitos(prestCnpj) : null,
    prestadorNome: naLinha(/^Nome empresarial:$/i, pIni, tIni),
    tomadorCnpj: tomCnpj ? digitos(tomCnpj) : null,
    tomadorNome: naLinha(/^Nome:$/i, tIni, tFim > 0 ? tFim : 1e9),
    numero: nr, emissao: emis ? `${emis[3]}-${emis[2]}-${emis[1]}` : null,
    competencia: comp ? `${comp[2]}-${comp[1].padStart(2, "0")}-01` : null,
    valor: bruto, irrf, contribSociais: contrib, inssRetido: inss, issRetido: iss,
    totalRetencoes: impostosLidos ? total : null, valorLiquido: impostosLidos ? liquido : null, impostosLidos,
    simplesNacional: /N[ÃA]O optante pelo Simples Nacional/i.test(texto) ? false : /optante pelo Simples Nacional/i.test(texto) ? true : null,
  };
}

// ── DANFSe nacional (layout 2026): quadro de impostos em grade ──────────────────
// O valor fica logo abaixo do rótulo (~8pt) e alinhado à esquerda com ele; "-" é zero. No texto
// corrido a linha de rótulos vem inteira antes da linha de valores, por isso a leitura por
// rótulo não achava os impostos e caía na leitura assistida.
function lerGradeNacional(itens: ItemPos[]): Partial<Nfse> | null {
  const rot = (re: RegExp) => itens.find((i) => re.test(i.s));
  if (!rot(/^Valor L[ií]quido da NFS-?e$/) || !rot(/^Total das Reten[cç][oõ]es Federais$/i)) return null;
  const abaixo = (re: RegExp): string | null => {
    const r = rot(re);
    if (!r) return null;
    return itens.filter((i) => i !== r && Math.abs(i.x0 - r.x0) <= 3 && i.top > r.top + 3 && i.top - r.top <= 14)
      .sort((a, b) => a.top - b.top)[0]?.s ?? null;
  };
  const valorDe = (s: string | null): number | null => {
    if (s == null) return null;
    if (/^-$/.test(s.trim())) return 0;
    const m = s.match(/([\d.]+,\d{2})/);
    return m ? numero(m[1]) : null;
  };
  const bruto = valorDe(abaixo(/^Valor do Servi[cç]o$/i));
  const irrf = valorDe(abaixo(/^IRRF$/)) ?? 0;
  const inss = valorDe(abaixo(/^Contribui[cç][aã]o Previdenci[aá]ria - Retida$/i)) ?? 0;
  const contrib = valorDe(abaixo(/^Contribui[cç][oõ]es Sociais - Retidas$/i)) ?? 0;
  const iss = valorDe(abaixo(/^ISSQN Retido$/i)) ?? 0;
  const federais = valorDe(abaixo(/^Total das Reten[cç][oõ]es Federais$/i));
  const liquido = valorDe(abaixo(/^Valor L[ií]quido da NFS-?e$/));
  const total = Math.round(((federais ?? irrf + inss + contrib) + iss) * 100) / 100;
  const ok = bruto != null && liquido != null && Math.abs(bruto - total - liquido) <= 0.05;
  if (!ok) return null;
  return { valor: bruto, irrf, inssRetido: inss, contribSociais: contrib, issRetido: iss, totalRetencoes: total, valorLiquido: liquido, impostosLidos: true };
}

export async function lerNfse(bytes: Uint8Array, cnpjsTomador: string[] = CNPJS_GRUPO_GSS): Promise<Nfse> {
  const vazio: Nfse = {
    legivel: false, ehNfse: false, tomadorGss: false, prestadorCnpj: null, prestadorNome: null,
    prestadorEmail: null, valor: null, chave: null, descricao: null,
    numero: null, competencia: null, emissao: null, tomadorCnpj: null, tomadorNome: null,
    irrf: null, contribSociais: null, inssRetido: null, issRetido: null, totalRetencoes: null,
    valorLiquido: null, simplesNacional: null, impostosLidos: false,
  };

  let texto = "";
  // deno-lint-ignore no-explicit-any
  let pdf: any = null;
  try {
    pdf = await getDocumentProxy(bytes);
    const r = await extractText(pdf, { mergePages: true });
    texto = String(Array.isArray(r.text) ? r.text.join(" ") : r.text || "");
  } catch {
    return vazio; // não é PDF ou está protegido
  }
  const t = texto.replace(/\s+/g, " ");
  if (t.replace(/\s/g, "").length < 80) return vazio; // escaneado: sem texto útil

  const soDigitos = digitos(t);
  const ehNfse = /NFS-?e|nota fiscal (eletr[oô]nica )?de servi[cç]o|DANFSe/i.test(t);

  // blocos: no DANFSe o prestador vem antes do tomador
  const iTom = t.search(/TOMADOR/i);
  const blocoPrest = iTom > 0 ? t.slice(0, iTom) : t;
  const blocoTom = iTom > 0 ? t.slice(iTom, iTom + 700) : "";

  const noTom = digitos(blocoTom);
  const tomadorGss = cnpjsTomador.some((c) => noTom.includes(c) || (!blocoTom && soDigitos.includes(c)));

  const cnpjPrest = blocoPrest.match(/(?:PRESTADOR[\s\S]*?)(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/i);
  const prestadorCnpj = cnpjPrest ? digitos(cnpjPrest[1]) : null;

  let prestadorNome = entre(blocoPrest, /Nome\s*\/\s*Nome Empresarial|Raz[aã]o Social|Nome\/Raz[aã]o Social/i,
    /Munic[ií]pio|Endere[cç]o|CNPJ|Inscri[cç][aã]o/i);
  // layout de São Paulo: todos os rótulos primeiro, depois os valores ("CNPJ IM NOME RUA ...")
  if (!prestadorNome || !/[A-Za-zÀ-ú]{3}/.test(prestadorNome)) {
    const aposCnpj = cnpjPrest ? blocoPrest.slice(blocoPrest.indexOf(cnpjPrest[1]) + cnpjPrest[1].length) : "";
    const m = aposCnpj.match(/^[\s\d.\/-]*([A-ZÀ-Ú][A-ZÀ-Ú0-9&.,' -]{4,}?)\s+(?:R|RUA|AV|AVENIDA|AL|ALAMEDA|TV|TRAVESSA|ROD|RODOVIA|ESTRADA|PC|PRAÇA)\.?\s/);
    prestadorNome = m ? limpa(m[1]) : null;
  }
  const email = blocoPrest.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);

  const valor = numero(
    (t.match(/VALOR DA OPERA[CÇ][AÃ]O\s*\/\s*SERVI[CÇ]O\s*(?:R\$\s*)?([\d.]+,\d{2})/i) ||
      t.match(/VALOR TOTAL D[OA] (?:NOTA|SERVI[CÇ]O)S?\s*[=:]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i) ||
      t.match(/Valor (?:dos|do) Servi[cç]os?\s*[:=]?\s*(?:R\$\s*)?([\d.]+,\d{2})/i))?.[1],
  );

  const chave = t.match(/\b(\d{50})\b/)?.[1] ?? null;
  const descricao = entre(t, /Descri[cç][aã]o do Servi[cç]o/i, /TRIBUTA[CÇ][AÃ]O|VALOR TOTAL|C[aá]lculo do ISS/i);

  // ── conferência fiscal ──────────────────────────────────────────────────
  // No DANFSe nacional cada rótulo é seguido do valor; campo sem valor vem como "-".
  // Um rótulo sem número depois dele é "não retido" (0), desde que o quadro exista.
  const dataBr = (x: string | undefined) => { const m = x?.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const aposRotulo = (rotulo: RegExp): number | null | undefined => {
    const m = t.match(new RegExp(rotulo.source + String.raw`\s*(?:\(R\$\))?\s*(?:R\$\s*)?(-(?!\d)|[\d.]+,\d{2})`, "i"));
    if (!m) return undefined;              // rótulo ausente ou seguido de outro rótulo
    return m[1].startsWith("-") ? 0 : numero(m[1]);
  };
  const numeroNota = (t.match(/N[°º]\s*NFS-?e\s*\/\s*CHAVE NFS-?e\s+(\d{1,15})\s*\//i) ||
    t.match(/N[UÚ]MERO DA NFS-?e\s+(\d{1,15})/i) ||
    t.match(/N[uú]mero da Nota Data e Hora de Emiss[aã]o C[oó]digo de Verifica[cç][aã]o\s+\S+\s+(\d{1,15})/i))?.[1] ?? null;
  const competencia = dataBr(t.match(/COMPET[EÊ]NCIA DA NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const emissao = dataBr(t.match(/DATA E HORA DA EMISS[AÃ]O DA NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]) ??
    dataBr(t.match(/Data e Hora de Emiss[aã]o[^\d]{0,40}\S+\s+\d+\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const cnpjTom = blocoTom.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  const tomadorNome = entre(blocoTom, /Nome\s*\/\s*Nome Empresarial|Raz[aã]o Social|Nome\/Raz[aã]o Social/i, /Munic[ií]pio|Endere[cç]o|CNPJ|Inscri[cç][aã]o|E-mail/i);

  const irrf = aposRotulo(/IRRF/);
  const contribSociais = aposRotulo(/Contribui[cç][oõ]es Sociais - Retidas/);
  const inssRetido = aposRotulo(/Contribui[cç][aã]o Previdenci[aá]ria - Retida/);
  const totalRetencoes = aposRotulo(/Total das Reten[cç][oõ]es \(ISSQN \/ Federais\)/);
  const valorLiquido = aposRotulo(/VALOR L[IÍ]QUIDO DA NFS-?e/);
  const issRetidoTxt = t.match(/Reten[cç][aã]o do ISSQN\s+(N[aã]o Retido|Retido[^R$]{0,40}?)\s+ISSQN Apurado\s+(?:R\$\s*)?(-(?!\d)|[\d.]+,\d{2})/i);
  const issRetido = issRetidoTxt ? (/^n[aã]o/i.test(issRetidoTxt[1]) ? 0 : (issRetidoTxt[2].startsWith("-") ? 0 : numero(issRetidoTxt[2]))) : undefined;
  const sn = t.match(/Simples Nacional na Data d[ea] Compet[eê]ncia\s+(N[aã]o optante|Optante)/i)?.[1];
  // só confia nos impostos quando o líquido foi lido e a conta fecha com o valor do serviço
  const liq = valorLiquido ?? null, ret = totalRetencoes ?? null;
  const impostosLidos = valor != null && liq != null && ret != null && Math.abs(valor - ret - liq) <= 0.05;

  const lido: Nfse = {
    legivel: true, ehNfse, tomadorGss,
    prestadorCnpj, prestadorNome, prestadorEmail: email ? email[0].toLowerCase() : null,
    valor, chave, descricao: descricao ? descricao.slice(0, 500) : null,
    numero: numeroNota ? String(Number(numeroNota)) : null, competencia, emissao,
    tomadorCnpj: cnpjTom ? digitos(cnpjTom[1]) : null, tomadorNome,
    irrf: irrf ?? null, contribSociais: contribSociais ?? null, inssRetido: inssRetido ?? null, issRetido: issRetido ?? null,
    totalRetencoes: ret, valorLiquido: liq,
    simplesNacional: sn ? !/^n[aã]o/i.test(sn) : (/optante pelo Simples Nacional/i.test(t) ? true : null),
    impostosLidos,
  };
  // layout em grade (Itajaí): o que a posição leu vale mais que o texto corrido
  const posicoes = pdf ? await itensPosicionados(pdf).catch(() => [] as ItemPos[]) : [];
  const grade = lerGrade(posicoes, t);
  if (grade) {
    for (const [k, v] of Object.entries(grade)) if (v !== null && v !== undefined) (lido as Record<string, unknown>)[k] = v;
    lido.impostosLidos = !!grade.impostosLidos;
    if (!grade.impostosLidos) { lido.totalRetencoes = null; lido.valorLiquido = null; }
    lido.tomadorGss = !!grade.tomadorCnpj && cnpjsTomador.includes(grade.tomadorCnpj);
    lido.ehNfse = true;
  } else if (!lido.impostosLidos) {
    // DANFSe nacional em grade: só os impostos (o resto o texto corrido já leu)
    const nac = lerGradeNacional(posicoes);
    if (nac) Object.assign(lido, nac);
  }
  return lido;
}

// ── leitura assistida (quando o layout não deixa ler os impostos por regra) ──
// Alguns municípios emitem a nota com os rótulos todos primeiro e os valores depois, ou em
// colunas (São Paulo). A leitura por regra não acha o quadro de retenções nesses casos.
// Aqui um modelo de linguagem lê o MESMO texto e devolve os números; o resultado só é
// aproveitado se passar em duas provas que não dependem do modelo:
//   1. a conta fecha: bruto - retenções = líquido;
//   2. bruto e líquido aparecem escritos no texto da nota, do jeito que o modelo devolveu.
// Mesmo assim é SUGESTÃO: quem chama deve pedir a confirmação de uma pessoa, porque um
// modelo pode deixar de ver uma retenção e a conta fecharia do mesmo jeito (líquido = bruto).
export type LeituraAssistida = {
  valor: number; totalRetencoes: number; valorLiquido: number;
  irrf: number; contribSociais: number; inssRetido: number; issRetido: number; numero: string | null;
};

export async function leituraAssistida(texto: string): Promise<LeituraAssistida | null> {
  const chave = Deno.env.get("LOVABLE_API_KEY");
  const t = texto.replace(/\s+/g, " ").trim();
  if (!chave || t.length < 80) return null;
  const pedido = `Texto extraído de uma nota fiscal de serviço brasileira (NFS-e). Os rótulos e os valores podem estar fora de ordem.
Devolva SOMENTE um JSON com estes campos numéricos (ponto como separador decimal, 0 quando o campo vier vazio ou com traço):
{"numero_nota": string ou null, "valor_servico": número, "irrf": número, "pis_cofins_csll_retidos": número, "inss_retido": número, "iss_retido": número, "total_retencoes": número, "valor_liquido": número}
Regras: use apenas números que estão escritos no texto; não calcule impostos por alíquota; "valor_servico" é o valor bruto da operação; se não conseguir identificar o valor líquido, devolva null no campo.

TEXTO:
${t.slice(0, 7000)}`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você extrai dados de notas fiscais e responde apenas com JSON válido, sem comentários." },
          { role: "user", content: pedido },
        ],
      }),
    });
    if (!r.ok) return null;
    const corpo = await r.json();
    const bruto = String(corpo?.choices?.[0]?.message?.content ?? "");
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x));
    const valor = n(j.valor_servico), liq = n(j.valor_liquido);
    const partes = [n(j.irrf) || 0, n(j.pis_cofins_csll_retidos) || 0, n(j.inss_retido) || 0, n(j.iss_retido) || 0];
    const ret = Number.isFinite(n(j.total_retencoes)) ? n(j.total_retencoes) : partes.reduce((a, b) => a + b, 0);
    if (!(valor > 0) || !(liq > 0) || !(ret >= 0)) return null;
    // prova 1: a conta fecha
    if (Math.abs(valor - ret - liq) > 0.05) return null;
    // prova 2: os dois valores estão escritos na nota
    const escrito = (v: number) => t.includes(v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (!escrito(valor) || !escrito(liq)) return null;
    return {
      valor, totalRetencoes: Math.round(ret * 100) / 100, valorLiquido: liq,
      irrf: partes[0], contribSociais: partes[1], inssRetido: partes[2], issRetido: partes[3],
      numero: j.numero_nota ? String(j.numero_nota).replace(/^0+(?=\d)/, "") : null,
    };
  } catch {
    return null;
  }
}
