import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  escolhaDoModelo, janelaAberta, lerUsosLiberados, limparSugestao, oportunidadeDoBriefing, promptModelo, promptTexto,
  transcricao, usoDoNumero,
} from "./logica.ts";

const AGORA = Date.parse("2026-11-25T15:00:00Z");
const horasAtras = (h: number) => new Date(AGORA - h * 3600_000).toISOString();

Deno.test("janela: aberta pelo expires_at da conversa", () => {
  assert(janelaAberta(new Date(AGORA + 60_000).toISOString(), null, AGORA));
});

Deno.test("janela: expires_at vencido, mas o médico escreveu há menos de 24 h (mesma recuperação do envio)", () => {
  assert(janelaAberta(horasAtras(1), horasAtras(23), AGORA));
});

Deno.test("janela: fechada depois de 24 h e quando o médico nunca escreveu", () => {
  assertEquals(janelaAberta(null, horasAtras(25), AGORA), false);
  assertEquals(janelaAberta(null, null, AGORA), false);
});

Deno.test("portão LGPD: padrão é só prospecção; valor ilegível não libera nada além do padrão", () => {
  assertEquals(lerUsosLiberados(null), ["prospeccao"]);
  assertEquals(lerUsosLiberados("isso não é json"), ["prospeccao"]);
  assertEquals(lerUsosLiberados('{"a":1}'), ["prospeccao"]);
  assertEquals(lerUsosLiberados('["prospeccao","escalas"]'), ["prospeccao", "escalas"]);
  assertEquals(lerUsosLiberados("[]"), []);
});

Deno.test("número sem tipo conta como prospecção (igual à RPC conversas_numeros)", () => {
  assertEquals(usoDoNumero(null), "prospeccao");
  assertEquals(usoDoNumero(""), "prospeccao");
  assertEquals(usoDoNumero("financeiro"), "financeiro");
});

Deno.test("transcrição: ordem dada, quem falou, hora de Brasília e mídia como marcador", () => {
  const t = transcricao([
    { from_me: true, message_text: "Posso enviar os detalhes?", message_type: "text", media_caption: null, sent_at: "2026-11-24T12:00:00Z" },
    { from_me: false, message_text: null, message_type: "audio", media_caption: null, sent_at: "2026-11-24T12:05:00Z" },
    { from_me: false, message_text: null, message_type: "image", media_caption: "meu CRM", sent_at: "2026-11-24T12:06:00Z" },
  ]);
  const linhas = t.split("\n");
  assertEquals(linhas[0], "[24/11 09:00] GSS: Posso enviar os detalhes?");
  assertEquals(linhas[1], "[24/11 09:05] Contato: [áudio]");
  assertEquals(linhas[2], "[24/11 09:06] Contato: [imagem] meu CRM");
});

Deno.test("prompt de texto: leva contato, campanha, regras de sigilo e a conversa; proíbe inventar", () => {
  const p = promptTexto({
    uso: "prospeccao", remetente: "Danilo",
    contato: { nome: "Ana Souza", especialidade: "Anestesiologia", cidade: "Chapecó", uf: "SC" },
    campanha: { nome: "Anestesio Chapecó", oportunidade: ["Cidade: Chapecó"], regras: "<regras_da_campanha>x</regras_da_campanha>" },
  }, "[24/11 09:00] Contato: qual o valor?");
  assertStringIncludes(p.sistema, "NÃO invente fato");
  assertStringIncludes(p.pedido, "Especialidade no cadastro: Anestesiologia");
  assertStringIncludes(p.pedido, "Cidade no cadastro: Chapecó/SC");
  assertStringIncludes(p.pedido, '<campanha nome="Anestesio Chapecó">');
  assertStringIncludes(p.pedido, "<regras_da_campanha>");
  assertStringIncludes(p.pedido, "Quem vai enviar: Danilo");
  assertStringIncludes(p.pedido, "qual o valor?");
});

Deno.test("prompt de texto: sem cadastro nem campanha não cria blocos vazios", () => {
  const p = promptTexto({ uso: "prospeccao", remetente: null, contato: null, campanha: null }, "[24/11 09:00] Contato: oi");
  assertEquals(p.pedido.includes("<contato>"), false);
  assertEquals(p.pedido.includes("<campanha"), false);
  assertEquals(p.pedido.includes("<remetente>"), false);
});

Deno.test("prompt de modelo: lista os ids aprovados", () => {
  const p = promptModelo({ uso: "prospeccao", remetente: null, contato: null, campanha: null }, "", [
    { template_id: "t1", friendly_name: "retomada", body: "Oi {{1}}, tudo bem?" },
  ]);
  assertStringIncludes(p.pedido, "id: t1 | nome: retomada");
  assertStringIncludes(p.pedido, "(a conversa ainda não tem mensagens)");
});

Deno.test("limpar sugestão: tira aspas, rótulo, markdown e cerca de código", () => {
  assertEquals(limparSugestao('"Bom dia, Dr. Posso te ligar?"'), "Bom dia, Dr. Posso te ligar?");
  assertEquals(limparSugestao("Resposta: **Claro**, Dra."), "Claro, Dra.");
  assertEquals(limparSugestao("```\nOi\n```"), "Oi");
  assertEquals(limparSugestao("a\n\n\n\nb"), "a\n\nb");
});

Deno.test("escolha do modelo: id válido passa; id inventado ou JSON quebrado cai no primeiro da lista", () => {
  const ms = [
    { template_id: "a", friendly_name: "A", body: "a" },
    { template_id: "b", friendly_name: "B", body: "b" },
  ];
  assertEquals(escolhaDoModelo('{"template_id":"b","motivo":"retoma a vaga"}', ms)?.modelo.template_id, "b");
  assertEquals(escolhaDoModelo('{"template_id":"b","motivo":"retoma a vaga"}', ms)?.motivo, "retoma a vaga");
  assertEquals(escolhaDoModelo('{"template_id":"zzz"}', ms)?.modelo.template_id, "a");
  assertEquals(escolhaDoModelo("lixo", ms)?.modelo.template_id, "a");
  assertEquals(escolhaDoModelo("{}", []), null);
});

Deno.test("oportunidade: valor só quando a campanha libera a IA a informar", () => {
  const base = { nome_servico: "Anestesia", cidade: "Chapecó", valor_min: 1500, valor_max: 1800 };
  assertStringIncludes(oportunidadeDoBriefing({ ...base, ia_informa_valor: true }).join("\n"), "R$ 1500 a R$ 1800 por plantão");
  const sem = oportunidadeDoBriefing(base).join("\n");
  assertEquals(sem.includes("1500"), false);
  assertStringIncludes(sem, "vai confirmar");
  assertEquals(oportunidadeDoBriefing(null), []);
});
