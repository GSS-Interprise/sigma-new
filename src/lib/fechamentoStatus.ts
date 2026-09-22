// Situação do fechamento vista de fora da tela — usada pelo relatório que a equipe baixa.
//
// Reunião 22/09 (GSS): o relatório saiu com tudo "não conferido" num fechamento que já
// tinha sido conferido e aprovado. A conferência só virava carimbo quando alguém clicava
// médico a médico; desde 0979006 ela é o ato de liberar a competência, mas o que já tinha
// avançado antes disso continua sem carimbo — e não há tela para conferir de novo, porque
// o fechamento saiu da fase 1. Então o relatório deriva do ESTADO PERSISTIDO: um
// lançamento preso a um fechamento que já passou da conferência é conferido, ponto.

/** Fases em que a competência já passou pela conferência da Mavi (ver FinanceiroFases). */
export const STATUS_JA_CONFERIDOS = ["em_nf", "aguardando_aprovacao", "aprovado", "pago"] as const;

export const SITUACAO_FECHAMENTO: Record<string, string> = {
  em_nf: "Liberado para as notas fiscais",
  aguardando_aprovacao: "Aguardando aprovação da diretoria",
  aprovado: "Aprovado pela diretoria",
  pago: "Pago",
  cancelado: "Cancelado",
};

export type PagamentoConferivel = { conferido_em?: string | null; fechamento_id?: string | null };
export type FechamentoRef = { id?: string | null; status?: string | null } | null | undefined;

/** O fechamento da competência já passou da conferência? */
export function fechamentoJaConferido(fechamento: FechamentoRef): boolean {
  return STATUS_JA_CONFERIDOS.includes((fechamento?.status ?? "") as typeof STATUS_JA_CONFERIDOS[number]);
}

/**
 * Um lançamento é conferido quando tem o carimbo OU quando pertence a um fechamento que
 * já avançou. O vínculo (`fechamento_id`) importa: lançamento importado depois da
 * liberação não herda a conferência de quem foi liberado antes dele.
 */
export function pagamentoConferido(pagamento: PagamentoConferivel, fechamento: FechamentoRef): boolean {
  if (pagamento.conferido_em) return true;
  if (!fechamento?.id || !fechamentoJaConferido(fechamento)) return false;
  return pagamento.fechamento_id === fechamento.id;
}

/** Texto da coluna "Situação" do relatório baixado. */
export function situacaoDoRelatorio(pagamento: PagamentoConferivel, fechamento: FechamentoRef): string {
  const status = fechamento?.status ?? null;
  if (status && pagamento.fechamento_id === fechamento?.id) {
    return SITUACAO_FECHAMENTO[status] ?? status;
  }
  return pagamentoConferido(pagamento, fechamento) ? "Conferido" : "Em fechamento";
}
