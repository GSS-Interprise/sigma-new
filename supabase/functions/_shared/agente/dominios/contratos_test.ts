import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acharContratos, acharItens, contratos, expandirConsulta, linhaContrato, pendente, reais, situacao } from "./contratos.ts";
import { validarRegistro } from "../registro.ts";

const hoje = "2026-11-22";

Deno.test("situação: mesma regra dos cartões da tela (término hoje já é vencido)", () => {
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: "2026-11-22" }, hoje), "vencido");
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: "2026-11-23" }, hoje), "a_vencer");
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: "2026-12-22" }, hoje), "a_vencer");
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: "2026-12-23" }, hoje), null);
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: "2027-01-10" }, hoje, 60), "a_vencer");
  assertEquals(situacao({ status_contrato: "Inativo", fim_efetivo: "2020-01-01" }, hoje), null);
  assertEquals(situacao({ status_contrato: "Ativo", fim_efetivo: null }, hoje), null);
});

Deno.test("pendência: status Pendente/Aguardando ou assinatura pendente", () => {
  assertEquals(pendente({ status_contrato: "Ativo", assinado: "Pendente" }), true);
  assertEquals(pendente({ status_contrato: "Aguardando", assinado: "Sim" }), true);
  assertEquals(pendente({ status_contrato: "Ativo", assinado: "Sim" }), false);
});

const c = (codigo_interno: number | null, cliente: string, objeto: string | null, especialidade: string | null = null, codigo_contrato: string | null = null) =>
  ({ codigo_interno, cliente, objeto, especialidade, codigo_contrato });
const lista = [
  c(12, "Hospital Regional do Oeste", "Plantões de UTI adulto", "Medicina Intensiva", "CT 045/2025"),
  c(120, "Prefeitura de Gaspar", "Laudos de raio-X a distância", "Radiologia"),
  c(7, "Hospital Santa Catarina", "Ginecologia e obstetrícia"),
];

Deno.test("busca: número interno exato, com ou sem nº, não casa com 120", () => {
  assertEquals(acharContratos(lista, "12").map((x) => x.cliente), ["Hospital Regional do Oeste"]);
  assertEquals(acharContratos(lista, "nº 12").length, 1);
  assertEquals(acharContratos(lista, "contrato 120").map((x) => x.cliente), ["Prefeitura de Gaspar"]);
});

Deno.test("busca: cliente, objeto e especialidade sem acento; código do contrato", () => {
  assertEquals(acharContratos(lista, "gaspar").length, 1);
  assertEquals(acharContratos(lista, "obstetricia").length, 1);
  assertEquals(acharContratos(lista, "hospital").length, 2);
  assertEquals(acharContratos(lista, "CT 045/2025").map((x) => x.codigo_interno), [12]);
  assertEquals(acharContratos(lista, "  "), []);
});

Deno.test("itens: todas as palavras, sem acento e sem caixa", () => {
  const is = [{ item: "Exame de Ultrassonografia Doppler", cliente: "A" }, { item: "Plantão UTI NEO 24hs", cliente: "B" }, { item: "Plantão Clínica Médica", cliente: "C" }];
  assertEquals(acharItens(is, "ultrassonografia").length, 1);
  assertEquals(acharItens(is, "plantao uti").map((x) => x.cliente), ["B"]);
  assertEquals(acharItens(is, "PLANTÃO").length, 2);
});

Deno.test("linha e valores: formato fixo, centavos só no unitário", () => {
  assertEquals(linhaContrato({ id: "1", codigo_interno: 12, codigo_contrato: null, cliente: "Hospital  X", uf: "SC", status_contrato: "Ativo", assinado: "Sim",
    objeto: null, especialidade: "Radiologia", valor_estimado: 1250000, data_inicio: "2025-01-01", fim_efetivo: "2026-12-31", tem_anexo: true, itens: 2, aditivos: 1 }),
    "- **nº 12 · Hospital X**: término qui 31/12/2026 (com aditivo) · Radiologia · SC · R$ 1.250.000");
  assertEquals(reais(7.31, true), "R$ 7,31");
  assertEquals(reais(null), "valor não informado");
});

Deno.test("domínio passa no contrato do registro", () => {
  validarRegistro([contratos]);
  assertEquals(contratos.ferramentas.every((f) => f.nome.startsWith("contratos_")), true);
});

Deno.test("cláusulas: a pergunta do Maikon ganha os termos do contrato (cobrança direta ao paciente)", () => {
  const q = expandirConsulta("Braço do Norte: o particular no pronto-socorro é nosso ou do hospital?");
  assertEquals(q.includes("cobrança direta paciente"), true);
  assertEquals(expandirConsulta("seguro responsabilidade civil"), "seguro responsabilidade civil");
});
