import { assertEquals } from "jsr:@std/assert@1";
import { chaveClassificacao, entradaClassificacao, linhaClassificacao } from "./classificacao.ts";

const c = { campanha_lead_id: "cl1", lead_id: "l1", campanha_id: "c1", especialidade_id: "e1", ultima_do_medico: "2026-11-27T10:00:00Z", conversa: "oi" };

Deno.test("linha limpa valor fora da lista e objeção sem motivo", () => {
  const l = linhaClassificacao({ resultado: "objecao", objecao: "xyz", uf_medico: "sc", valor_pedido: "1500", confianca: 3 }, c, "m");
  assertEquals([l.resultado, l.objecao, l.uf_medico, l.valor_pedido, l.confianca, l.modelo], ["objecao", "outro", "SC", 1500, 1, "m"]);
});

Deno.test("resultado inválido vira sem_interesse e objeção some", () => {
  const l = linhaClassificacao({ resultado: "talvez", objecao: "valor" }, c, "m");
  assertEquals([l.resultado, l.objecao], ["sem_interesse", null]);
});

Deno.test("chave muda com fala nova e separa Zenvia", () => {
  assertEquals(chaveClassificacao(c), "conv:cl1:2026-11-27T10:00:00Z");
  assertEquals(chaveClassificacao({ ...c, campanha_lead_id: null, zenvia_telefone: "5548" }), "conv:zenvia:5548:2026-11-27T10:00:00Z");
});

Deno.test("entrada leva a conversa como dado e a referência da linha", () => {
  const e = entradaClassificacao(c);
  assertEquals([e.conversa_nao_confiavel, e.ref.campanha_lead_id, e.ref.ultima_do_medico], ["oi", "cl1", c.ultima_do_medico]);
});
