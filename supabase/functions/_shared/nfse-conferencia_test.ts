// Nota pelo bruto paga a mais (Yuri, Santo Antônio do Pinhal, reunião Financeiro GSS de 13/11/2026).
//
// As notas daqui são PDFs SINTÉTICOS montados no próprio teste: não são cópia de nota real. O prestador
// e os valores são fictícios; o único dado real é o CNPJ da GSS no tomador, que é público e é o que o
// parser exige. O layout municipal imita o que a Maria descreveu: impostos destacados nos campos, sem o
// campo "valor líquido", e o líquido escrito só na discriminação dos serviços.
//
// Rodar: deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/_shared/nfse-conferencia_test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { lerNfse, type LeituraAssistida } from "./nfse.ts";
import { bloqueioLancamentoSemNf, type ItemConferencia, itensDaLeitura, statusDosItens } from "./nfse-conferencia.ts";

async function pdfSintetico(linhas: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  linhas.forEach((l, i) => page.drawText(l, { x: 30, y: 800 - i * 14, size: 9, font }));
  return await doc.save();
}

const PRESTADOR = ["Razão Social: PRESTADOR SINTETICO SERVICOS MEDICOS LTDA", "CNPJ: 11.222.333/0001-81"];
const TOMADOR_GSS = ["Razão Social: GESTAO SERVICO SAUDE (TOMADOR)", "CNPJ: 18.670.594/0001-03"];

// DANFSe nacional (layout já aceito), com retenção de IR 1,5% e PIS/COFINS/CSLL 4,65%
const DANFSE_COM_RETENCAO = [
  "DANFSe v1.0 - Documento Auxiliar da NFS-e (SINTÉTICO DE TESTE)",
  "Número da NFS-e 101",
  "EMITENTE DA NFS-e", ...PRESTADOR,
  "TOMADOR DO SERVIÇO", ...TOMADOR_GSS,
  "Descrição do Serviço Plantões médicos de outubro/2026",
  "TRIBUTAÇÃO FEDERAL",
  "IRRF R$ 180,00 Contribuição Previdenciária - Retida - Contribuições Sociais - Retidas R$ 558,00",
  "Simples Nacional na Data de Competência Não optante",
  "VALOR TOTAL DA NFS-E Valor do Serviço R$ 12.000,00",
  "Total das Retenções (ISSQN / Federais) R$ 738,00",
  "Retenção do ISSQN Não Retido ISSQN Apurado R$ 240,00",
  "VALOR LÍQUIDO DA NFS-e R$ 11.262,00",
];

// DANFSe nacional de optante do Simples: sem retenção, líquido igual ao bruto
const DANFSE_SIMPLES = [
  "DANFSe v1.0 - Documento Auxiliar da NFS-e (SINTÉTICO DE TESTE)",
  "Número da NFS-e 102",
  "EMITENTE DA NFS-e", ...PRESTADOR,
  "TOMADOR DO SERVIÇO", ...TOMADOR_GSS,
  "Descrição do Serviço Plantões médicos de outubro/2026",
  "TRIBUTAÇÃO FEDERAL",
  "IRRF - Contribuição Previdenciária - Retida - Contribuições Sociais - Retidas -",
  "Simples Nacional na Data de Competência Optante",
  "VALOR TOTAL DA NFS-E Valor do Serviço R$ 5.000,00",
  "Total das Retenções (ISSQN / Federais) -",
  "Retenção do ISSQN Não Retido ISSQN Apurado -",
  "VALOR LÍQUIDO DA NFS-e R$ 5.000,00",
];

// Nota da prefeitura no formato do caso relatado: impostos nos campos, líquido só na discriminação
const MUNICIPAL_SEM_LIQUIDO = [
  "PREFEITURA MUNICIPAL (LAYOUT SINTÉTICO DE TESTE)",
  "NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e",
  "Número da NFS-e 000123",
  "PRESTADOR DE SERVIÇOS", ...PRESTADOR,
  "TOMADOR DE SERVIÇOS", ...TOMADOR_GSS,
  "DISCRIMINAÇÃO DOS SERVIÇOS",
  "Plantões médicos referentes a outubro/2026. Retenções: IR 1,5% R$ 180,00; PIS 0,65% R$ 78,00;",
  "COFINS 3% R$ 360,00; CSLL 1% R$ 120,00. Valor líquido a receber: R$ 11.262,00",
  "VALOR TOTAL DA NOTA = R$ 12.000,00",
  "IRRF (R$) 180,00 PIS (R$) 78,00 COFINS (R$) 360,00 CSLL (R$) 120,00 INSS (R$) 0,00",
  "Base de Cálculo 12.000,00 Alíquota 2,00% Valor do ISS 240,00",
];

// Nota da prefeitura sem quadro de impostos nem líquido em lugar nenhum
const MUNICIPAL_SEM_NADA = [
  "PREFEITURA MUNICIPAL (LAYOUT SINTÉTICO DE TESTE)",
  "NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e",
  "Número da NFS-e 000124",
  "PRESTADOR DE SERVIÇOS", ...PRESTADOR,
  "TOMADOR DE SERVIÇOS", ...TOMADOR_GSS,
  "DISCRIMINAÇÃO DOS SERVIÇOS",
  "Plantões médicos referentes a outubro/2026.",
  "VALOR TOTAL DA NOTA = R$ 12.000,00",
];

const item = (itens: ItemConferencia[], chave: string) => itens.find((i) => i.chave === chave)!;

Deno.test("(a) DANFSe com líquido identificado: conferência ok com o líquido correto", async () => {
  const nota = await lerNfse(await pdfSintetico(DANFSE_COM_RETENCAO));
  assertEquals(nota.tomadorGss, true);
  assertEquals(nota.valor, 12000);
  assertEquals(nota.valorLiquido, 11262);
  assertEquals(nota.totalRetencoes, 738);
  assertEquals(nota.impostosLidos, true);
  const itens = itensDaLeitura(nota, 12000, null);
  assertEquals(item(itens, "impostos").ok, true);
  assertEquals(item(itens, "aliquotas").ok, true);
  assertEquals(statusDosItens(itens), "ok");
  // lançado no Conta Azul pelo líquido: libera; lançado SEM NF pelo bruto: não libera sozinho
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "ok", liquido: nota.valorLiquido, valorLancado: 11262 }), null);
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "ok", liquido: nota.valorLiquido, valorLancado: 12000 })?.codigo, "valor_diferente");
});

Deno.test("(b) nota municipal sem campo de líquido: divergência, nunca conferida pelo bruto", async () => {
  const nota = await lerNfse(await pdfSintetico(MUNICIPAL_SEM_LIQUIDO));
  assertEquals(nota.ehNfse, true);
  assertEquals(nota.tomadorGss, true);
  assertEquals(nota.valor, 12000);          // bruto lido
  assertEquals(nota.valorLiquido, null);    // líquido NÃO é inventado
  assertEquals(nota.impostosLidos, false);
  assertEquals(nota.retencoesCitadas, ["IRRF", "PIS", "COFINS", "CSLL"]);
  assertEquals(nota.liquidoNaDescricao, 11262);
  assertMatch(nota.discriminacao ?? "", /Valor líquido a receber/);

  const itens = itensDaLeitura(nota, 12000, null);
  const imp = item(itens, "impostos");
  assertEquals(imp.ok, false);
  assertMatch(imp.detalhe, /não tem o campo de valor líquido/);
  assertMatch(imp.detalhe, /IRRF, PIS, COFINS, CSLL/);
  assertMatch(imp.detalhe, /Não pague pelo bruto/);
  assertEquals(statusDosItens(itens), "divergente");

  // sem conferência ok/aceita, o lançamento SEM NF continua bloqueado
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "divergente", liquido: null, valorLancado: 12000 })?.codigo, "conferencia");
  // aceitar sem informar o líquido também não libera
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "aceita", liquido: null, valorLancado: 12000 })?.codigo, "sem_liquido");
  // aceitar informando o líquido, com o lançado ainda no bruto: pede o ajuste no Conta Azul
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "aceita", liquido: 11262, valorLancado: 12000 })?.codigo, "valor_diferente");
});

Deno.test("(b) a leitura assistida não tira a divergência da nota sem campo de líquido", async () => {
  const nota = await lerNfse(await pdfSintetico(MUNICIPAL_SEM_LIQUIDO));
  const fechou: LeituraAssistida = { valor: 12000, totalRetencoes: 738, valorLiquido: 11262, irrf: 180, contribSociais: 558, inssRetido: 0, issRetido: 0, numero: "123" };
  const comSugestao = itensDaLeitura(nota, 12000, fechou);
  assertEquals(statusDosItens(comSugestao), "divergente");
  assertMatch(item(comSugestao, "impostos").detalhe, /leitura assistida sugere líquido de R\$\s11\.262,00/);

  // o modelo "não viu" retenção (líquido = bruto): antes isso passava como Simples Nacional
  const semRetencao: LeituraAssistida = { valor: 12000, totalRetencoes: 0, valorLiquido: 12000, irrf: 0, contribSociais: 0, inssRetido: 0, issRetido: 0, numero: "123" };
  const errada = itensDaLeitura(nota, 12000, semRetencao);
  assertEquals(item(errada, "aliquotas").ok, false);
  assertEquals(statusDosItens(errada), "divergente");
});

Deno.test("(b) nota sem quadro de impostos nem líquido: conferência à mão, não ok", async () => {
  const nota = await lerNfse(await pdfSintetico(MUNICIPAL_SEM_NADA));
  assertEquals(nota.valor, 12000);
  assertEquals(nota.impostosLidos, false);
  assertEquals(nota.retencoesCitadas, []);
  assertEquals(nota.liquidoNaDescricao, null);
  const itens = itensDaLeitura(nota, 12000, null);
  assertEquals(item(itens, "impostos").ok, null);
  assertEquals(statusDosItens(itens), "manual");
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "manual", liquido: null, valorLancado: 12000 })?.codigo, "conferencia");
});

Deno.test("(c) DANFSe do Simples (layout já aceito) segue automático", async () => {
  const nota = await lerNfse(await pdfSintetico(DANFSE_SIMPLES));
  assertEquals(nota.valor, 5000);
  assertEquals(nota.valorLiquido, 5000);
  assertEquals(nota.totalRetencoes, 0);
  assertEquals(nota.impostosLidos, true);
  assertEquals(nota.simplesNacional, true);
  const itens = itensDaLeitura(nota, 5000, null);
  assertEquals(statusDosItens(itens), "ok");
  assertEquals(item(itens, "aliquotas").detalhe, "Líquido igual ao bruto: prestador optante do Simples Nacional.");
  // lançado SEM NF pelo fechamento (= líquido): o Sigma tira o SEM NF sozinho, como antes
  assertEquals(bloqueioLancamentoSemNf({ conferencia: "ok", liquido: 5000, valorLancado: 5000 }), null);
});

Deno.test("valor da nota diferente do fechamento continua divergência", async () => {
  const nota = await lerNfse(await pdfSintetico(DANFSE_COM_RETENCAO));
  const itens = itensDaLeitura(nota, 11000, null);
  assertEquals(item(itens, "valor").ok, false);
  assertEquals(statusDosItens(itens), "divergente");
});

Deno.test("\"Não optante pelo Simples Nacional\" escrito por extenso não vira optante", async () => {
  const nota = await lerNfse(await pdfSintetico([...MUNICIPAL_SEM_NADA, "Prestador NÃO optante pelo Simples Nacional"]));
  assertEquals(nota.simplesNacional, false);
  assert(nota.legivel);
});

// Prefeitura de São Paulo (layout do Yuri, set/26): retenções em colunas, rótulos antes dos valores, e
// o líquido só na discriminação. Valores fictícios.
const SP_COLUNAS = [
  "PREFEITURA DO MUNICÍPIO DE SÃO PAULO NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e (SINTÉTICO DE TESTE)",
  "Número da Nota Data e Hora de Emissão Código de Verificação 2026x 00000090 27/10/2026 08:55:13 ABCD-1234",
  "PRESTADOR DE SERVIÇOS", ...PRESTADOR,
  "TOMADOR DE SERVIÇOS", ...TOMADOR_GSS,
  "DISCRIMINAÇÃO DE SERVIÇOS Consultas de setembro/2026. Valor Bruto: R$ 10.000,00 VALOR LIQUIDO: R$ 9.385,00",
  "VALOR TOTAL DO SERVIÇO = R$ 10.000,00",
  "Contribuição Previdenciária - Retida (R$) IRRF (R$) COFINS (R$) PIS/PASEP (R$) IPI (R$) 0,00 150,00 300,00 65,00 0,00",
  "Contribuições Sociais - Retidas (R$) Descrição Contribuições Sociais - Retidas 465,00 3 - PIS/COFINS/CSLL Retidos.",
];

Deno.test("Prefeitura de SP: soma as retenções das colunas e mostra que fecha, mas não confere sozinha", async () => {
  const nota = await lerNfse(await pdfSintetico(SP_COLUNAS));
  assertEquals(nota.impostosLidos, false);
  assertEquals(nota.valorLiquido, null);
  assertEquals(nota.retencoesCampos, 615);
  assertEquals(nota.liquidoNaDescricao, 9385);
  const itens = itensDaLeitura(nota, 10000, null);
  assertEquals(statusDosItens(itens), "divergente");
  assertMatch(itens.find((i) => i.chave === "impostos")!.detalhe, /igual ao líquido da descrição/);
});

Deno.test("líquido e retenções lidos que não fecham com o bruto: divergência", () => {
  const nota = {
    legivel: true, ehNfse: true, tomadorGss: true, prestadorCnpj: null, prestadorNome: null, prestadorEmail: null,
    valor: 10000, chave: null, descricao: null, numero: "1", competencia: null, emissao: null, tomadorCnpj: null, tomadorNome: null,
    irrf: 150, contribSociais: 465, inssRetido: 0, issRetido: 0, totalRetencoes: 615, valorLiquido: 10000,
    simplesNacional: null, impostosLidos: false,
  };
  const itens = itensDaLeitura(nota, 10000, null);
  const imp = itens.find((i) => i.chave === "impostos")!;
  assertEquals(imp.ok, false);
  assertMatch(imp.detalhe, /não fecha/);
});
