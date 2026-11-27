import { assertEquals } from "jsr:@std/assert@1";
import { local, paginasDoOcr, trechos } from "./contratos_texto.ts";

Deno.test("OCR em páginas pelo marcador", () => {
  assertEquals(paginasDoOcr("=== PÁGINA 1 ===\nA\n=== PÁGINA 2 ===\nB"), ["A", "B"]);
  assertEquals(paginasDoOcr("sem marcador"), ["sem marcador"]);
});

Deno.test("trecho guarda a página onde começa", () => {
  const t = trechos(["a".repeat(1000), "b".repeat(1000)]);
  assertEquals(t.map((x) => x.pagina), [1, 2]);
});

Deno.test("local acha o bucket pelo caminho", () => {
  assertEquals(local("editais-pdfs/x.pdf"), { bucket: "editais-pdfs", key: "x.pdf" });
  assertEquals(local("0f8b2c1e-1111-2222-3333-444455556666/x.pdf").bucket, "licitacoes-anexos");
});
