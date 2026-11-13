import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  eventoDoMedico, handleInstagram, idsDeMembro, identificadorLinkedin, janelaAberta, limiteDiaLinkedin, mensagemDaEmpresa,
  podeConvidarSozinho, primeiroNome, textoConvite,
} from "./redes.ts";

const andre = { nome: "ANDRE LUIS CANGUSSU", especialidade: "&ANESTESIOLOGIA - RQE Nº: 63668& MEDICINA DE FAMÍLIA", cidade_vaga: "São Miguel do Oeste" };

Deno.test("convite do LinkedIn usa o primeiro nome, a especialidade curta e a cidade da vaga", () => {
  assertEquals(
    textoConvite(andre, "linkedin"),
    "Olá, Dr(a). Andre! Sou o Dr. Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. "
      + "Temos plantões de anestesiologia em São Miguel do Oeste e gostaria de me conectar para te passar os detalhes. Faz sentido para você?",
  );
});

Deno.test("convite do LinkedIn nunca passa de 300 caracteres (limite do LinkedIn)", () => {
  const longo = { ...andre, especialidade: "x".repeat(400), cidade_vaga: "y".repeat(200) };
  const t = textoConvite(longo, "linkedin");
  assertEquals(t.length, 300);
  assert(t.endsWith("..."));
});

Deno.test("sem especialidade nem cidade o texto continua de pé (cai em Santa Catarina)", () => {
  const t = textoConvite({ nome: "maria", especialidade: null, cidade_vaga: null }, "instagram");
  assertEquals(t, "Oi, Dr(a). Maria! Aqui é o Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. Estamos com plantões em Santa Catarina. Posso te passar os detalhes por aqui?");
});

Deno.test("primeiro nome em caixa de nome próprio", () => {
  assertEquals(primeiroNome("  JOÃO pedro "), "João");
  assertEquals(primeiroNome(""), "");
});

Deno.test("rampa do motor: 5 por dia na 1ª semana, +3 por semana, até o teto", () => {
  const ligado = "2026-11-01T00:00:00Z";
  assertEquals(limiteDiaLinkedin(ligado, 20, new Date("2026-11-03T12:00:00Z")), 5);
  assertEquals(limiteDiaLinkedin(ligado, 20, new Date("2026-11-09T12:00:00Z")), 8);
  assertEquals(limiteDiaLinkedin(ligado, 20, new Date("2026-11-23T12:00:00Z")), 14);
  assertEquals(limiteDiaLinkedin(ligado, 20, new Date("2027-02-01T12:00:00Z")), 20);
  assertEquals(limiteDiaLinkedin(ligado, 12, new Date("2027-02-01T12:00:00Z")), 12);
  assertEquals(limiteDiaLinkedin(null, null), 5);
});

Deno.test("rampa não fica negativa se o relógio estiver antes da data de início", () => {
  assertEquals(limiteDiaLinkedin("2026-12-01T00:00:00Z", 20, new Date("2026-11-01T00:00:00Z")), 5);
});

Deno.test("identificador do perfil do LinkedIn sai da URL em qualquer forma", () => {
  assertEquals(identificadorLinkedin("https://www.linkedin.com/in/andre-cangussu-123/"), "andre-cangussu-123");
  assertEquals(identificadorLinkedin("https://br.linkedin.com/in/fulano?trk=x"), "fulano");
  assertEquals(identificadorLinkedin("https://www.linkedin.com/company/gss"), null);
  assertEquals(identificadorLinkedin(null), null);
});

Deno.test("motor só convida perfil à mão ou com confiança de 85 ou mais", () => {
  assert(podeConvidarSozinho(null));
  assert(podeConvidarSozinho(85));
  assert(!podeConvidarSozinho(84));
});

Deno.test("ids de membro saem do evento sem repetir", () => {
  const ev = JSON.stringify({ a: "ACoAAB1234567890xyz", b: ["ACoAAB1234567890xyz", "ACoAAC0987654321abc"], c: "ACo" });
  assertEquals(idsDeMembro(ev), ["ACoAAB1234567890xyz", "ACoAAC0987654321abc"]);
});

Deno.test("aceite conta como resposta; a nossa nota (primeira mensagem do chat) não", () => {
  const id = "ACoAAB1234567890xyz";
  assert(eventoDoMedico("relation.new", "{}", id));
  assert(eventoDoMedico("message.new", JSON.stringify({ sender_id: id }), id));
  assert(eventoDoMedico("message.new", JSON.stringify({ sender: { id } }), id));
  assert(!eventoDoMedico("message.new", JSON.stringify({ sender_id: "ACoNOSSACONTA12345", attendees: [id] }), id));
});

Deno.test("@ do Instagram comparado sem arroba e sem caixa", () => {
  assertEquals(handleInstagram(" @@Dra.Aimee "), "dra.aimee");
  assertEquals(handleInstagram(null), "");
});

Deno.test("mensagem da empresa reconhecida pelos três formatos do Zernio", () => {
  assert(mensagemDaEmpresa({ fromMe: true }, "acc"));
  assert(mensagemDaEmpresa({ direction: "outgoing" }, "acc"));
  assert(mensagemDaEmpresa({ senderId: "acc" }, "acc"));
  assert(!mensagemDaEmpresa({ direction: "incoming", senderId: "medico" }, "acc"));
});

Deno.test("janela de 24 h da Meta", () => {
  const agora = new Date("2026-11-13T12:00:00Z").getTime();
  assert(janelaAberta("2026-11-12T12:00:01Z", agora));
  assert(!janelaAberta("2026-11-12T11:59:00Z", agora));
  assert(!janelaAberta(null, agora));
});
