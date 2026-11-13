import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { destinosDaConfig, destinosValidos, foneValido, mostrarFone, normalizarFone, trechoAviso } from "./alertas.ts";

Deno.test("telefone aceito em qualquer formato e guardado com 55", () => {
  assertEquals(normalizarFone("(48) 99999-0000"), "5548999990000");
  assertEquals(normalizarFone("+55 48 3333-4444"), "554833334444");
  assertEquals(normalizarFone("5548999990000"), "5548999990000");
  assert(foneValido("48 99999 0000"));
  assert(!foneValido("123"));
  // EUA digitado sem +: viraria 55 12 02555-0100, um "celular" que não existe.
  assert(!foneValido("1 202 555 0100"));
  assert(!foneValido("(48) 1234-5678")); // fixo começa em 2-5
  assert(!foneValido("(01) 99999-0000")); // DDD não começa em 0
});

Deno.test("mostra o telefone como a equipe lê", () => {
  assertEquals(mostrarFone("5548999990000"), "(48) 99999-0000");
  assertEquals(mostrarFone("554833334444"), "(48) 3333-4444");
});

Deno.test("destinos da campanha: só número válido, sem repetir", () => {
  assertEquals(destinosValidos([
    { nome: "Vinicius", fone: "(47) 99999-1111" },
    { nome: "Repetido", fone: "5547999991111" },
    { nome: "Ruim", fone: "123" },
    null,
  ]), [{ nome: "Vinicius", fone: "5547999991111" }]);
  assertEquals(destinosValidos("não é lista"), []);
});

Deno.test("destinos gerais da config, com e sem nome", () => {
  assertEquals(destinosDaConfig("Vinicius:5547999991111; Maikon: 47 99999-2222\n5548999993333"), [
    { nome: "Vinicius", fone: "5547999991111" },
    { nome: "Maikon", fone: "5547999992222" },
    { nome: "", fone: "5548999993333" },
  ]);
  assertEquals(destinosDaConfig(""), []);
});

Deno.test("trecho do aviso cabe no parâmetro da Meta", () => {
  assertEquals(trechoAviso("Tenho\ninteresse,\n\n    qual o valor?", "x"), "Tenho interesse, qual o valor?");
  assertEquals(trechoAviso("", "respondeu a mensagem"), "respondeu a mensagem");
  assertEquals(trechoAviso("a".repeat(500), "x").length, 180);
});
