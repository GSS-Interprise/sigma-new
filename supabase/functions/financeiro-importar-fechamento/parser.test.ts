import { describe, expect, it } from "vitest";
import { parseDrEscalaCompleto, parseDrEscalaConsolidado, type Bloco } from "./parser";

// Reunião 22/09 com a GSS: no fechamento mostrado, o Lauro tinha recebido TUDO à vista e
// o Ismael tinha R$ 66.300 a receber, mas o Sigma exibiu R$ 56.700 de total — o à vista do
// Lauro foi descontado duas vezes (já estava fora do "Valor Total" dele na planilha) e
// derrubou o fechamento inteiro. Estes testes prendem a regra: o à vista é uma parcela da
// produção do PRÓPRIO médico, então o a pagar dele nunca fica negativo nem mexe no total
// de outro médico.

const PREAMBULO = [
  ["Emitido em 22/09/2026"],
  ["Relatório Consolidado de Plantões"],
  ["01/09/2026 - 30/09/2026"],
  ["HOSPITAL REGIONAL DO OESTE"],
];
const CABECALHO = ["Profissional", "Qtde de Plantões", "Qtde de Horas (h)", "À Vista", "Coordenação", "Valor Total"];

/** Grid do relatório Consolidado, com as colunas que a equipe acrescenta à mão. */
const consolidado = (linhas: unknown[][]) => [...PREAMBULO, CABECALHO, ...linhas];

// mesma decomposição que o index.ts grava em financeiro_pagamentos e que o trigger
// fin_recalc_pagamento reconstrói: a pagar = produzido − à vista (+ ajustes, depois)
const produzidoDe = (b: Bloco) => b.itens.reduce((s, i) => s + i.valor, 0);
const aVistaDe = (b: Bloco) => b.aVistaValor ?? b.itens.reduce((s, i) => s + (i.aVista ? i.valor : 0), 0);
const aPagarDe = (b: Bloco) => produzidoDe(b) - aVistaDe(b);

const porNome = (blocos: Bloco[], nome: string) => blocos.find((b) => b.nome === nome)!;
const totalDoFechamento = (blocos: Bloco[]) => blocos.reduce((s, b) => s + aPagarDe(b), 0);

describe("consolidado — fechamento do Lauro (à vista) com o Ismael (produção)", () => {
  // como veio na reunião: o médico que recebeu tudo à vista fica com o "Valor Total" vazio
  const totalVazio = consolidado([
    ["Lauro", 6, "48:00", 9600, null, null],
    ["Ismael", 20, "160:00", null, null, 66300],
  ]);
  // variante em que a equipe zera a coluna em vez de deixar em branco
  const totalZero = consolidado([
    ["Lauro", 6, "48:00", 9600, 0, 0],
    ["Ismael", 20, "160:00", 0, 0, 66300],
  ]);
  // variante em que o "Valor Total" fica bruto (o à vista ainda dentro dele)
  const totalBruto = consolidado([
    ["Lauro", 6, "48:00", 9600, 0, 9600],
    ["Ismael", 20, "160:00", 0, 0, 66300],
  ]);

  it.each([
    ["Valor Total em branco", totalVazio],
    ["Valor Total zerado", totalZero],
    ["Valor Total bruto", totalBruto],
  ])("%s: Ismael fica com R$ 66.300 e o total do fechamento é R$ 66.300", (_rotulo, grid) => {
    const { blocos, mes, ano } = parseDrEscalaConsolidado(grid);
    expect(mes).toBe(9);
    expect(ano).toBe(2026);
    expect(blocos).toHaveLength(2);

    expect(aPagarDe(porNome(blocos, "Ismael"))).toBe(66300);
    // o Lauro já recebeu tudo: produção cheia, a pagar zero — nunca negativo
    expect(produzidoDe(porNome(blocos, "Lauro"))).toBe(9600);
    expect(aPagarDe(porNome(blocos, "Lauro"))).toBe(0);
    expect(totalDoFechamento(blocos)).toBe(66300);
  });

  it("nenhum médico entra com a pagar negativo por causa do à vista", () => {
    const { blocos } = parseDrEscalaConsolidado(totalVazio);
    for (const b of blocos) {
      expect(aPagarDe(b)).toBeGreaterThanOrEqual(0);
      expect(produzidoDe(b)).toBeGreaterThanOrEqual(aVistaDe(b));
    }
  });

  it("o à vista do Lauro não muda nada no lançamento do Ismael", () => {
    const comLauro = parseDrEscalaConsolidado(totalVazio).blocos;
    const semLauro = parseDrEscalaConsolidado(consolidado([["Ismael", 20, "160:00", null, null, 66300]])).blocos;
    expect(porNome(comLauro, "Ismael")).toEqual(porNome(semLauro, "Ismael"));
  });

  it("marca como já quitadas as horas de quem recebeu tudo à vista", () => {
    const { blocos } = parseDrEscalaConsolidado(totalVazio);
    const lauro = porNome(blocos, "Lauro");
    expect(lauro.itens.reduce((s, i) => s + i.minutos, 0)).toBe(48 * 60);
    expect(lauro.aVistaMinutos).toBe(48 * 60);
    expect(porNome(blocos, "Ismael").aVistaMinutos).toBe(0);
  });

  it("à vista parcial desconta só a parcela do próprio médico, com a coordenação como ajuste", () => {
    // "Valor Total" da planilha já inclui a coordenação (R$ 1.200 dentro dos R$ 21.200)
    const { blocos } = parseDrEscalaConsolidado(consolidado([["Ismael", 20, "160:00", 5000, 1200, 21200]]));
    const b = blocos[0];
    expect(produzidoDe(b)).toBe(20000);
    expect(aVistaDe(b)).toBe(5000);
    expect(b.acrescimos).toBe(1200);
    // o ajuste da coordenação entra depois, pelo trigger: 15.000 + 1.200
    expect(aPagarDe(b)).toBe(15000);
    expect(b.aVistaMinutos).toBe(Math.round(160 * 60 * (5000 / 20000)));
  });
});

describe("completo — à vista marcado plantão a plantão", () => {
  const completo = [
    ["Emitido em 22/09/2026"],
    ["Relatório Completo"],
    ["01/09/2026 - 30/09/2026"],
    ["HOSPITAL REGIONAL DO OESTE"],
    ["Lauro Silva - 12345/SC", "111.222.333-44"],
    ["Data", "Início Plantão", "Fim Plantão", "Duração (h)", "Setor", "Local", "Valor Hora", "Valor Estimado", "Tipo"],
    ["01/09/2026", "07:00", "19:00", "12:00", "PA", "HRO", 200, 2400, "A VISTA"],
    ["02/09/2026", "07:00", "19:00", "12:00", "PA", "HRO", 200, 2400, "Diurno"],
    ["Total de 2 plantões", "Valor Total Somado: 4800"],
    ["Ismael Souza - 54321/SC", "555.666.777-88"],
    ["Data", "Início Plantão", "Fim Plantão", "Duração (h)", "Setor", "Local", "Valor Hora", "Valor Estimado", "Tipo"],
    ["03/09/2026", "07:00", "19:00", "12:00", "PA", "HRO", 300, 3600, "Diurno"],
    ["Total de 1 plantão", "Valor Total Somado: 3600"],
  ];

  it("abate o à vista só de quem o recebeu", () => {
    const { blocos, divergencias } = parseDrEscalaCompleto(completo);
    expect(divergencias).toEqual([]);
    expect(aPagarDe(porNome(blocos, "Lauro Silva"))).toBe(2400);
    expect(aPagarDe(porNome(blocos, "Ismael Souza"))).toBe(3600);
    expect(totalDoFechamento(blocos)).toBe(6000);
  });
});
