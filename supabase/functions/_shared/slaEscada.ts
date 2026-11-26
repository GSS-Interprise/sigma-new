// Regras puras do SLA de laudos: escada de ligação depois do vencido e indicadores do dia (sla-alertas).
// Sem import: testes em slaEscada_test.ts (deno test). Plano: docs/arquitetura/sla-laudos-radiologia.md.

// ---- Sequência de avisos (21/11) ---------------------------------------------------------------------------------
// Configurada na tela (tabela sla_aviso_passos): aba Avisos = 1º, 2º, 3º aviso ao plantonista; aba Coordenação = quem
// mais avisar se ninguém assumir. minutos é relativo ao vencimento do laudo (negativo = antes). Cada passo vai uma vez
// por exame; o motor só chama isto para exame que ninguém assumiu.
export type PassoAviso = {
  id: string; destino: "plantonista" | "contato"; minutos: number; canal: "whatsapp" | "ligacao" | "email"; ativo: boolean;
  periodo?: string | null;
};

// Período do contato da Coordenação (Wagner, 26/11: Brenda no horário comercial, Wagner à noite e no fim de semana,
// Ramone sempre, por último). Comercial = segunda a sexta, 7h às 19h de Brasília; fora = o resto. Sem período = sempre.
export function noPeriodo(periodo: string | null | undefined, agora = new Date()): boolean {
  if (periodo !== "comercial" && periodo !== "fora") return true;
  const sp = new Date(agora.getTime() - 3 * 3_600_000); // Brasília sem horário de verão
  const dia = sp.getUTCDay(), hora = sp.getUTCHours();
  const comercial = dia >= 1 && dia <= 5 && hora >= 7 && hora < 19;
  return periodo === "comercial" ? comercial : !comercial;
}

/**
 * Passos a disparar agora para um exame.
 * @param feitos ids dos passos que já foram para este exame
 * @param desdeVencimentoMin minutos desde o vencimento (negativo = ainda falta)
 * Plantonista: só o passo mais adiantado que já chegou. Exame que entra na fila atrasado (coletor voltou, prazo mudou)
 * não recebe o 1º e o 2º aviso juntos; e passo anterior a um que já foi não volta. Contatos: cada um é uma pessoa,
 * todos os que chegaram vão.
 */
export function passosAgora(passos: PassoAviso[], feitos: Set<string>, desdeVencimentoMin: number, agora = new Date()): PassoAviso[] {
  const chegaram = passos.filter((p) => p.ativo && p.minutos <= desdeVencimentoMin && !feitos.has(p.id)
    && (p.destino !== "contato" || noPeriodo(p.periodo, agora)));
  const doPlantonista = passos.filter((p) => p.destino === "plantonista");
  const ultimoFeito = Math.max(-Infinity, ...doPlantonista.filter((p) => feitos.has(p.id)).map((p) => p.minutos));
  const plantonista = chegaram.filter((p) => p.destino === "plantonista" && p.minutos > ultimoFeito)
    .sort((a, b) => b.minutos - a.minutos)[0];
  return [...(plantonista ? [plantonista] : []), ...chegaram.filter((p) => p.destino === "contato")];
}

// ---- Modo de teste interno ------------------------------------------------------------------------------------
// Config sla_teste_destino (telefone com 55): todo aviso vai para esse número em vez do escalado, e a escada não liga
// (fim de semana de validação, 14-15/11: "alertas internos para a equipe só para validarmos"). O registro guarda para
// quem iria, para conferir na tela se a escala estava certa. O "Assumir laudo" vale do número de teste.
export function destinoDoAviso(pessoa: { nome: string; telefone: string }, testeDestino: string | null | undefined) {
  const t = String(testeDestino || "").replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(t)) return { nome: pessoa.nome, telefone: pessoa.telefone, teste: false };
  return { nome: `${pessoa.nome} (teste interno)`, telefone: t, teste: true };
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

// Modalidade pelo nome do estudo que o PACS mostra ("TC Torax", "US Abdome", "Doppler..."). A fila do Marieta é
// quase toda tomografia, então o que não for ultrassom conta como TC.
export function modalidadeDoExame(estudo: string | null | undefined): "TC" | "US" {
  return /\b(US|USG|ULTRA|ULTRASS|DOPPLER|ECOGRAF)/i.test(estudo ?? "") ? "US" : "TC";
}

export function daModalidade<T extends { modalidade?: string | null }>(pessoas: T[], m: string): T[] {
  const certas = pessoas.filter((p) => !p.modalidade || p.modalidade === m);
  return certas.length ? certas : pessoas;
}
