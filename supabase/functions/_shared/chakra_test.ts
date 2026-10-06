import { assertEquals } from "jsr:@std/assert@1";
import { chakraCampaignTemplateDefinition, chakraTemplateMatchesSender, isExplicitChakraOptOut, parseRetryAfterMs, resolvePhoneWabaId, selectChakraTargets } from "./chakra.ts";

Deno.test("uses Retry-After header in seconds for Chakra throttling", () => {
  const headers = new Headers({ "retry-after": "30" });

  assertEquals(
    parseRetryAfterMs(headers, {}, 1_000),
    30_000,
  );
});

Deno.test("uses payload retry_after_ms when the header is absent", () => {
  assertEquals(
    parseRetryAfterMs(new Headers(), { retry_after_ms: 12_500 }, 1_000),
    12_500,
  );
});

Deno.test("associa cada telefone ao próprio WABA quando o plugin retorna duas contas", () => {
  assertEquals(
    resolvePhoneWabaId(
      { id: "1179260535268840", waba: "987580980748042" },
      [{ id: "1701305377585648" }, { id: "987580980748042" }],
    ),
    "987580980748042",
  );
});

Deno.test("não presume o primeiro WABA quando o telefone não identifica sua conta", () => {
  assertEquals(
    resolvePhoneWabaId(
      { id: "1179260535268840" },
      [{ id: "1701305377585648" }, { id: "987580980748042" }],
    ),
    null,
  );
});

Deno.test("sincroniza ou cadastra templates só para o número escolhido", () => {
  const connections = [
    { phone_number_id: "1265298783330718", plugin_id: "plugin-a", waba_id: "1701305377585648" },
    { phone_number_id: "1179260535268840", plugin_id: "plugin-b", waba_id: "987580980748042" },
  ];
  assertEquals(selectChakraTargets(connections, "1179260535268840"), [
    { phone_number_id: "1179260535268840", plugin_id: "plugin-b", waba_id: "987580980748042" },
  ]);
  assertEquals(selectChakraTargets(connections, "inexistente"), []);
});

Deno.test("impede envio com template aprovado em outro WABA do mesmo plugin", () => {
  const sender = {
    chakra_plugin_id: "plugin-b",
    chakra_waba_id: "987580980748042",
  };
  assertEquals(chakraTemplateMatchesSender(sender, {
    twilio_payload: { plugin_id: "plugin-b", waba_id: "1701305377585648" },
  }), false);
  assertEquals(chakraTemplateMatchesSender(sender, {
    twilio_payload: { plugin_id: "plugin-b", waba_id: "987580980748042" },
  }), true);
});

Deno.test("SAIR isolado desativa respostas da IA sem confundir conversa comum", () => {
  assertEquals(isExplicitChakraOptOut(" SAIR! "), true);
  assertEquals(isExplicitChakraOptOut("Quero sair mais cedo do plantão"), false);
  assertEquals(isExplicitChakraOptOut("Não quero receber mais mensagens"), true);
});

Deno.test("template de oportunidade informa como pedir descadastro", () => {
  const template = chakraCampaignTemplateDefinition();
  assertEquals(template.name, "gss_oportunidade_sair_20260930");
  assertEquals(template.body.endsWith("Caso nao deseje receber mensagens como esta, responda SAIR."), true);
  assertEquals(Object.keys(template.variables), ["1", "2", "3"]);
});
