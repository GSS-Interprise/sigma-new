// Currículo do médico (ficha do Corpo Clínico, parte 3; 22/11/2026). Regras puras, sem banco e sem rede: a edge
// medico-curriculo importa os currículos que chegam pelo WhatsApp e os enviados na ficha, e a IA (Gemini) lê o arquivo.
// Testes: curriculo_test.ts.

/** Documento com cara de currículo pelo nome do arquivo ou pela legenda ("Segue meu CV", "currículo Lattes"). */
export const RE_CURRICULO = /curr[ií]c|\bcv\b|lattes|resum[eé]\b|curriculum/i;
export const pareceCurriculo = (nome: string | null | undefined, legenda?: string | null) =>
  RE_CURRICULO.test(String(nome ?? "")) || RE_CURRICULO.test(String(legenda ?? ""));

/** O que a IA consegue ler direto (PDF e imagem) e o que vira texto antes (Word .docx). Resto: não suportado. */
export function comoLer(mime: string | null | undefined, nome: string | null | undefined): "inline" | "docx" | "nao_suportado" {
  const m = String(mime ?? "").toLowerCase();
  const n = String(nome ?? "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf") || m.startsWith("image/")) return "inline";
  if (m.includes("wordprocessingml") || n.endsWith(".docx")) return "docx";
  return "nao_suportado";
}

/** Texto de um .docx a partir do XML do corpo (word/document.xml): parágrafos viram linhas. */
export function textoDocx(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export type DadosCurriculo = {
  nome: string | null;
  resumo: string | null;
  formacao: { curso: string; instituicao: string | null; ano: string | null }[];
  residencias: { especialidade: string; instituicao: string | null; periodo: string | null }[];
  especialidades: { nome: string; rqe: string | null }[];
  experiencias: { local: string; cidade: string | null; funcao: string | null; periodo: string | null }[];
  cursos: string[];
};

/** Esquema pedido à IA (o subconjunto de JSON Schema que o Gemini aceita em responseSchema). */
export const ESQUEMA_CURRICULO = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Nome do médico como está no currículo" },
    resumo: { type: "string", description: "Duas frases: formação principal, especialidade e onde atua ou atuou. Em português." },
    formacao: { type: "array", items: { type: "object", properties: { curso: { type: "string" }, instituicao: { type: "string" }, ano: { type: "string" } }, required: ["curso"] } },
    residencias: { type: "array", items: { type: "object", properties: { especialidade: { type: "string" }, instituicao: { type: "string" }, periodo: { type: "string" } }, required: ["especialidade"] } },
    especialidades: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, rqe: { type: "string" } }, required: ["nome"] } },
    experiencias: { type: "array", items: { type: "object", properties: { local: { type: "string" }, cidade: { type: "string" }, funcao: { type: "string" }, periodo: { type: "string" } }, required: ["local"] } },
    cursos: { type: "array", items: { type: "string" } },
  },
  required: ["resumo", "formacao", "residencias", "especialidades", "experiencias", "cursos"],
};

export const INSTRUCAO_CURRICULO =
  "Você lê o currículo de um médico para a ficha dele num sistema de gestão de plantões. Extraia só o que está escrito no " +
  "documento, sem inventar nem completar. Datas e períodos como aparecem (ex.: 2018-2021, desde 2022). RQE só se estiver " +
  "escrito. Experiências: hospitais, clínicas e serviços onde trabalhou, do mais recente ao mais antigo. Se o documento não " +
  "for um currículo, devolva tudo vazio e resumo \"Documento não parece um currículo.\"";

const texto = (v: unknown, max = 200) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const lista = <T>(v: unknown, f: (x: any) => T | null, max = 30): T[] =>
  (Array.isArray(v) ? v : []).map(f).filter((x): x is T => x !== null).slice(0, max);

/** Limpa o que a IA devolveu: tira vazios, corta textos longos, garante o formato (a tela confia nele). */
export function normalizarCurriculo(bruto: unknown): DadosCurriculo {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    nome: texto(b.nome, 120),
    resumo: texto(b.resumo, 500),
    formacao: lista(b.formacao, (x) => (texto(x?.curso) ? { curso: texto(x.curso)!, instituicao: texto(x?.instituicao), ano: texto(x?.ano, 40) } : null)),
    residencias: lista(b.residencias, (x) => (texto(x?.especialidade) ? { especialidade: texto(x.especialidade)!, instituicao: texto(x?.instituicao), periodo: texto(x?.periodo, 60) } : null)),
    especialidades: lista(b.especialidades, (x) => (texto(x?.nome) ? { nome: texto(x.nome)!, rqe: texto(x?.rqe, 30) } : null)),
    experiencias: lista(b.experiencias, (x) => (texto(x?.local) ? { local: texto(x.local)!, cidade: texto(x?.cidade, 80), funcao: texto(x?.funcao, 120), periodo: texto(x?.periodo, 60) } : null), 40),
    cursos: lista(b.cursos, (x) => texto(x, 160), 40),
  };
}

/** Telefone do contato do WhatsApp (contact_phone ou o JID) só com dígitos e com +, para find_lead_by_phone. */
export function foneDoContato(phone: string | null | undefined, jid: string | null | undefined): string | null {
  const d = String(phone || String(jid ?? "").split("@")[0]).replace(/\D/g, "");
  return d.length >= 10 ? `+${d}` : null;
}
