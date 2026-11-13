// Completude do lote no Conta Azul: quem do fechamento devia estar lá e não está, e por quê.
//
// Maria, 13/11/2026: Arthur Blois (Navegantes) estava no Sigma e cadastrado no Conta Azul, mas não foi junto com
// os outros médicos ao lançar; ela só soube quando ele cobrou o pagamento. O toast dizia "N lançados" e o que
// ficou de fora (não selecionado, com pendência na prévia, erro, envio interrompido) sumia sem aviso.
//
// Sem dependência de Deno: a edge financeiro-conta-azul usa no envio e a tela de notas fiscais importa o mesmo
// arquivo para o aviso, para as duas contarem igual.

export type PagLote = {
  id: string;
  profissional_nome: string | null;
  unidade?: string | null;
  arquivo_origem?: string | null;
  valor_total: number | null;
  conferido_em: string | null;
  status?: string | null;
  nf_status?: string | null;
  ca_evento_id: string | null;
  ca_erro?: string | null;
};

export type TipoPendencia = "nao_enviado" | "falta_resolver" | "erro" | "envio_interrompido" | "sem_confirmacao";
export type Pendencia = { pagamento_id: string; medico: string; unidade: string | null; tipo: TipoPendencia; motivo: string };
export type Lote = { esperados: number; confirmados: number; completo: boolean; pendentes: Pendencia[] };

/** Prefixo de ca_erro quando o Conta Azul aceitou o envio mas não devolveu o id do lançamento. */
export const SEM_CONFIRMACAO = "sem_confirmacao";

export const confirmadoNoContaAzul = (p: Pick<PagLote, "ca_evento_id">) => String(p.ca_evento_id ?? "").trim() !== "";

/**
 * Entra no lote quem foi liberado no fechamento e tem valor a pagar. Pago no Sigma sem lançamento pelo Sigma
 * foi lançado e pago à mão no Conta Azul (o caso do Arthur depois da cobrança): já não corre o risco de ficar
 * sem pagamento, então não fica no aviso para sempre.
 */
export function esperadoNoContaAzul(p: PagLote) {
  if (!p.conferido_em || !(Number(p.valor_total ?? 0) > 0) || p.nf_status === "dispensada") return false;
  return confirmadoNoContaAzul(p) || p.status !== "pago";
}

/**
 * Envio que pode já ter criado a conta a pagar no Conta Azul sem o Sigma saber. A API não apaga conta a pagar,
 * então não reenvia sozinho: alguém confere lá antes.
 */
export function bloqueioDeEnvio(p: Pick<PagLote, "ca_evento_id" | "ca_erro">): string | null {
  if (p.ca_evento_id != null && !confirmadoNoContaAzul(p)) return MOTIVO.sem_confirmacao;
  if (confirmadoNoContaAzul(p)) return null;
  if (p.ca_erro === "enviando") return MOTIVO.envio_interrompido;
  if (String(p.ca_erro ?? "").startsWith(SEM_CONFIRMACAO)) return MOTIVO.sem_confirmacao;
  return null;
}

const MOTIVO = {
  sem_confirmacao: "O Conta Azul recebeu o envio mas não devolveu o número do lançamento. Confira no Conta Azul antes de lançar de novo.",
  envio_interrompido: "O envio começou e o Conta Azul não confirmou. Confira no Conta Azul antes de lançar de novo.",
  nao_enviado: "Não foi enviado ao Conta Azul.",
};

/** "contaazul_400:Fornecedor inativo" → "Fornecedor inativo" (o código fica no ca_erro para quem investiga). */
export const erroLegivel = (msg: string) => msg.replace(/^contaazul_\d+:\s*/, "").trim() || msg;

function pendencia(p: PagLote, problemas: string[] | undefined): Pendencia {
  const base = { pagamento_id: p.id, medico: p.profissional_nome || "Médico sem nome", unidade: p.unidade ?? null };
  const erro = String(p.ca_erro ?? "");
  if ((p.ca_evento_id != null && !confirmadoNoContaAzul(p)) || erro.startsWith(SEM_CONFIRMACAO)) {
    return { ...base, tipo: "sem_confirmacao", motivo: MOTIVO.sem_confirmacao };
  }
  if (erro === "enviando") return { ...base, tipo: "envio_interrompido", motivo: MOTIVO.envio_interrompido };
  if (erro) return { ...base, tipo: "erro", motivo: `O Conta Azul recusou: ${erroLegivel(erro)}` };
  if (problemas?.length) return { ...base, tipo: "falta_resolver", motivo: `Não foi enviado: ${problemas.join(" ")}` };
  return { ...base, tipo: "nao_enviado", motivo: MOTIVO.nao_enviado };
}

/**
 * Esperado (liberado no fechamento, com valor) contra confirmado (com id do Conta Azul).
 * `problemas` são os da prévia, por pagamento, quando se sabe por que não foi.
 */
export function conferirLote(pags: PagLote[], problemas: Record<string, string[]> = {}): Lote {
  const esperados = pags.filter(esperadoNoContaAzul);
  const pendentes = esperados.filter((p) => !confirmadoNoContaAzul(p)).map((p) => pendencia(p, problemas[p.id]))
    .sort((a, b) => a.medico.localeCompare(b.medico, "pt-BR"));
  return { esperados: esperados.length, confirmados: esperados.length - pendentes.length, completo: pendentes.length === 0, pendentes };
}

export type ItemLancar = { id: string; medico?: string | null; problemas: string[]; payload: Record<string, unknown> | null };
export type ResultadoEnvio = { id: string; medico: string | null; ok: boolean; erro?: string; ca_evento_id?: string };
export type DepsEnvio = {
  /** UPDATE condicional: true só se este envio pegou a vez (ca_evento_id nulo e ninguém enviando). */
  travar: (id: string) => Promise<boolean>;
  enviar: (payload: Record<string, unknown>) => Promise<unknown>;
  confirmar: (it: ItemLancar, eventoId: string, criado: unknown) => Promise<void>;
  falhar: (id: string, msg: string) => Promise<void>;
};

/** Envia um por um, com a trava por pagamento, e só conta como lançado o que voltou com id do Conta Azul. */
export async function lancarItens(itens: ItemLancar[], deps: DepsEnvio): Promise<ResultadoEnvio[]> {
  const resultados: ResultadoEnvio[] = [];
  for (const it of itens) {
    const medico = it.medico ?? null;
    if (!it.payload || it.problemas.length) { resultados.push({ id: it.id, medico, ok: false, erro: it.problemas.join(" ") || "lançamento incompleto" }); continue; }
    if (!(await deps.travar(it.id))) { resultados.push({ id: it.id, medico, ok: false, erro: "já lançado ou em envio" }); continue; }
    try {
      const criado = await deps.enviar(it.payload);
      const eventoId = String((criado as { id?: unknown } | null)?.id ?? "").trim();
      if (!eventoId) {
        // antes gravava ca_evento_id = "": não aparecia como lançado nem deixava lançar de novo, sem aviso
        const msg = `${SEM_CONFIRMACAO}: o Conta Azul não devolveu o id do lançamento`;
        await deps.falhar(it.id, msg);
        resultados.push({ id: it.id, medico, ok: false, erro: MOTIVO.sem_confirmacao });
        continue;
      }
      await deps.confirmar(it, eventoId, criado);
      resultados.push({ id: it.id, medico, ok: true, ca_evento_id: eventoId });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
      await deps.falhar(it.id, msg);
      resultados.push({ id: it.id, medico, ok: false, erro: msg });
    }
  }
  return resultados;
}
