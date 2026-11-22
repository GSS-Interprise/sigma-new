// deno test --node-modules-dir=none curriculo_test.ts  (a partir de supabase/functions/_shared)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { comoLer, foneDoContato, normalizarCurriculo, pareceCurriculo, textoDocx } from "./curriculo.ts";

Deno.test("parece currículo: nome do arquivo ou legenda", () => {
  assertEquals(pareceCurriculo("Vinicius A Magalhaes curriculo 2025.pdf"), true);
  assertEquals(pareceCurriculo("CV - Dra Ana.pdf"), true);
  assertEquals(pareceCurriculo("Currículo Lattes.pdf"), true);
  assertEquals(pareceCurriculo("documento.pdf", "Segue meu CV"), true);
  assertEquals(pareceCurriculo("NFSE 1148.pdf"), false);
  assertEquals(pareceCurriculo("RECIBO GSS.pdf", "segue a nota"), false);
  assertEquals(pareceCurriculo("cvd_relatorio.pdf"), false);
});

Deno.test("como ler: PDF e imagem direto; docx vira texto; o resto não", () => {
  assertEquals(comoLer("application/pdf", "a.pdf"), "inline");
  assertEquals(comoLer("image/jpeg", "foto"), "inline");
  assertEquals(comoLer("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx"), "docx");
  assertEquals(comoLer("application/msword", "a.doc"), "nao_suportado");
  assertEquals(comoLer(null, "cv.PDF"), "inline");
});

Deno.test("texto do docx: parágrafos em linhas, entidades e espaços", () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Dra. Ana &amp; Exemplo</w:t></w:r></w:p><w:p><w:r><w:t>Residência</w:t><w:tab/><w:t>2018</w:t></w:r></w:p><w:p></w:p></w:body></w:document>';
  assertEquals(textoDocx(xml), "Dra. Ana & Exemplo\nResidência 2018");
});

Deno.test("normalizar: tira vazios, garante listas e corta textos", () => {
  const d = normalizarCurriculo({
    nome: "  Dra. Ana  Exemplo ", resumo: "x".repeat(900),
    formacao: [{ curso: "Medicina", instituicao: "UFSC", ano: 2012 }, { curso: "" }, null],
    especialidades: [{ nome: "Radiologia", rqe: "12345" }, { rqe: "1" }],
    experiencias: "não é lista",
  });
  assertEquals(d.nome, "Dra. Ana Exemplo");
  assertEquals(d.resumo!.length, 500);
  assertEquals(d.formacao, [{ curso: "Medicina", instituicao: "UFSC", ano: "2012" }]);
  assertEquals(d.especialidades, [{ nome: "Radiologia", rqe: "12345" }]);
  assertEquals(d.experiencias, []);
  assertEquals(d.residencias, []);
  assertEquals(d.cursos, []);
  assertEquals(normalizarCurriculo(null).formacao, []);
});

Deno.test("telefone do contato: phone ou JID, só dígitos", () => {
  assertEquals(foneDoContato("+55 (47) 99999-0000", null), "+5547999990000");
  assertEquals(foneDoContato(null, "5547999990000@s.whatsapp.net"), "+5547999990000");
  assertEquals(foneDoContato(null, "abc@g.us"), null);
});
