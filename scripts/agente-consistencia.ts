// Bateria de consistência do protocolo do agente do Sigma (docs/arquitetura/protocolo-agente-sigma.md §3h, T5).
//
// Para cada caso de supabase/functions/_shared/agente/casos/<dominio>.json:
//   1. chama o sigma-mcp PUBLICADO 3 vezes e exige o mesmo hash (mesma pergunta = mesmo fato, para qualquer sócio);
//   2. confere cada total da resposta com um SQL independente sobre a view da tela (paridade);
//   3. exige rodapé com fonte, hora do dado e a versão do protocolo.
// Roda depois de todo deploy do sigma-mcp e antes de liberar domínio novo (CLAUDE.md do repo).
//
// Uso:  SUPABASE_ACCESS_TOKEN=sbp_... deno run -A scripts/agente-consistencia.ts [dominio ...]
//   SUPABASE_ACCESS_TOKEN: token pessoal da Management API (o mesmo do `npx supabase`). Nunca commitar.
//   SIGMA_ADMIN_EMAIL (opcional): dono do token temporário do MCP; padrão = primeiro admin.
// O script cria um token MCP temporário ("bateria-consistencia"), usa e revoga no fim, mesmo se falhar.
// Só lê: as ferramentas do MCP são somente leitura e o SQL de paridade é SELECT.

const REF = "zupsbgtoeoixfokzkjro";
const MCP = `https://${REF}.supabase.co/functions/v1/sigma-mcp`;
const RODADAS = 3;
const CASOS_DIR = new URL("../supabase/functions/_shared/agente/casos/", import.meta.url);

type Caso = {
  nome: string; pergunta: string; ferramenta: string; argumentos: Record<string, unknown>;
  paridade?: Record<string, string>;
};
type Arquivo = { dominio: string; casos: Caso[] };

const sbp = Deno.env.get("SUPABASE_ACCESS_TOKEN");
if (!sbp) {
  console.error("Falta SUPABASE_ACCESS_TOKEN (token pessoal da Management API do Supabase).");
  Deno.exit(2);
}

async function sql<T = Record<string, unknown>>(q: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sbp}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ query: q }),
  });
  const corpo = await r.json();
  if (!r.ok || !Array.isArray(corpo)) throw new Error(`SQL falhou: ${JSON.stringify(corpo).slice(0, 300)}`);
  return corpo as T[];
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Datas de Brasília: a mesma regra das ferramentas (hojeBR), para o caso e o SQL falarem do mesmo dia. */
function hojeBR(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const datas = { hoje: hojeBR(), amanha: somaDias(hojeBR(), 1) };
const trocar = (s: string) => s.replaceAll("{hoje}", datas.hoje).replaceAll("{amanha}", datas.amanha);
const trocarArgs = (a: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "string" ? trocar(v) : v]));

async function criarToken(): Promise<{ token: string; id: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = "sgm_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const email = Deno.env.get("SIGMA_ADMIN_EMAIL");
  const dono = email
    ? `(select u.id from auth.users u join user_roles r on r.user_id = u.id and r.role = 'admin' where u.email = ${lit(email)} limit 1)`
    : `(select user_id from user_roles where role = 'admin' order by user_id limit 1)`;
  const [linha] = await sql<{ id: string }>(
    `insert into mcp_tokens (user_id, nome, token_hash, prefixo, expira_em)
     select ${dono}, 'bateria-consistencia', ${lit(hash)}, ${lit(token.slice(0, 8))}, now() + interval '30 minutes'
     returning id`,
  );
  if (!linha?.id) throw new Error("não criou o token temporário (SIGMA_ADMIN_EMAIL é admin?)");
  return { token, id: linha.id };
}

async function chamar(token: string, nome: string, args: Record<string, unknown>) {
  const r = await fetch(MCP, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: nome, arguments: args } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`JSON-RPC ${j.error.code}: ${j.error.message}`);
  return j.result as {
    isError?: boolean; content: { text: string }[];
    structuredContent?: { hash: string; totais: Record<string, number>; protocolo: string };
  };
}

async function rodarCaso(token: string, c: Caso): Promise<string[]> {
  const falhas: string[] = [];
  const args = trocarArgs(c.argumentos);
  const rs = [];
  for (let i = 0; i < RODADAS; i++) rs.push(await chamar(token, c.ferramenta, args));
  if (rs[0].isError) return [`a ferramenta deu erro: ${rs[0].content[0]?.text}`];

  const hashes = new Set(rs.map((r) => r.structuredContent?.hash));
  if (hashes.size !== 1 || !rs[0].structuredContent?.hash) falhas.push(`hash mudou entre ${RODADAS} chamadas iguais: ${[...hashes].map((h) => h?.slice(0, 10)).join(", ")}`);
  // Sem o rodapé: nas ferramentas do próprio Sigma (sigma_guia) a hora do rodapé é a da chamada.
  const textos = new Set(rs.map((r) => (r.content[0]?.text ?? "").replace(/\n\n_Fonte: [^\n]*_$/, "")));
  if (textos.size !== 1) falhas.push("texto mudou entre chamadas iguais (mesmo hash, redação diferente no servidor)");

  const texto = rs[0].content[0]?.text ?? "";
  const sc = rs[0].structuredContent!;
  if (!new RegExp(`_Fonte: .+ · protocolo v${sc.protocolo.replace(/\./g, "\\.")}_$`).test(texto)) falhas.push("rodapé sem fonte ou versão do protocolo");

  for (const [chave, q] of Object.entries(c.paridade ?? {})) {
    // Primeira coluna da primeira linha, seja qual for o nome (count, ?column?, total...).
    const [linha] = await sql(trocar(q));
    const esperado = Number(Object.values(linha ?? {})[0]);
    const veio = sc.totais?.[chave];
    if (veio !== esperado) falhas.push(`${chave}: ferramenta disse ${veio}, a tela (SQL) diz ${esperado}`);
  }
  return falhas;
}

const pedidos = Deno.args.length ? Deno.args : [...Deno.readDirSync(CASOS_DIR)].filter((e) => e.name.endsWith(".json")).map((e) => e.name.replace(/\.json$/, ""));
console.log(`Bateria de consistência · hoje ${datas.hoje} (Brasília) · domínios: ${pedidos.join(", ")}\n`);

const { token, id } = await criarToken();
let total = 0, falhou = 0;
try {
  for (const d of pedidos) {
    const arq = JSON.parse(await Deno.readTextFile(new URL(`${d}.json`, CASOS_DIR))) as Arquivo;
    for (const c of arq.casos) {
      total++;
      const falhas = await rodarCaso(token, c).catch((e) => [`exceção: ${e instanceof Error ? e.message : e}`]);
      if (falhas.length) falhou++;
      console.log(`${falhas.length ? "FALHOU" : "ok    "}  ${arq.dominio}/${c.nome}  — ${c.pergunta}`);
      for (const f of falhas) console.log(`          ${f}`);
    }
  }
} finally {
  await sql(`update mcp_tokens set revogado_em = now() where id = ${lit(id)}`).catch((e) => console.error("ATENÇÃO: não revogou o token temporário", id, e));
}

console.log(`\n${total - falhou} de ${total} casos ok.`);
Deno.exit(falhou ? 1 : 0);
