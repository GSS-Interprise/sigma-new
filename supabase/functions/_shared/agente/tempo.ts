// Tempo e texto comuns a todos os domínios do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3b).
// Tudo em hora de Brasília e resolvido no servidor: "hoje" é o mesmo para os 4 sócios, qualquer que seja o fuso
// do Claude de cada um. Puro (sem banco). Testes: agente/tempo_test.ts e escalas_test.ts.

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

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
