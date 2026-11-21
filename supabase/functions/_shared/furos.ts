// Aviso de furo de escala (item "Claude GSS: monitoramento do Dr. Escala" da tabela da Ramone, 21/11/2026).
// Regras puras: quem recebe o quê. A edge alertas-equipe (acao "furos") lê os furos de drescala_escala_v, os
// destinatários de escala_furo_destinos e o que já foi avisado em escala_furo_avisos, e chama montarAvisos.
// Testes: furos_test.ts (deno test).
//
// Dois avisos por furo e por pessoa, cada um uma vez só:
//   novo    — o furo aparece nos próximos HORIZONTE_DIAS dias (o robô sincroniza 06h, 12h e 18h).
//   vespera — o furo continua aberto a menos de 24 h do início.
// Furo já começado não gera aviso: não há mais o que fazer pelo WhatsApp.

export type Furo = { id: number; local_id: number | null; hospital: string | null; setor: string | null; inicio: string; fim: string | null };
export type DestinoFuro = { nome: string; fone: string; local_ids: number[] | null };
export type Feito = { plantao_id: number; tipo: "novo" | "vespera"; fone: string };
export type Aviso = { destino: DestinoFuro; itens: { furo: Furo; tipo: "novo" | "vespera" }[] };

export const HORIZONTE_DIAS = 7;
const DIA_MS = 24 * 3_600_000;

export function montarAvisos(furos: Furo[], destinos: DestinoFuro[], feitos: Feito[], agora: Date): Aviso[] {
  const ja = new Set(feitos.map((f) => `${f.plantao_id}|${f.tipo}|${f.fone}`));
  const t = agora.getTime();
  const abertos = furos
    .filter((f) => { const i = new Date(f.inicio).getTime(); return i > t && i <= t + HORIZONTE_DIAS * DIA_MS; })
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id);
  const out: Aviso[] = [];
  for (const d of destinos) {
    const itens: Aviso["itens"] = [];
    for (const f of abertos) {
      // local_ids null = a pessoa cuida de todos os hospitais.
      if (d.local_ids && d.local_ids.length && (f.local_id === null || !d.local_ids.includes(f.local_id))) continue;
      const perto = new Date(f.inicio).getTime() - t <= DIA_MS;
      // Furo que já nasce a menos de 24 h vira só "vespera": dois avisos do mesmo furo na mesma rodada seria ruído.
      const tipo = perto ? "vespera" : "novo";
      if (!ja.has(`${f.id}|${tipo}|${d.fone}`)) itens.push({ furo: f, tipo });
    }
    if (itens.length) out.push({ destino: d, itens });
  }
  return out;
}

const TZ = "America/Sao_Paulo";
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const hora = (iso: string) => {
  const [h, m] = new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).split(":");
  return m === "00" ? `${h}h` : `${h}h${m}`;
};
// Nome do Dr. Escala vem em caixa alta ("HOSPITAL E MATERNIDADE MARIETA KONDER BORNHAUSEN"): encurta e deixa legível.
export function nomeCurto(hospital: string | null) {
  if (!String(hospital || "").trim()) return "Hospital sem nome";
  const n = String(hospital).replace(/\s+/g, " ").trim()
    .replace(/^HOSPITAL E MATERNIDADE /i, "").replace(/^HOSPITAL /i, "").replace(/^MATERNIDADE /i, "");
  // Uma palavra só em caixa alta é sigla (CEPON, HRO): fica como está.
  const t = n.includes(" ") && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : n;
  return t.length > 28 ? `${t.slice(0, 27).trim()}…` : t;
}

/** Parâmetros do modelo gss_furo_escala_v1 ({{1}} resumo, {{2}} lista). Sem quebra de linha (a Meta recusa). */
export function textoAviso(a: Aviso, limite = 700): [string, string] {
  const vespera = a.itens.filter((i) => i.tipo === "vespera").length;
  const novos = a.itens.length - vespera;
  const partes = [];
  if (vespera) partes.push(`${vespera} ${vespera === 1 ? "furo" : "furos"} nas proximas 24 h`);
  if (novos) partes.push(`${novos} ${novos === 1 ? "furo novo" : "furos novos"} nos proximos ${HORIZONTE_DIAS} dias`);
  const linhas = a.itens.map(({ furo: f }) =>
    `${nomeCurto(f.hospital)}${f.setor ? ` ${f.setor.trim()}` : ""} ${dia(f.inicio)} ${hora(f.inicio)}${f.fim ? `-${hora(f.fim)}` : ""}`);
  let lista = "";
  for (let i = 0; i < linhas.length; i++) {
    const resto = linhas.length - i - 1;
    const prox = (lista ? `${lista}; ` : "") + linhas[i];
    const sufixo = resto ? `; +${resto} no Sigma` : "";
    if ((prox + sufixo).length > limite) { lista = `${lista}; +${linhas.length - i} no Sigma`; break; }
    lista = prox;
  }
  return [partes.join(" e "), lista.replace(/\s+/g, " ")];
}
