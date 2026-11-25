import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { motivoQueda } from "./slaEstacao.ts";

const l = (status: string, motivo: string | null = null) => ({ status, detalhe: { motivo }, lida_em: "2026-11-25T11:00:00Z" });

Deno.test("sem leitura recente: PC/túnel, qualquer unidade", () => {
  assertStringIncludes(motivoQueda("tijucas", null, null, 15), "parou de mandar leituras");
  assertStringIncludes(motivoQueda("tijucas", l("sem_grade", "sessao_expirada"), 40, 15), "parou de mandar leituras");
});

Deno.test("sessão expirada diz qual portal", () => {
  assertStringIncludes(motivoQueda("tijucas", l("sem_grade", "sessao_expirada"), 2, 15), "portal de Tijucas");
  assertStringIncludes(motivoQueda("mobilemed", l("sem_grade", "sessao_expirada"), 2, 15), "portal da Mobilemed");
});

Deno.test("códigos do Vue e da VPN", () => {
  assertStringIncludes(motivoQueda("marieta", l("erro", "pacs_fechado"), 2, 15), "fechado");
  assertStringIncludes(motivoQueda("cepon", l("sem_grade", "fora_da_pasta"), 2, 15), "fora da pasta");
  assertStringIncludes(motivoQueda("cepon", l("sem_grade", "tela_login"), 2, 15), "tela de login");
  assertStringIncludes(motivoQueda("marieta", l("sem_grade", "vpn_desconectada"), 2, 15), "VPN");
});

Deno.test("sem_grade sem código: portal web não fala de PACS/VPN", () => {
  assertEquals(motivoQueda("tijucas", l("sem_grade"), 2, 15), "O portal de Tijucas (Animati) está aberto, mas a fila não veio.");
  assertStringIncludes(motivoQueda("marieta", l("sem_grade"), 2, 15), "PACS");
});

Deno.test("código desconhecido aparece no texto", () => {
  assertEquals(motivoQueda("cepon", l("erro", "novo_codigo"), 2, 15), 'Última leitura com status "erro" (novo_codigo).');
});
