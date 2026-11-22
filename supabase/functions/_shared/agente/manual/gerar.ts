// Monta o texto de paginas.gen.ts a partir dos .md do manual (usado pelo script e pelo teste de sincronia).
import { lerPagina, type Pagina } from "./manual.ts";

export function gerarModulo(arquivos: { nome: string; md: string }[]): string {
  const paginas: Pagina[] = [...arquivos].sort((a, b) => a.nome.localeCompare(b.nome)).map((a) => {
    const p = lerPagina(a.md, a.nome);
    if (`${p.area}.md` !== a.nome) throw new Error(`${a.nome}: area "${p.area}" diferente do nome do arquivo`);
    return p;
  });
  return "// GERADO por scripts/gerar-manual-agente.ts a partir de docs/manual-sigma/*.md. Não edite à mão.\n" +
    'import type { Pagina } from "./manual.ts";\n\n' +
    `export const PAGINAS: Pagina[] = ${JSON.stringify(paginas, null, 2)};\n`;
}
