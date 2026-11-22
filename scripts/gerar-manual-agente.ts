// Gera supabase/functions/_shared/agente/manual/paginas.gen.ts a partir de docs/manual-sigma/*.md.
// Rodar depois de editar o manual:  deno run -A scripts/gerar-manual-agente.ts
// A edge do agente não lê o repositório: o manual entra embutido no código publicado.
import { gerarModulo } from "../supabase/functions/_shared/agente/manual/gerar.ts";

const raiz = new URL("../", import.meta.url);
const pasta = new URL("docs/manual-sigma/", raiz);
const destino = new URL("supabase/functions/_shared/agente/manual/paginas.gen.ts", raiz);
const arquivos: { nome: string; md: string }[] = [];
for await (const e of Deno.readDir(pasta)) if (e.isFile && e.name.endsWith(".md") && e.name !== "README.md") arquivos.push({ nome: e.name, md: await Deno.readTextFile(new URL(e.name, pasta)) });
await Deno.writeTextFile(destino, gerarModulo(arquivos));
console.log(`manual: ${arquivos.length} páginas -> ${destino.pathname}`);
