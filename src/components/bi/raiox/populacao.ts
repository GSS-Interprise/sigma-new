// População residente por UF, Censo 2022 do IBGE (agregado 4709, variável 93), para o "por 100 mil habitantes"
// do bloco O mercado. Fonte: servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93.
// O CFM só traz a UF do registro, então a comparação é Brasil x UF (sem cidade nem raio).
export const POPULACAO_BRASIL = 203_080_756;

export const POPULACAO_UF: Record<string, number> = {
  AC: 830_018, AL: 3_127_683, AM: 3_941_613, AP: 733_759, BA: 14_141_626, CE: 8_794_957, DF: 2_817_381,
  ES: 3_833_712, GO: 7_056_495, MA: 6_776_699, MG: 20_539_989, MS: 2_757_013, MT: 3_658_649, PA: 8_120_131,
  PB: 3_974_687, PE: 9_058_931, PI: 3_271_199, PR: 11_444_380, RJ: 16_055_174, RN: 3_302_729, RO: 1_581_196,
  RR: 636_707, RS: 10_882_965, SC: 7_610_361, SE: 2_210_004, SP: 44_411_238, TO: 1_511_460,
};

export const NOME_UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
  MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

export const por100mil = (medicos: number, populacao: number) => (populacao > 0 ? (medicos / populacao) * 100_000 : 0);
