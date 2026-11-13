// Regras da conferência da nota do médico que não dependem do banco nem do Conta Azul.
// Ficam aqui para serem testadas com a nota lida (nfse-conferencia_test.ts); quem grava é o
// financeiro-conta-azul (ação "conferir" e "aceitar_nota").
import type { LeituraAssistida, Nfse } from "./nfse.ts";

export type ItemConferencia = { chave: string; rotulo: string; ok: boolean | null; detalhe: string };
export type StatusConferencia = "ok" | "divergente" | "manual";

const r2 = (n: number) => Math.round(n * 100) / 100;
// igual ao financeiro-conta-azul: campo não lido aparece como "—", não como R$ 0,00
const brl = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A sugestão da leitura assistida só vale se leu o mesmo bruto da nota. */
export const sugestaoConfere = (nota: Nfse | null, s: LeituraAssistida | null) =>
  !!s && nota?.valor != null && Math.abs(s.valor - nota.valor) <= 0.01;

/**
 * Itens que saem da leitura da nota: tomador, valor, impostos e alíquotas. O CNPJ do prestador
 * depende do cadastro e é montado por quem chama.
 *
 * Nota sem o campo de valor líquido mas com imposto destacado ou com o líquido escrito na
 * descrição (Yuri, Santo Antônio do Pinhal, 13/11: pago pelo bruto, ~R$ 800 a mais) é DIVERGÊNCIA,
 * não "conferir à mão": o Sigma não calcula o líquido, quem confere informa.
 */
export function itensDaLeitura(nota: Nfse, aPagar: number, sugestao: LeituraAssistida | null): ItemConferencia[] {
  const itens: ItemConferencia[] = [];
  itens.push({ chave: "tomador", rotulo: "Tomador é a GSS", ok: nota.tomadorGss, detalhe: nota.tomadorGss ? "CNPJ da GSS no tomador." : "O tomador da nota não é a GSS." });
  const valorOk = nota.valor != null && Math.abs(nota.valor - aPagar) <= 0.01;
  itens.push({
    chave: "valor", rotulo: "Valor da nota", ok: nota.valor == null ? null : valorOk,
    detalhe: nota.valor == null ? "Não consegui ler o valor do serviço." : valorOk ? `${brl(nota.valor)}, igual ao fechamento.` : `Nota ${brl(nota.valor)} · fechamento ${brl(aPagar)} · diferença ${brl(r2(nota.valor - aPagar))}.`,
  });

  const sugOk = sugestaoConfere(nota, sugestao);
  const citadas = nota.retencoesCitadas ?? [];
  const liqDesc = nota.liquidoNaDescricao ?? null;
  const semCampoComSinal = !nota.impostosLidos && (citadas.length > 0 || liqDesc != null);
  let detalheImpostos: string;
  if (nota.impostosLidos) {
    detalheImpostos = Number(nota.totalRetencoes) > 0
      ? `Retido ${brl(nota.totalRetencoes)} (IRRF ${brl(nota.irrf)}, PIS/COFINS/CSLL ${brl(nota.contribSociais)}${Number(nota.inssRetido) > 0 ? `, INSS ${brl(nota.inssRetido)}` : ""}${Number(nota.issRetido) > 0 ? `, ISS ${brl(nota.issRetido)}` : ""}) · líquido ${brl(nota.valorLiquido)}.`
      : `Sem retenção${nota.simplesNacional ? " (Simples Nacional)" : ""} · líquido ${brl(nota.valorLiquido)}.`;
  } else if (semCampoComSinal) {
    detalheImpostos = [
      "A nota não tem o campo de valor líquido",
      citadas.length ? `e traz imposto retido (${citadas.join(", ")})` : "",
      liqDesc != null ? `· a descrição fala em líquido de ${brl(liqDesc)}` : "",
      sugOk ? `· a leitura assistida sugere líquido de ${brl(sugestao!.valorLiquido)}` : "",
    ].filter(Boolean).join(" ") + `. Não pague pelo bruto (${nota.valor != null ? brl(nota.valor) : "não lido"}): confira na nota e informe o líquido.`;
  } else if (sugOk) {
    detalheImpostos = `Leitura assistida deste layout: ${Number(sugestao!.totalRetencoes) > 0 ? `retido ${brl(sugestao!.totalRetencoes)}` : "sem retenção"} · líquido ${brl(sugestao!.valorLiquido)}. Confira na nota e aceite.`;
  } else {
    detalheImpostos = "Não consegui ler o quadro de impostos deste layout: informar o líquido à mão.";
  }
  itens.push({
    chave: "impostos", rotulo: "Impostos retidos e valor líquido",
    ok: nota.impostosLidos ? true : semCampoComSinal ? false : null, detalhe: detalheImpostos,
  });

  // Alíquotas retidas (regra da Mavi, 14/10/2026): líquido = bruto → optante do Simples, ok.
  // Senão confere PIS 0,65% + COFINS 3% + CSLL 1% (4,65%) e IR 1,5% sobre o bruto.
  // Retenção abaixo de R$ 10 é dispensada por lei, então zero também vale nesse caso.
  const fonte = nota.impostosLidos ? nota : (sugOk ? sugestao : null);
  if (fonte && nota.valor != null) {
    const bruto = Number(nota.valor);
    const ret = Number(fonte.totalRetencoes ?? 0);
    if (ret <= 0.01 && !nota.impostosLidos && citadas.length) {
      // o modelo não viu retenção, mas a nota cita imposto retido: não dá para dizer que é Simples
      itens.push({ chave: "aliquotas", rotulo: "Alíquotas retidas", ok: false, detalhe: `A leitura assistida não achou retenção, mas a nota cita ${citadas.join(", ")}: confira.` });
    } else if (ret <= 0.01) {
      itens.push({ chave: "aliquotas", rotulo: "Alíquotas retidas", ok: true, detalhe: "Líquido igual ao bruto: prestador optante do Simples Nacional." });
    } else {
      const confere = (lido: number, esperado: number) => Math.abs(lido - esperado) <= 0.02 || (esperado < 10 && lido <= 0.01);
      const irEsp = r2(bruto * 0.015), csrfEsp = r2(bruto * 0.0465);
      const ir = Number(fonte.irrf ?? 0), csrf = Number(fonte.contribSociais ?? 0);
      const outros = Number(fonte.inssRetido ?? 0) + Number(fonte.issRetido ?? 0);
      const irOk = confere(ir, irEsp), csrfOk = confere(csrf, csrfEsp);
      const falhas = [
        !irOk && `IR ${brl(ir)} (esperado ${brl(irEsp)}, 1,5%)`,
        !csrfOk && `PIS/COFINS/CSLL ${brl(csrf)} (esperado ${brl(csrfEsp)}, 4,65%)`,
        outros > 0.01 && `retenção de INSS/ISS ${brl(outros)} fora da regra`,
      ].filter(Boolean);
      itens.push({
        chave: "aliquotas", rotulo: "Alíquotas retidas", ok: falhas.length === 0,
        detalhe: falhas.length ? `Diferente do esperado: ${falhas.join("; ")}.` : `IR 1,5% e PIS/COFINS/CSLL 4,65% conferem · líquido esperado ${brl(r2(bruto - irEsp - csrfEsp))}.`,
      });
    }
  }
  return itens;
}

/** Algum item falhou → divergente; algum sem resposta (fora o CNPJ ainda não conhecido) → à mão. */
export function statusDosItens(itens: ItemConferencia[]): StatusConferencia {
  if (itens.some((i) => i.ok === false)) return "divergente";
  if (itens.some((i) => i.ok === null && i.chave !== "prestador")) return "manual";
  return "ok";
}

/**
 * Lançamento feito SEM NF no Conta Azul: a Thais só paga quando a descrição deixa de dizer "SEM NF".
 * Antes a descrição trocava assim que a nota chegava, mesmo sem o líquido lido, e a parcela era paga
 * pelo valor do fechamento (o bruto). Só libera com a nota conferida (ou aceita por alguém) e com o
 * líquido igual ao valor lançado. Devolve o motivo do bloqueio, ou null quando pode liberar.
 */
export type BloqueioSemNf = { codigo: "conferencia" | "sem_liquido" | "valor_diferente"; motivo: string };
export function bloqueioLancamentoSemNf(p: { conferencia: string | null; liquido: number | null; valorLancado: number | null }): BloqueioSemNf | null {
  if (!["ok", "aceita"].includes(String(p.conferencia ?? ""))) {
    return {
      codigo: "conferencia",
      motivo: p.conferencia === "divergente" ? "a nota tem divergência na conferência"
        : p.conferencia === "manual" ? "a conferência da nota precisa ser feita à mão"
        : "a nota ainda não foi conferida",
    };
  }
  if (p.liquido == null) return { codigo: "sem_liquido", motivo: "o valor líquido da nota não foi lido nem informado" };
  if (p.valorLancado == null || Math.abs(p.liquido - p.valorLancado) > 0.01) {
    return { codigo: "valor_diferente", motivo: `o líquido da nota (${brl(p.liquido)}) é diferente do valor lançado (${brl(p.valorLancado)})` };
  }
  return null;
}
