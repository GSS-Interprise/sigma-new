import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { lerJson } from "./robo.ts";

Deno.test("resposta da classificação aceita objeto, JSON em texto e com cerca", () => {
  assertEquals(lerJson({ resultado: "interessado" }).resultado, "interessado");
  assertEquals(lerJson('{"resultado":"objecao"}').resultado, "objecao");
  assertEquals(lerJson('```json\n{"resultado":"indicacao"}\n```').resultado, "indicacao");
});

Deno.test("resposta que não é objeto é recusada", () => {
  assertThrows(() => lerJson("interessado"));
  assertThrows(() => lerJson([1]));
});
