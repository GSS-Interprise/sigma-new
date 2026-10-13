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

export async function lerNfse(bytes: Uint8Array, cnpjsTomador: string[] = CNPJS_GRUPO_GSS): Promise<Nfse> {
  const vazio: Nfse = {
    legivel: false, ehNfse: false, tomadorGss: false, prestadorCnpj: null, prestadorNome: null,
    prestadorEmail: null, valor: null, chave: null, descricao: null,
    numero: null, competencia: null, emissao: null, tomadorCnpj: null, tomadorNome: null,
    irrf: null, contribSociais: null, inssRetido: null, issRetido: null, totalRetencoes: null,
    valorLiquido: null, simplesNacional: null, impostosLidos: false,
  };

  let texto = "";
  try {
    const pdf = await getDocumentProxy(bytes);
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

  return {
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
