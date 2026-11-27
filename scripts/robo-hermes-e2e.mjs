// Teste de ponta a ponta das ferramentas do robô Hermes no sigma-mcp (frente motor Hermes, 27/11/2026).
// Cria 2 tokens temporários de origem 'hermes' e 2 itens de teste, exercita reservar/entregar/cancelar/saúde
// e desfaz tudo no fim. Uso: node scripts/robo-hermes-e2e.mjs (lê SUPABASE_ACCESS_TOKEN do .env.local).
import fs from "node:fs";
import crypto from "node:crypto";
const env = fs.readFileSync("C:/Users/rauls/sigma-new/.env.local", "utf8");
const tok = env.match(/^SUPABASE_ACCESS_TOKEN=["']?([^"'\r\n]+)/m)[1];
const sql = async (q) => { const r = await fetch("https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j; };
const URL = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sigma-mcp";
const mk = () => "sgm_" + crypto.randomBytes(24).toString("hex");
const h = (t) => crypto.createHash("sha256").update(t).digest("hex");
const rpc = async (t, method, params = {}) => { const r = await fetch(URL, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); return (await r.json()).result; };
const call = async (t, name, args) => { const r = await rpc(t, "tools/call", { name, arguments: args }); return r.isError ? { erro: r.content[0].text } : r.structuredContent; };
const check = (c, msg) => { console.log((c ? "ok   " : "FALHA") + " " + msg); if (!c) process.exitCode = 1; };

const [adm] = await sql("select ur.user_id from user_roles ur where ur.role='admin' order by ur.user_id limit 1");
const t1 = mk(), t2 = mk();
const [tk1] = await sql(`insert into mcp_tokens(user_id,nome,token_hash,prefixo,origem,expira_em) values('${adm.user_id}','teste robô','${h(t1)}','${t1.slice(0,8)}','hermes',now()+interval '1 hour') returning id`);
const [tk2] = await sql(`insert into mcp_tokens(user_id,nome,token_hash,prefixo,origem,expira_em) values('${adm.user_id}','teste robô 2','${h(t2)}','${t2.slice(0,8)}','hermes',now()+interval '1 hour') returning id`);
const [p] = await sql("select * from conversas_classificar_pendentes(1)");
const [anx] = await sql("select a.id, a.contrato_id, a.arquivo_url, l.status, l.metodo, l.tentativas, l.erro from contrato_anexos a join contrato_anexo_leitura l on l.anexo_id=a.id where a.id='8c633b69-98cd-4c8b-a50d-39a7cf0fcc87'");
const key = decodeURIComponent(anx.arquivo_url.includes("/contratos-documentos/") ? anx.arquivo_url.split("/contratos-documentos/")[1].split("?")[0] : anx.arquivo_url);
const ref = { campanha_lead_id: p.campanha_lead_id, zenvia_telefone: null, lead_id: p.lead_id, campanha_id: p.campanha_id, especialidade_id: p.especialidade_id, ultima_do_medico: p.ultima_do_medico };
await sql(`insert into ia_trabalho(tipo,chave,entrada) values ('classificar_conversa','teste:e2e:c', '${JSON.stringify({ ref }).replace(/'/g, "''")}'::jsonb), ('ocr_contrato','teste:e2e:o','${JSON.stringify({ arquivo: { bucket: "contratos-documentos", key }, ref: { anexo_id: anx.id, contrato_id: anx.contrato_id } }).replace(/'/g, "''")}'::jsonb)`);
try {
  const ini = await rpc(t1, "initialize", { protocolVersion: "2025-06-18" });
  check(ini.serverInfo.name === "sigma-gss-robo", "initialize do robô");
  const tl = await rpc(t1, "tools/list");
  check(tl.tools.length === 4 && tl.tools.every((t) => t.name.startsWith("ia_trabalho_")), `só 4 ferramentas da fila (${tl.tools.map((t) => t.name)})`);
  check((await call(t1, "escalas_hospitais", {})).erro?.includes("desconhecida"), "robô não chama domínio dos sócios");
  const l = await call(t1, "ia_trabalho_listar", { limite: 10 });
  check(l.itens.length === 2, `reservou 2 itens (${l.itens.length})`);
  const ic = l.itens.find((i) => i.tipo === "classificar_conversa"), io = l.itens.find((i) => i.tipo === "ocr_contrato");
  const head = await fetch(io.entrada.arquivo.link, { method: "GET", headers: { Range: "bytes=0-4" } });
  check(head.ok && (await head.text()).startsWith("%PDF"), "link assinado do PDF abre");
  check((await call(t2, "ia_trabalho_entregar", { item_id: ic.id, resposta: { resultado: "interessado", confianca: 1 } })).reason === "lease_expirado", "outro token não entrega item reservado");
  check((await call(t1, "ia_trabalho_entregar", { item_id: ic.id, resposta: "texto solto" })).erro?.includes("objeto JSON"), "resposta inválida recusada (item segue reservado)");
  const e = await call(t1, "ia_trabalho_entregar", { item_id: ic.id, resposta: '```json\n{"resultado":"filtro_secretaria","confianca":0.9,"uf_medico":"sc"}\n```' });
  check(e.state === "done", "entrega da classificação fecha o item");
  const [cls] = await sql(`select resultado, modelo, uf_medico from conversa_classificacao where campanha_lead_id='${p.campanha_lead_id}'`);
  check(cls?.modelo === "hermes:claude" && cls.resultado === "filtro_secretaria" && cls.uf_medico === "SC", "linha gravada com a mesma limpeza");
  const c = await call(t1, "ia_trabalho_cancelar", { item_id: io.id, motivo: "teste e2e" });
  check(c.state === "canceled", "cancelar OCR");
  const [lt] = await sql(`select status, erro from contrato_anexo_leitura where anexo_id='${anx.id}'`);
  check(lt.status === "erro" && lt.erro === "hermes: teste e2e", "leitura do anexo marcada com o motivo");
  const s = await call(t1, "ia_trabalho_saude", {});
  check(s.classificar_conversa && s.ocr_contrato, "saúde por tipo");
} finally {
  await sql(`delete from conversa_classificacao where campanha_lead_id='${p.campanha_lead_id}' and modelo='hermes:claude'`);
  await sql(`update contrato_anexo_leitura set status='${anx.status}', metodo=${anx.metodo ? `'${anx.metodo}'` : "null"}, tentativas=${anx.tentativas}, erro=${anx.erro ? `'${anx.erro.replace(/'/g, "''")}'` : "null"} where anexo_id='${anx.id}'`);
  await sql("delete from ia_trabalho where chave like 'teste:e2e:%'");
  await sql(`delete from mcp_chamadas where token_id in ('${tk1.id}','${tk2.id}'); delete from mcp_tokens where id in ('${tk1.id}','${tk2.id}')`);
  const [r] = await sql("select (select count(*) from ia_trabalho) fila, (select count(*) from mcp_tokens where origem='hermes') tokens");
  console.log("limpeza:", JSON.stringify(r));
}
