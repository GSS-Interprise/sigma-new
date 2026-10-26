// npm test  (node --test, sem dependências)
import { test } from "node:test";
import assert from "node:assert/strict";
import { podeAbrirRotaDisparos, temAcessoCompletoDisparos } from "./acessoDisparos.ts";

// Rotas do módulo disparos em src/App.tsx (todas com PermissionRoute modulo="disparos")
const ROTAS_MODULO = [
  "/disparos", "/disparos/zap", "/disparos/email", "/disparos/acompanhamento", "/disparos/leads",
  "/disparos/blacklist", "/disparos/sigzap", "/disparos/config", "/disparos/contratos",
  "/disparos/captadores", "/disparos/regiao-interesse", "/disparos/monitor", "/disparos/residentes",
  "/disparos/trafego-pago", "/disparos/campanhas", "/disparos/bi-prospec", "/prospeccao",
  "/prospeccao/templates-whatsapp", "/noticias", "/tarefas", "/disparos/chips-saude",
  "/disparos/tarefas", "/leads",
];

// Danilo e Brenda: gestor_radiologia (sem disparos.visualizar) + pode_acessar_disparos
const danilo = { isAdmin: false, podeVerModuloPeloPerfil: false, acessoIndividual: true };
const brenda = { ...danilo };
// Ex.: Ulisses, gestor_radiologia sem a chave individual
const semPermissao = { isAdmin: false, podeVerModuloPeloPerfil: false, acessoIndividual: false };
const gestorCaptacao = { isAdmin: false, podeVerModuloPeloPerfil: true, acessoIndividual: false };
const admin = { isAdmin: true, podeVerModuloPeloPerfil: false, acessoIndividual: false };

const abertas = (u: typeof danilo) => ROTAS_MODULO.filter((r) => podeAbrirRotaDisparos(u, r));

test("Danilo e Brenda abrem /disparos e /disparos/config e nada mais do módulo", () => {
  assert.deepEqual(abertas(danilo), ["/disparos", "/disparos/config"]);
  assert.deepEqual(abertas(brenda), ["/disparos", "/disparos/config"]);
});

test("liberação individual não abre Monitor, envio nem conversas", () => {
  for (const rota of ["/disparos/monitor", "/disparos/zap", "/disparos/email", "/disparos/campanhas",
    "/disparos/trafego-pago", "/prospeccao", "/disparos/sigzap", "/disparos/captadores"]) {
    assert.equal(podeAbrirRotaDisparos(danilo, rota), false, rota);
  }
  assert.equal(temAcessoCompletoDisparos(danilo), false);
});

test("usuário sem a permissão continua sem acesso", () => {
  assert.deepEqual(abertas(semPermissao), []);
});

test("quem já tinha o módulo pelo perfil continua com todas as rotas", () => {
  assert.deepEqual(abertas(gestorCaptacao), ROTAS_MODULO);
  assert.deepEqual(abertas(admin), ROTAS_MODULO);
});

test("central mostra só o card de Chips & Instâncias para a liberação individual", () => {
  // hrefs dos cards de src/pages/Disparos.tsx
  const cards = ["/disparos/zap", "/disparos/email", "/disparos/acompanhamento", "/disparos/leads",
    "/disparos/contratos", "/disparos/blacklist", "/disparos/regiao-interesse", "/disparos/sigzap",
    "/disparos/config", "/disparos/captadores", "/disparos/monitor", "/disparos/residentes",
    "/disparos/campanhas", "/disparos/bi-prospec"];
  assert.deepEqual(cards.filter((c) => podeAbrirRotaDisparos(brenda, c)), ["/disparos/config"]);
});
