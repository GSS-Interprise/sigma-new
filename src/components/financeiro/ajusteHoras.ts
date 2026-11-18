// Regras do formulário de ajuste do pagamento (FinanceiroAjustes), fora do componente para ter teste.
// O banco é quem soma: fin_recalc_pagamento faz total_horas_minutos = minutos_produzidos + soma dos minutos dos
// ajustes (20261118140000_financeiro_ajuste_horas.sql). Aqui só se lê o que a pessoa digitou e se prevê o resultado.

// "2", "2:30", "2h30", "2,5" → minutos. Vazio = 0 (ajuste só de valor). Inválido = null.
export const lerHoras = (t: string): number | null => {
  const v = t.trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return 0;
  const hm = v.match(/^(\d+)(?::|h)(\d{1,2})?m?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] || 0);
  if (!/^\d+(?:[.,]\d+)?h?$/.test(v)) return null;
  return Math.round(parseFloat(v.replace(",", ".")) * 60);
};

export const fmtHoras = (min: number) => {
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${min < 0 ? "−" : ""}${h}h${m ? String(m).padStart(2, "0") : ""}`;
};

// "200,00", "1.234,56" → número. Vazio = 0 (ajuste só de horas). Inválido = NaN.
export const lerValor = (t: string): number => {
  const v = t.trim();
  return v ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : 0;
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Correção de escala é mudança de carga: sem as horas, o pedido de NF sai com a carga antiga (Mavi, 18/11: "Corrigi,
// mas para os médicos só mudou o valor e não as horas"). Nessa categoria o campo Horas é obrigatório; "0" vale quando
// a carga de fato não mudou (troca de plantão de mesmo tamanho), mas tem de ser dito.
export const exigeHoras = (nomeCategoria: string | null | undefined) =>
  /correcao de escala/.test(semAcento(nomeCategoria || ""));

export type FormAjuste = {
  categoria_id: string;
  categoria_nome?: string | null;
  sinal: "mais" | "menos";
  valor: string;
  horas: string;
  justificativa: string;
};

export type Validacao = {
  ok: boolean;
  valor: number;     // com sinal, pronto para gravar
  minutos: number;   // com sinal, pronto para gravar
  faltaHoras: boolean;
  horasInvalidas: boolean;
};

export function validarAjuste(f: FormAjuste): Validacao {
  const s = f.sinal === "menos" ? -1 : 1;
  const bruto = lerValor(f.valor);
  const min = lerHoras(f.horas);
  const faltaHoras = exigeHoras(f.categoria_nome) && !f.horas.trim();
  const ok = !!f.categoria_id && !!f.justificativa.trim() && isFinite(bruto) && min != null && !faltaHoras
    // vale ajuste só de valor, só de horas ou dos dois; vazio nos dois não (o check do banco também recusa)
    && (bruto !== 0 || min !== 0);
  return {
    ok,
    valor: isFinite(bruto) ? s * Math.abs(bruto) : 0,
    minutos: min == null ? 0 : s * min,
    faltaHoras,
    horasInvalidas: min == null,
  };
}

// Horas que o pedido de NF vai levar depois de salvar. Na edição, o que esse ajuste já tinha lançado sai antes de
// entrar o novo (o banco soma os ajustes de novo, não acumula), e a carga nunca fica negativa (greatest(0, …)).
export const minutosPrevistos = (minutosAtuais: number, minutosJaLancados: number, minutosNovos: number) =>
  Math.max(0, minutosAtuais - minutosJaLancados + minutosNovos);
