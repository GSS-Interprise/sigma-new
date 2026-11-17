import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { briefingPublico, regrasDaCampanha, sigiloAtivo } from "./sigilo.ts";

const base = {
  nome_servico: "Pediatria", hospital: "Hospital São Lucas", cidade: "Joinville - SC", estrutura: "Hospital São Lucas, 200 leitos",
  locais: [{ hospital: "Hospital São Lucas", cidade: "Joinville - SC" }], cidade_info: "Joinville tem...", link_video: "https://x",
};

Deno.test("sem sigilo: briefing volta igual e sem regras", () => {
  assertEquals(briefingPublico(base), base);
  assertEquals(regrasDaCampanha(base, "Bruna"), "");
  assert(!sigiloAtivo(base));
});

Deno.test("sigilo de hospital e cidade: nada do local chega na IA", () => {
  const b = { ...base, sigilo_local: { hospital: true, cidade: true, como_falar: "região Sul" } };
  const p = briefingPublico(b);
  const texto = JSON.stringify({ ...p, sigilo_local: undefined });
  assert(!texto.includes("São Lucas"), "hospital vazou");
  assert(!texto.includes("Joinville"), "cidade vazou");
  assertEquals(p.cidade, "região Sul");
  assertEquals(p.locais, []);
  assertEquals(b.hospital, "Hospital São Lucas", "o original não pode mudar");
});

Deno.test("só o hospital em sigilo: cidade continua", () => {
  const p = briefingPublico({ ...base, sigilo_local: { hospital: true, cidade: false } });
  assertEquals(p.hospital, "");
  assertEquals(p.cidade, "Joinville - SC");
});

Deno.test("regras: cita a região, o handoff e a instrução extra", () => {
  const r = regrasDaCampanha({ sigilo_local: { hospital: true, cidade: true, como_falar: "região Sul" }, instrucoes_especiais: "Não fale em urgência." }, "Bruna");
  assert(r.includes("região Sul"));
  assert(r.includes("Bruna"));
  assert(r.includes("o hospital nem a cidade"));
  assert(r.includes("Não fale em urgência."));
});

Deno.test("só instrução extra, sem sigilo", () => {
  const r = regrasDaCampanha({ instrucoes_especiais: "Fale que o plantão é só aos fins de semana." }, "Bruna");
  assert(r.startsWith("<regras_da_campanha>"));
  assert(!r.includes("NÃO cite"));
});

import { normalizarParticularidades } from "./sigilo.ts";

Deno.test("normalizar: pedido do Maikon (região Sul) vira sigilo completo", () => {
  const p = normalizarParticularidades({ entendi: "Não cito hospital nem cidade.", ocultar_cidade: true, como_falar_local: "região Sul" });
  assertEquals(p.ocultar_hospital, true);
  assertEquals(p.ocultar_cidade, true);
  assertEquals(p.como_falar_local, "região Sul");
  assertEquals(p.ia_informa_valor, null);
});

Deno.test("normalizar: cidade oculta sem como falar cai no genérico; lixo vira null", () => {
  const p = normalizarParticularidades({ ocultar_cidade: true, ia_informa_valor: "sim", instrucoes_ia: "  ", extra: 1 });
  assertEquals(p.como_falar_local, "região da vaga");
  assertEquals(p.ia_informa_valor, null);
  assertEquals(p.instrucoes_ia, null);
  assert(p.entendi.length > 0);
});
