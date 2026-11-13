// Regras puras das escalas do Dr. Escala no MCP dos sócios (docs/arquitetura/claude-socios-gss.md §3c).
// Sem import e sem banco: datas em hora de Brasília, busca de hospital pelo jeito que o sócio fala e o texto
// que volta para o Claude. Usado por supabase/functions/sigma-mcp. Testes: escalas_test.ts (deno test).

export const TZ = "America/Sao_Paulo";

/** Dia de hoje em Brasília (AAAA-MM-DD). `agora` só existe para o teste fixar o relógio. */
export function hojeBR(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(agora);
}

export function somaDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Aceita "hoje", "amanhã" (com ou sem acento), "ontem", AAAA-MM-DD e DD/MM[/AA[AA]]. Vazio: `padrao` ou erro. */
export function lerData(v: unknown, padrao?: string, hoje: string = hojeBR()): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) {
    if (padrao) return padrao;
    throw new Error("data obrigatória (AAAA-MM-DD, DD/MM/AAAA, hoje ou amanhã)");
  }
  if (s === "hoje") return hoje;
  // startsWith: o "ã" chega quebrado de alguns terminais ("amanh�"), e o sócio também escreve "amanha".
  if (s.startsWith("amanh")) return somaDias(hoje, 1);
  if (s === "ontem") return somaDias(hoje, -1);
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : hoje.slice(0, 4);
    iso = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // 31/02 viraria 03/03 no Date: confere que o dia volta igual (mês 13 nem vira data).
  if (!iso || isNaN(new Date(iso + "T12:00:00Z").getTime()) || somaDias(iso, 0) !== iso) throw new Error(`data inválida: ${v}`);
  return iso;
}

/** Período [ini, fim] válido e com no máximo `maxDias` dias de diferença. */
export function periodoValido(ini: string, fim: string, maxDias: number): boolean {
  return fim >= ini && somaDias(ini, maxDias) >= fim;
}

/**
 * "quando" do sócio em hora de Brasília: AAAA-MM-DDTHH:MM (ou com segundos) sem fuso vira -03:00 fixo
 * (o Brasil não tem horário de verão desde 2019). Com fuso explícito, respeita. Vazio: agora.
 */
export function lerMomento(v: unknown, agora: Date = new Date()): Date {
  const s = String(v ?? "").trim();
  if (!s) return agora;
  const semFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s);
  const d = new Date(semFuso ? `${s.length === 16 ? s + ":00" : s}-03:00` : s);
  if (isNaN(d.getTime())) throw new Error("'quando' inválido: use AAAA-MM-DDTHH:MM");
  return d;
}

export function hora(iso: string | null): string {
  if (!iso) return "?";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  const sem = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(new Date(iso + "T12:00:00Z"));
  return `${sem.replace(".", "")} ${d}/${m}/${a}`;
}

export function momentoBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(d);
}

// ---- hospitais -------------------------------------------------------------------------------------------

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PARTICULAS = new Set(["de", "do", "da", "dos", "das", "e"]);

export type Local = { id: number; nome: string; cidade: string | null };

/** Local de teste do Dr. Escala ("LOCAL TESTE ...") nunca aparece para o sócio: tinha furos falsos. */
export const ehLocalTeste = (nome: string) => semAcento(nome).includes("local teste");

/**
 * Acha o hospital pelo jeito que o sócio fala, do mais preciso para o mais solto:
 * nome exato → trecho do nome/cidade → todas as palavras → iniciais ("hro" = Hospital Regional do Oeste).
 * Devolve todos os que casam no primeiro nível que achar algo.
 */
export function acharHospitais(locais: Local[], busca: string): Local[] {
  const q = semAcento(busca);
  if (!q) return [];
  const texto = (l: Local) => semAcento(`${l.nome} ${l.cidade ?? ""}`);
  const exato = locais.filter((l) => semAcento(l.nome) === q);
  if (exato.length) return exato;
  const contem = locais.filter((l) => texto(l).includes(q));
  if (contem.length) return contem;
  const palavras = q.split(/\s+/);
  const todas = locais.filter((l) => palavras.every((p) => texto(l).includes(p)));
  if (todas.length) return todas;
  const sigla = q.replace(/\s/g, "");
  if (sigla.length < 2) return [];
  return locais.filter((l) => {
    const ini = semAcento(l.nome).split(/[\s\-.]+/).filter((w) => w && !PARTICULAS.has(w)).map((w) => w[0]).join("");
    return ini.startsWith(sigla);
  });
}

export const MAX_HOSPITAIS = 6;

/** null = sem filtro; [] + aviso = nada a consultar (não achou ou ambíguo demais). */
export function resolverBusca(locais: Local[], busca: unknown): { ids: number[] | null; aviso?: string } {
  const b = String(busca ?? "").trim();
  if (!b) return { ids: null };
  const achados = acharHospitais(locais, b);
  if (achados.length === 0) {
    return { ids: [], aviso: `Nenhum hospital do Dr. Escala casa com "${b}". Use escalas_hospitais para ver a lista.` };
  }
  if (achados.length > MAX_HOSPITAIS) {
    return {
      ids: [],
      aviso: `"${b}" casa com ${achados.length} hospitais. Seja mais específico. Alguns: ${achados.slice(0, 10).map((l) => l.nome).join("; ")}`,
    };
  }
  return { ids: achados.map((l) => l.id) };
}

// ---- texto da resposta ----------------------------------------------------------------------------------

export type Plantao = {
  id: number; data: string; inicio: string; fim: string | null; local_id: number; hospital: string | null;
  setor: string | null; profissional_nome: string | null; profissional_crm: string | null; situacao: string | null;
  tipo: string | null; furo: boolean;
};

export function linhaPlantao(p: Plantao, comHospital = false): string {
  const quem = p.furo ? "**DESCOBERTO**" : `${p.profissional_nome ?? "sem nome"}${p.profissional_crm ? ` (CRM ${p.profissional_crm})` : ""}`;
  const extra = [p.tipo, p.situacao && !p.furo ? p.situacao : null].filter(Boolean).join(", ");
  return `- ${hora(p.inicio)}–${hora(p.fim)}${comHospital ? ` · ${p.hospital}` : ""} · ${p.setor ?? "sem setor"}: ${quem}${extra ? ` (${extra})` : ""}`;
}

/** Plantões já ordenados por data (e hospital) viram blocos "### dia [· hospital]". */
export function agrupar(rows: Plantao[], comHospitalNoTitulo: boolean): string {
  const out: string[] = [];
  let chave = "";
  for (const p of rows) {
    const k = comHospitalNoTitulo ? `${p.data}|${p.hospital}` : p.data;
    if (k !== chave) {
      chave = k;
      out.push(`\n### ${diaBR(p.data)}${comHospitalNoTitulo ? ` · ${p.hospital}` : ""}`);
    }
    out.push(linhaPlantao(p));
  }
  return out.join("\n");
}

/** Contagem por hospital para o resumo dos descobertos, do que tem mais para o que tem menos. */
export function resumoPorHospital(rows: Plantao[]): string {
  const porHosp = new Map<string, number>();
  for (const r of rows) porHosp.set(r.hospital ?? "?", (porHosp.get(r.hospital ?? "?") || 0) + 1);
  return [...porHosp.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([n, c]) => `${n}: ${c}`).join("; ");
}

/** Busca por médico: 3+ dígitos e no máximo a UF em letras ("12.345/SC") é CRM; o resto é nome sem curinga do ilike. */
export function filtroProfissional(p: string): { coluna: "profissional_crm" | "profissional_nome"; padrao: string } {
  const s = String(p || "").trim();
  if (s.replace(/\D/g, "").length >= 3 && s.replace(/[^a-z]/gi, "").length <= 2) return { coluna: "profissional_crm", padrao: `%${s.replace(/\D/g, "")}%` };
  return { coluna: "profissional_nome", padrao: `%${s.replace(/[%_]/g, "")}%` };
}
