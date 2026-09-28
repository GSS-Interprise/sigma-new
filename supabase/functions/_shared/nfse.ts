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
    (t.match(/VALOR DA OPERA[CÇ][AÃ]O\s*\/\s*SERVI[CÇ]O\s*R\$\s*([\d.]+,\d{2})/i) ||
      t.match(/VALOR TOTAL D[OA] (?:NOTA|SERVI[CÇ]O)S?\s*[=:]?\s*R\$\s*([\d.]+,\d{2})/i) ||
      t.match(/Valor (?:dos|do) Servi[cç]os?\s*[:=]?\s*R\$\s*([\d.]+,\d{2})/i))?.[1],
  );

  const chave = t.match(/\b(\d{50})\b/)?.[1] ?? null;
  const descricao = entre(t, /Descri[cç][aã]o do Servi[cç]o/i, /TRIBUTA[CÇ][AÃ]O|VALOR TOTAL|C[aá]lculo do ISS/i);

  return {
    legivel: true, ehNfse, tomadorGss,
    prestadorCnpj, prestadorNome, prestadorEmail: email ? email[0].toLowerCase() : null,
    valor, chave, descricao: descricao ? descricao.slice(0, 500) : null,
  };
}
