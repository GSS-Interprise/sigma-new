// Regras puras do SLA de laudos: escada de ligação depois do vencido e indicadores do dia (sla-alertas).
// Sem import: testes em slaEscada_test.ts (deno test). Plano: docs/arquitetura/sla-laudos-radiologia.md.

// ---- Escada de ligação -----------------------------------------------------------------------------------------
// Exame vencido e ninguém assumiu: liga ao plantonista, de novo ao plantonista, depois ao coordenador, por fim à
// diretoria. Só a tecla 1 (ou o "Assumir laudo" no WhatsApp, ou a tela) para a escada: atender e desligar não conta
// (decisão do Raul, 12/11). Papel sem ninguém escalado no horário é pulado.
export const ESCADA = ["plantonista", "plantonista", "coordenador", "diretoria"] as const;
export type Papel = (typeof ESCADA)[number];
export const ESPERA_ENTRE_PASSOS_MIN = 3;   // depois que a ligação anterior terminou sem a tecla 1
export const LIGACAO_PRESA_MIN = 5;         // Twilio não devolveu o status: considera terminada

export type LigacaoFeita = { passo: number; status: string; criado_em: string };
export type Proximo =
  | { acao: "ligar"; passo: number; papel: Papel }
  | { acao: "esperar"; motivo: string }
  | { acao: "fim" }       // escada acabou e ninguém assumiu
  | { acao: "parar" };    // alguém apertou 1

const minutos = (de: string, agora: Date) => (agora.getTime() - new Date(de).getTime()) / 60000;

/**
 * Próximo passo da escada de um exame vencido.
 * @param ligacoes ligações já feitas para este exame (passo 1..4; várias por passo se houver 2 plantonistas)
 * @param temPapel quem está escalado agora
 */
export function proximoPassoEscada(ligacoes: LigacaoFeita[], temPapel: Record<Papel, boolean>, agora = new Date()): Proximo {
  if (ligacoes.some((l) => l.status === "respondido")) return { acao: "parar" };
  const ultimoPasso = ligacoes.reduce((m, l) => Math.max(m, l.passo), 0);
  if (ultimoPasso > 0) {
    const doPasso = ligacoes.filter((l) => l.passo === ultimoPasso);
    const emCurso = doPasso.some((l) => (l.status === "pendente" || l.status === "enviado") && minutos(l.criado_em, agora) < LIGACAO_PRESA_MIN);
    if (emCurso) return { acao: "esperar", motivo: "ligação em curso" };
    const maisRecente = doPasso.reduce((m, l) => (l.criado_em > m ? l.criado_em : m), doPasso[0].criado_em);
    if (minutos(maisRecente, agora) < ESPERA_ENTRE_PASSOS_MIN) return { acao: "esperar", motivo: "intervalo entre ligações" };
  }
  for (let p = ultimoPasso + 1; p <= ESCADA.length; p++) {
    const papel = ESCADA[p - 1];
    if (temPapel[papel]) return { acao: "ligar", passo: p, papel };
  }
  return { acao: "fim" };
}

// ---- Indicadores do dia -------------------------------------------------------------------------------------------
export type ExameDia = {
  origem: string; inicio_em: string; vence_em: string; saiu_em: string | null; saida_confiavel: boolean | null;
  assumido_em: string | null; silenciado_em: string | null;
};
export type AlertaDia = { exame_id: string; criado_em: string; assumido_em: string | null };

export type Indicadores = {
  total: number;
  porOrigem: Array<{ origem: string; total: number; medidos: number; noPrazo: number; pct: number | null }>;
  noPrazoPct: number | null;      // só saída confiável (horário do laudo conhecido)
  vencidosSemInteracao: number;   // venceu, ninguém assumiu nem silenciou
  avisoAteAssumirMin: number | null;
  horasComAtraso: Array<{ hora: string; vencidos: number }>;
};

/** Mesma regra da view sla_exames_saida (migration 20261112150000): o horário do laudo só é confiável quando a saída
 * foi vista até 10 min depois da última leitura completa da fila. Calculado aqui porque a view, criada antes de
 * assumido_em/silenciado_em existirem, não tem essas colunas (o select nelas falha). */
export function saidaConfiavel(saiuEm: string | null, vistoCompletoEm: string | null) {
  return !!saiuEm && !!vistoCompletoEm && new Date(saiuEm).getTime() - new Date(vistoCompletoEm).getTime() <= 10 * 60000;
}

const ORIGEM: Record<string, string> = { ps: "Pronto Socorro", internado: "Internado", externo: "Externo" };
const horaSP = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2) + "h";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function calcularIndicadores(exames: ExameDia[], alertas: AlertaDia[], agora = new Date()): Indicadores {
  const venceu = (e: ExameDia) => {
    const fimReal = e.saiu_em ? new Date(e.saiu_em).getTime() : agora.getTime();
    return fimReal > new Date(e.vence_em).getTime();
  };
  const origens = new Map<string, { total: number; medidos: number; noPrazo: number }>();
  let medidos = 0, noPrazo = 0;
  for (const e of exames) {
    const o = origens.get(e.origem) ?? { total: 0, medidos: 0, noPrazo: 0 };
    o.total++;
    // Só conta no "% no prazo" quem tem o horário do laudo confiável; o resto não dá para medir.
    if (e.saiu_em && e.saida_confiavel) {
      o.medidos++; medidos++;
      if (!venceu(e)) { o.noPrazo++; noPrazo++; }
    }
    origens.set(e.origem, o);
  }
  const vencidosSemInteracao = exames.filter((e) => venceu(e) && !e.assumido_em && !e.silenciado_em).length;

  // Do primeiro aviso de cada exame até alguém assumir.
  const primeiroAviso = new Map<string, { aviso: number; assumido: number | null }>();
  for (const a of alertas) {
    const k = a.exame_id;
    const t = new Date(a.criado_em).getTime();
    const atual = primeiroAviso.get(k);
    if (!atual || t < atual.aviso) primeiroAviso.set(k, { aviso: t, assumido: a.assumido_em ? new Date(a.assumido_em).getTime() : null });
  }
  const tempos = [...primeiroAviso.values()].filter((x) => x.assumido && x.assumido >= x.aviso).map((x) => (x.assumido! - x.aviso) / 60000);
  const avisoAteAssumirMin = tempos.length ? Math.round(tempos.reduce((s, x) => s + x, 0) / tempos.length) : null;

  const porHora = new Map<string, number>();
  for (const e of exames.filter(venceu)) porHora.set(horaSP(e.inicio_em), (porHora.get(horaSP(e.inicio_em)) ?? 0) + 1);

  return {
    total: exames.length,
    porOrigem: [...origens.entries()].map(([origem, o]) => ({ origem: ORIGEM[origem] ?? origem, ...o, pct: pct(o.noPrazo, o.medidos) }))
      .sort((a, b) => b.total - a.total),
    noPrazoPct: pct(noPrazo, medidos),
    vencidosSemInteracao,
    avisoAteAssumirMin,
    horasComAtraso: [...porHora.entries()].map(([hora, vencidos]) => ({ hora, vencidos }))
      .sort((a, b) => b.vencidos - a.vencidos || a.hora.localeCompare(b.hora)).slice(0, 3),
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Texto do e-mail das 7h, em português de quem coordena o plantão. */
export function textoIndicadores(i: Indicadores, unidade: string, periodo: string) {
  if (i.total === 0) return `${unidade}, ${periodo}: nenhum exame na fila do PACS.`;
  const linhas = [
    `${unidade}, ${periodo}: ${plural(i.total, "exame", "exames")} na fila.`,
    i.noPrazoPct === null
      ? "No prazo: sem laudos com horário confiável para medir."
      : `No prazo: ${i.noPrazoPct}% dos laudos com horário confiável.`,
    ...i.porOrigem.map((o) => `  ${o.origem}: ${plural(o.total, "exame", "exames")}${o.pct === null ? "" : `, ${o.pct}% no prazo (${o.noPrazo} de ${o.medidos})`}`),
    `Vencidos sem ninguém assumir: ${i.vencidosSemInteracao}.`,
    i.avisoAteAssumirMin === null ? "Ninguém assumiu laudo pelos avisos." : `Do aviso até assumir: ${i.avisoAteAssumirMin} min em média.`,
  ];
  if (i.horasComAtraso.length) linhas.push(`Horas com mais atraso: ${i.horasComAtraso.map((h) => `${h.hora} (${h.vencidos})`).join(", ")}.`);
  return linhas.join("\n");
}
