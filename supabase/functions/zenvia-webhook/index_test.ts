import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizar, telefoneNorm } from "./index.ts";

Deno.test("telefone sem 55 ganha 55; com 55 fica igual", () => {
  assertEquals(telefoneNorm("47999998888"), "5547999998888");
  assertEquals(telefoneNorm("+55 (47) 99999-8888"), "5547999998888");
  assertEquals(telefoneNorm(""), null);
});

Deno.test("status do envio: médico é o 'to'", () => {
  const n = normalizar({ id: "e1", type: "MESSAGE_STATUS", channel: "whatsapp", messageId: "m1",
    message: { from: "gss", to: "47999998888", direction: "OUT" },
    messageStatus: { timestamp: "2026-11-18T13:00:00Z", code: "DELIVERED", description: "Entregue" } });
  assertEquals(n.status, "DELIVERED");
  assertEquals(n.message_id, "m1");
  assertEquals(n.telefone_norm, "5547999998888");
  assertEquals(n.texto, null);
});

Deno.test("resposta do médico: médico é o 'from' e o texto fica", () => {
  const n = normalizar({ id: "e2", type: "MESSAGE", direction: "IN", channel: "whatsapp",
    message: { id: "m9", from: "5547999998888", to: "gss", contents: [{ type: "text", text: "Tenho interesse" }] } });
  assertEquals(n.direcao, "IN");
  assertEquals(n.telefone_norm, "5547999998888");
  assertEquals(n.texto, "Tenho interesse");
});
