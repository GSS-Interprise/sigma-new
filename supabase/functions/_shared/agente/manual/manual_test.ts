// deno test --node-modules-dir=none --allow-read agente/manual/  (a partir de supabase/functions/_shared)
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buscar, lerPagina, secoes } from "./manual.ts";
import { gerarModulo } from "./gerar.ts";
import { PAGINAS } from "./paginas.gen.ts";
import { paginasDe } from "../dominios/processos.ts";

const md = (area: string, modulo: string, corpo: string) => `---\narea: ${area}\ntitulo: ${area[0].toUpperCase()}${area.slice(1)}\nmodulo: ${modulo}\ntelas: [/a, /b]\n---\n${corpo}`;
const camp = lerPagina(md("prospeccao", "disparos", "# Prospecção\nCampanhas de prospecção de médicos.\n\n## Como fazer: criar campanha\n1. Clique em \"Nova campanha\".\n2. Escolha a especialidade.\n\n## Perguntas frequentes\n**P:** Posso pausar?\n**R:** Sim, em \"Pausar\"."), "prospeccao.md");
const lic = lerPagina(md("licitacoes", "licitacoes", "# Licitações\nQuadro de editais.\n\n## Como fazer: arquivar um card\n1. Abra o card e clique em \"Arquivar\".\n\n## Regras e situações\n- Contratos nascem de licitação arrematada."), "licitacoes.md");

Deno.test("lerPagina: frontmatter, telas e corpo; sem frontmatter falha", () => {
  assertEquals([camp.area, camp.titulo, camp.modulo, camp.telas], ["prospeccao", "Prospeccao", "disparos", ["/a", "/b"]]);
  assert(camp.texto.startsWith("# Prospecção"));
  assertThrows(() => lerPagina("# sem nada", "x.md"), Error, "frontmatter");
  assertThrows(() => lerPagina("---\narea: x\n---\noi", "x.md"), Error, "titulo");
});

Deno.test("secoes: uma por ## e a introdução, sem o título", () => {
  assertEquals(secoes(camp).map((s) => s.secao), ["Introdução", "Como fazer: criar campanha", "Perguntas frequentes"]);
});

Deno.test("buscar: acha pelo título da seção, ignora palavra vazia e é estável", () => {
  const r = buscar([camp, lic], "como eu faço para criar uma campanha?");
  assertEquals(r[0].secao, "Como fazer: criar campanha");
  assertEquals(buscar([camp, lic], "arquivar card")[0].area, "licitacoes");
  assertEquals(buscar([camp, lic], "como faço isso"), []);
  assertEquals(buscar([camp, lic], "xilofone azul"), []);
  assertEquals(buscar([camp, lic], "pausar xilofone azul"), []);
  assertEquals(JSON.stringify(buscar([camp, lic], "pausar campanha")), JSON.stringify(buscar([camp, lic], "pausar campanha")));
});

Deno.test("paginas.gen.ts está em dia com docs/manual-sigma (rode scripts/gerar-manual-agente.ts)", async () => {
  const pasta = new URL("../../../../../docs/manual-sigma/", import.meta.url);
  const arquivos: { nome: string; md: string }[] = [];
  for await (const e of Deno.readDir(pasta)) if (e.isFile && e.name.endsWith(".md") && e.name !== "README.md") arquivos.push({ nome: e.name, md: await Deno.readTextFile(new URL(e.name, pasta)) });
  const atual = await Deno.readTextFile(new URL("./paginas.gen.ts", import.meta.url));
  assertEquals(atual.replace(/\r\n/g, "\n"), gerarModulo(arquivos));
  assert(PAGINAS.length >= 8, `só ${PAGINAS.length} páginas`);
  for (const p of PAGINAS) assert(/^## Como fazer/m.test(p.texto), `${p.area}: sem seção "Como fazer"`);
});

Deno.test("paginasDe: só módulos que a pessoa vê; 'todos' sempre", async () => {
  const svc = { rpc: async (_: string, a: { p_modulo: string }) => ({ data: a.p_modulo === "disparos" }) };
  const geral = lerPagina(md("assistente", "todos", "# A\nx\n## Como fazer: abrir\n1. y"));
  const ps = await paginasDe({ svc, userId: "u", agora: new Date() }, [camp, lic, geral]);
  assertEquals(ps.map((p) => p.area), ["prospeccao", "assistente"]);
});
