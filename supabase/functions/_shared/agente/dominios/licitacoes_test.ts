import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acharLicitacoes, licitacoes, linhaLicitacao, reais } from "./licitacoes.ts";
import { validarRegistro } from "../registro.ts";

const l = (titulo: string, numero: string | null, orgao: string | null, codigo: string | null = null) =>
  ({ titulo, numero_edital: numero, licitacao_codigo: codigo, orgao });
const lista = [
  l("Contratação de médicos plantonistas para UPA", "PE 45/2026", "Prefeitura de Gaspar"),
  l("Serviços de radiologia com laudo à distância", "PE 12/2026", "Hospital Regional do Oeste"),
  l("Médicos para UTI adulto", "45/2026", "Prefeitura de Itajaí"),
];

Deno.test("busca: número exato do edital ganha de trecho do título", () => {
  assertEquals(acharLicitacoes(lista, "PE 45/2026").map((x) => x.orgao), ["Prefeitura de Gaspar"]);
});

Deno.test("busca: todas as palavras, sem acento e sem caixa", () => {
  assertEquals(acharLicitacoes(lista, "radiologia oeste").length, 1);
  assertEquals(acharLicitacoes(lista, "MEDICOS").length, 2);
  assertEquals(acharLicitacoes(lista, "itajai uti").map((x) => x.numero_edital), ["45/2026"]);
  assertEquals(acharLicitacoes(lista, "  "), []);
});

Deno.test("linha: formato fixo, valor em reais e sem data quando não há disputa", () => {
  const base = { id: "1", titulo: "Médicos  para UPA", orgao: "Prefeitura de Gaspar", municipio_uf: "Gaspar/SC", valor_estimado: 1250000,
    data_disputa: null, coluna: "Captação de edital", empresa: "GSS", responsavel: "Sarah" };
  assertEquals(linhaLicitacao(base),
    "- **Médicos para UPA**: sem data de disputa · Prefeitura de Gaspar · Gaspar/SC · R$ 1.250.000 · Captação de edital · responsável Sarah");
  assertEquals(reais(null), "valor não informado");
  assertEquals(reais(0), "valor não informado");
});

Deno.test("domínio passa no contrato do registro", () => {
  validarRegistro([licitacoes]);
  assertEquals(licitacoes.ferramentas.every((f) => f.nome.startsWith("licitacoes_")), true);
});
