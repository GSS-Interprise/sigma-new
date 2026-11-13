import { assertEquals } from "jsr:@std/assert@1";
import { isExplicitChakraOptOut } from "./chakra.ts";
import {
  type ClienteLeitura,
  type ConsultaLeitura,
  type Linha,
  rodadaCanceladaPorOptOut,
  telefoneBloqueioE164,
  variantesTelefoneBloqueio,
} from "./opt-out.ts";

// Telefones fictícios (DDD 48). O WhatsApp manda o celular antigo sem o 9; o lead está cadastrado com o 9.
const WHATS_SEM_9 = "554881234567";
const LEAD_COM_9 = "+5548981234567";

// Banco em memória com o pedaço da API do supabase-js que o helper usa: select/eq/in/limit/maybeSingle.
function bancoFalso(tabelas: Record<string, Linha[]>): ClienteLeitura {
  return {
    from(tabela: string) {
      let linhas = [...(tabelas[tabela] ?? [])];
      const consulta: ConsultaLeitura = {
        select: () => consulta,
        eq: (col: string, val: unknown) => {
          linhas = linhas.filter((l) => l[col] === val);
          return consulta;
        },
        in: (col: string, vals: unknown[]) => {
          linhas = linhas.filter((l) => vals.includes(l[col]));
          return consulta;
        },
        limit: (n: number) => {
          linhas = linhas.slice(0, n);
          return consulta;
        },
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
        then(ok, erro) {
          return Promise.resolve({ data: linhas }).then(ok, erro);
        },
      };
      return consulta;
    },
  };
}

// Reproduz o descadastro: o handler grava na blacklist o telefone normalizado e o gatilho do banco marca
// leads.opt_out quando o telefone casa com o do lead.
function descadastrar(tabelas: Record<string, Linha[]>, telefoneWhats: string) {
  const phone = telefoneBloqueioE164(telefoneWhats);
  tabelas.blacklist.push({ id: crypto.randomUUID(), phone_e164: phone });
  for (const lead of tabelas.leads) if (lead.phone_e164 === phone) lead.opt_out = true;
}

function cenario() {
  return {
    leads: [{ id: "lead-1", phone_e164: LEAD_COM_9, opt_out: false }],
    campanha_leads: [{ id: "cl-1", lead_id: "lead-1", status: "em_conversa" }],
    blacklist: [] as Linha[],
  };
}

const rodada = (tabelas: Record<string, Linha[]>, phoneDigits = WHATS_SEM_9) =>
  rodadaCanceladaPorOptOut(bancoFalso(tabelas), { campanhaLeadId: "cl-1", leadId: "lead-1", phoneDigits });

Deno.test("SAIR em qualquer caixa e com espaços nas pontas é descadastro", () => {
  for (const texto of ["SAIR", "Sair", "sair", "  Sair  ", " SAIR! ", "Sair.", "\tsair\n"]) {
    assertEquals(isExplicitChakraOptOut(texto), true, texto);
  }
  for (const texto of ["Sir", "Quero sair mais cedo do plantão", "Pode enviar"]) {
    assertEquals(isExplicitChakraOptOut(texto), false, texto);
  }
});

Deno.test("celular que chega sem o 9 vai para a blacklist com o 9, igual ao lead", () => {
  assertEquals(telefoneBloqueioE164(WHATS_SEM_9), LEAD_COM_9);
  assertEquals(telefoneBloqueioE164("5548981234567"), LEAD_COM_9);
  assertEquals(telefoneBloqueioE164("+55 (48) 98123-4567"), LEAD_COM_9);
  assertEquals(telefoneBloqueioE164("4881234567"), LEAD_COM_9);
  // Fixo (começa em 2-5) não ganha o 9.
  assertEquals(telefoneBloqueioE164("554832123456"), "+554832123456");
});

Deno.test("a IA procura o bloqueio com e sem o 9", () => {
  assertEquals(variantesTelefoneBloqueio(WHATS_SEM_9), ["+554881234567", LEAD_COM_9]);
  assertEquals(variantesTelefoneBloqueio("5548981234567"), [LEAD_COM_9, "+554881234567"]);
});

Deno.test("caso de 12/11: SAIR durante a geração cancela a resposta da IA, sem mensagem nova", async () => {
  const tabelas = cenario();
  // A rodada do "Sir" começou com o lead elegível...
  assertEquals(await rodada(tabelas), false);
  // ...o "Sair" chegou 3 s depois, sem o 9, e o descadastro rodou enquanto o modelo gerava o texto.
  assertEquals(isExplicitChakraOptOut("Sair"), true);
  descadastrar(tabelas, WHATS_SEM_9);
  assertEquals(tabelas.leads[0].opt_out, true);
  // A revalidação antes do envio cancela a rodada.
  assertEquals(await rodada(tabelas), true);
  assertEquals(await rodada(tabelas, "5548981234567"), true);
});

Deno.test("bloqueio antigo gravado sem o 9 também cancela, mesmo com leads.opt_out falso", async () => {
  const tabelas = cenario();
  tabelas.blacklist.push({ id: "bl-antigo", phone_e164: "+554881234567" });
  assertEquals(await rodada(tabelas, "5548981234567"), true);
  assertEquals(await rodada(tabelas, WHATS_SEM_9), true);
});

Deno.test("bloqueio vale para qualquer campanha do lead (conversas cruzadas)", async () => {
  const tabelas = cenario();
  // O SAIR veio na conversa de outra campanha; a campanha desta rodada segue "em_conversa".
  descadastrar(tabelas, "5548981234567");
  assertEquals(tabelas.campanha_leads[0].status, "em_conversa");
  assertEquals(await rodada(tabelas), true);
});

Deno.test("só leads.opt_out ou campanha encerrada também cancelam", async () => {
  const comOptOut = cenario();
  comOptOut.leads[0].opt_out = true;
  assertEquals(await rodada(comOptOut), true);
  const descartado = cenario();
  descartado.campanha_leads[0].status = "descartado";
  assertEquals(await rodada(descartado), true);
});

Deno.test("lead sem opt-out continua recebendo a resposta da IA", async () => {
  const tabelas = cenario();
  // Outro médico pediu para sair: não afeta este lead.
  descadastrar(tabelas, "554799887766");
  assertEquals(await rodada(tabelas), false);
  assertEquals(await rodada(tabelas, "5548981234567"), false);
});
