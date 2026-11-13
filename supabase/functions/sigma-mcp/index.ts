// Servidor MCP remoto do Sigma para o Claude dos sócios da GSS (docs/arquitetura/claude-socios-gss.md §3c).
// Transporte: MCP Streamable HTTP sem sessão (JSON-RPC 2.0 em POST, resposta JSON). Só leitura nesta fase.
// Login: token pessoal "sgm_..." no header Authorization: Bearer (gerado por mcp_gerar_token, guardado só o hash
// em mcp_tokens). Cada chamada confere token e papel e grava em mcp_chamadas.
// Deploy com verify_jwt = false (o token não é JWT do Supabase; a checagem é feita aqui).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAPEIS_LIBERADOS = ["admin", "diretoria"];
const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];
const TZ = "America/Sao_Paulo";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const resp = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(b === null ? null : JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });

// ---- datas -------------------------------------------------------------------------------------------

function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function somaDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Aceita "hoje", "amanhã", "ontem", AAAA-MM-DD e DD/MM[/AAAA].
function lerData(v: unknown, padrao?: string): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) {
    if (padrao) return padrao;
    throw new Error("data obrigatória (AAAA-MM-DD, DD/MM/AAAA, hoje ou amanhã)");
  }
  const hoje = hojeBR();
  if (s === "hoje") return hoje;
  if (s.startsWith("amanh")) return somaDias(hoje, 1); // "amanhã" com ou sem acento
  if (s === "ontem") return somaDias(hoje, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : hoje.slice(0, 4);
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  throw new Error(`data inválida: ${v}`);
}
function hora(iso: string | null): string {
  if (!iso) return "?";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  const sem = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(new Date(iso + "T12:00:00Z"));
  return `${sem.replace(".", "")} ${d}/${m}/${a}`;
}

// ---- hospitais -----------------------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PARTICULAS = new Set(["de", "do", "da", "dos", "das", "e"]);

type Local = { id: number; nome: string; cidade: string | null };

// "hro" casa com HOSPITAL REGIONAL DO OESTE (iniciais), "chapeco" com o nome. Mais de um: devolve todos.
function acharHospitais(locais: Local[], busca: string): Local[] {
  const q = semAcento(busca);
  if (!q) return [];
  const exato = locais.filter((l) => semAcento(l.nome) === q);
  if (exato.length) return exato;
  const contem = locais.filter((l) => semAcento(`${l.nome} ${l.cidade ?? ""}`).includes(q));
  if (contem.length) return contem;
  const palavras = q.split(/\s+/);
  const todas = locais.filter((l) => palavras.every((p) => semAcento(`${l.nome} ${l.cidade ?? ""}`).includes(p)));
  if (todas.length) return todas;
  return locais.filter((l) => {
    const ini = semAcento(l.nome).split(/[\s\-.]+/).filter((w) => w && !PARTICULAS.has(w)).map((w) => w[0]).join("");
    return q.length >= 2 && ini.startsWith(q.replace(/\s/g, ""));
  });
}

// ---- ferramentas ---------------------------------------------------------------------------------------

type Plantao = {
  id: number; data: string; inicio: string; fim: string | null; local_id: number; hospital: string | null;
  setor: string | null; profissional_nome: string | null; profissional_crm: string | null; situacao: string | null;
  tipo: string | null; furo: boolean;
};
const COLS = "id,data,inicio,fim,local_id,hospital,setor,profissional_nome,profissional_crm,situacao,tipo,furo";
const LIMITE_LINHAS = 400;

async function ultimaSync(svc: SupabaseClient): Promise<string> {
  const { data } = await svc.from("drescala_sincronizacoes").select("concluido_em")
    .eq("status", "ok").order("concluido_em", { ascending: false }).limit(1).maybeSingle();
  if (!data?.concluido_em) return "Dado do Dr. Escala ainda não sincronizado.";
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })
    .format(new Date(data.concluido_em));
  return `Dado do Dr. Escala sincronizado em ${quando}.`;
}

async function locais(svc: SupabaseClient): Promise<Local[]> {
  const { data, error } = await svc.from("drescala_locais").select("id,nome,cidade")
    .not("nome", "ilike", "%local teste%").order("nome");
  if (error) throw error;
  return data || [];
}

async function resolverHospital(svc: SupabaseClient, busca: unknown): Promise<{ ids: number[] | null; aviso?: string }> {
  const b = String(busca ?? "").trim();
  if (!b) return { ids: null };
  const achados = acharHospitais(await locais(svc), b);
  if (achados.length === 0) return { ids: [], aviso: `Nenhum hospital do Dr. Escala casa com "${b}". Use escalas_hospitais para ver a lista.` };
  if (achados.length > 6) {
    return { ids: [], aviso: `"${b}" casa com ${achados.length} hospitais. Seja mais específico. Alguns: ${achados.slice(0, 10).map((l) => l.nome).join("; ")}` };
  }
  return { ids: achados.map((l) => l.id) };
}

function linhaPlantao(p: Plantao, comHospital: boolean): string {
  const quem = p.furo ? "**DESCOBERTO**" : `${p.profissional_nome ?? "sem nome"}${p.profissional_crm ? ` (CRM ${p.profissional_crm})` : ""}`;
  const extra = [p.tipo, p.situacao && !p.furo ? p.situacao : null].filter(Boolean).join(", ");
  return `- ${hora(p.inicio)}–${hora(p.fim)}${comHospital ? ` · ${p.hospital}` : ""} · ${p.setor ?? "sem setor"}: ${quem}${extra ? ` (${extra})` : ""}`;
}

function agrupar(rows: Plantao[], comHospitalNoTitulo: boolean): string {
  const out: string[] = [];
  let chave = "";
  for (const p of rows) {
    const k = comHospitalNoTitulo ? `${p.data}|${p.hospital}` : p.data;
    if (k !== chave) {
      chave = k;
      out.push(`\n### ${diaBR(p.data)}${comHospitalNoTitulo ? ` · ${p.hospital}` : ""}`);
    }
    out.push(linhaPlantao(p, false));
  }
  return out.join("\n");
}

const FERRAMENTAS = [
  {
    name: "escalas_hospitais",
    title: "Hospitais com escala no Dr. Escala",
    description: "Lista os hospitais/unidades que a GSS escala pelo Dr. Escala, com quantos plantões e quantos plantões descobertos (furos) há nos próximos 7 dias. Use para descobrir o nome certo de um hospital.",
    inputSchema: { type: "object", properties: { busca: { type: "string", description: "Parte do nome ou da cidade (opcional)" } } },
  },
  {
    name: "escalas_do_hospital",
    title: "Escala de um hospital",
    description: "Plantões de um hospital num dia ou período, por setor, com quem está escalado e os plantões descobertos. Aceita parte do nome ou sigla do hospital (ex.: 'hro', 'gaspar', 'cepon').",
    inputSchema: {
      type: "object",
      properties: {
        hospital: { type: "string", description: "Nome, parte do nome, cidade ou sigla do hospital" },
        data_inicio: { type: "string", description: "AAAA-MM-DD, DD/MM/AAAA, 'hoje' ou 'amanhã'" },
        data_fim: { type: "string", description: "Último dia (opcional; padrão = data_inicio; máx. 31 dias)" },
      },
      required: ["hospital", "data_inicio"],
    },
  },
  {
    name: "plantoes_descobertos",
    title: "Plantões descobertos (furos)",
    description: "Plantões sem médico escalado num período, agrupados por dia e hospital. Padrão: de hoje a 7 dias.",
    inputSchema: {
      type: "object",
      properties: {
        data_inicio: { type: "string", description: "Padrão: hoje" },
        data_fim: { type: "string", description: "Padrão: data_inicio + 7 dias (máx. 62 dias)" },
        hospital: { type: "string", description: "Filtra um hospital (opcional)" },
      },
    },
  },
  {
    name: "quem_esta_escalado",
    title: "Quem está escalado",
    description: "Sem 'profissional': quem está de plantão num momento (padrão: agora), opcionalmente num hospital. Com 'profissional': os plantões desse médico no período.",
    inputSchema: {
      type: "object",
      properties: {
        quando: { type: "string", description: "Data e hora AAAA-MM-DDTHH:MM em hora de Brasília (padrão: agora)" },
        hospital: { type: "string" },
        profissional: { type: "string", description: "Nome (ou parte) ou CRM do médico" },
        data_inicio: { type: "string", description: "Com profissional: início do período (padrão: hoje)" },
        data_fim: { type: "string", description: "Com profissional: fim do período (padrão: +30 dias)" },
      },
    },
  },
];

async function executar(svc: SupabaseClient, nome: string, a: Record<string, unknown>): Promise<string> {
  const rodape = "\n\n_" + (await ultimaSync(svc)) + "_";

  if (nome === "escalas_hospitais") {
    let ls = await locais(svc);
    if (a.busca) ls = acharHospitais(ls, String(a.busca));
    const hoje = hojeBR();
    const { data, error } = await svc.from("drescala_plantoes").select("local_id,furo")
      .gte("data", hoje).lte("data", somaDias(hoje, 6)).limit(20000);
    if (error) throw error;
    const cont = new Map<number, { t: number; f: number }>();
    for (const r of data || []) {
      const c = cont.get(r.local_id) || { t: 0, f: 0 };
      c.t++; if (r.furo) c.f++;
      cont.set(r.local_id, c);
    }
    const linhas = ls.map((l) => ({ l, c: cont.get(l.id) || { t: 0, f: 0 } }))
      .filter((x) => a.busca || x.c.t > 0)
      .sort((x, y) => y.c.f - x.c.f || y.c.t - x.c.t)
      .map((x) => `- ${x.l.nome}${x.l.cidade ? ` (${x.l.cidade})` : ""}: ${x.c.t} plantões, ${x.c.f} descobertos`);
    if (!linhas.length) return "Nenhum hospital encontrado." + rodape;
    return `Hospitais com plantão de ${diaBR(hoje)} a ${diaBR(somaDias(hoje, 6))}:\n${linhas.join("\n")}` + rodape;
  }

  if (nome === "escalas_do_hospital") {
    const ini = lerData(a.data_inicio);
    const fim = lerData(a.data_fim, ini);
    if (fim < ini || somaDias(ini, 31) < fim) throw new Error("período inválido (data_fim antes do início ou mais de 31 dias)");
    const h = await resolverHospital(svc, a.hospital);
    if (!h.ids) throw new Error("informe o hospital");
    if (h.aviso) return h.aviso + rodape;
    const { data, error } = await svc.from("drescala_escala_v").select(COLS).in("local_id", h.ids)
      .gte("data", ini).lte("data", fim).order("data").order("hospital").order("inicio").order("setor").limit(LIMITE_LINHAS);
    if (error) throw error;
    const rows = (data || []) as Plantao[];
    if (!rows.length) return `Nenhum plantão no Dr. Escala para esse hospital entre ${diaBR(ini)} e ${diaBR(fim)}.` + rodape;
    const furos = rows.filter((r) => r.furo).length;
    const nomes = [...new Set(rows.map((r) => r.hospital))].join("; ");
    const corte = rows.length >= LIMITE_LINHAS ? `\n\n(Lista cortada em ${LIMITE_LINHAS} plantões: peça um período menor.)` : "";
    return `**${nomes}** — ${ini === fim ? diaBR(ini) : `${diaBR(ini)} a ${diaBR(fim)}`}: ${rows.length} plantões, ${furos} descobertos.` +
      agrupar(rows, h.ids.length > 1) + corte + rodape;
  }

  if (nome === "plantoes_descobertos") {
    const ini = lerData(a.data_inicio, hojeBR());
    const fim = lerData(a.data_fim, somaDias(ini, 7));
    if (fim < ini || somaDias(ini, 62) < fim) throw new Error("período inválido (máx. 62 dias)");
    const h = await resolverHospital(svc, a.hospital);
    if (h.aviso) return h.aviso + rodape;
    let q = svc.from("drescala_escala_v").select(COLS).eq("furo", true).gte("data", ini).lte("data", fim);
    if (h.ids) q = q.in("local_id", h.ids);
    const { data, error } = await q.order("data").order("hospital").order("inicio").limit(LIMITE_LINHAS);
    if (error) throw error;
    const rows = (data || []) as Plantao[];
    if (!rows.length) return `Nenhum plantão descoberto entre ${diaBR(ini)} e ${diaBR(fim)}.` + rodape;
    const porHosp = new Map<string, number>();
    for (const r of rows) porHosp.set(r.hospital ?? "?", (porHosp.get(r.hospital ?? "?") || 0) + 1);
    const resumo = [...porHosp.entries()].sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n}: ${c}`).join("; ");
    const corte = rows.length >= LIMITE_LINHAS ? `\n\n(Lista cortada em ${LIMITE_LINHAS}: peça um período menor.)` : "";
    return `**${rows.length} plantões descobertos** de ${diaBR(ini)} a ${diaBR(fim)}. Por hospital: ${resumo}.` +
      agrupar(rows, true) + corte + rodape;
  }

  if (nome === "quem_esta_escalado") {
    const h = await resolverHospital(svc, a.hospital);
    if (h.aviso) return h.aviso + rodape;
    if (a.profissional) {
      const p = String(a.profissional).trim();
      const ini = lerData(a.data_inicio, hojeBR());
      const fim = lerData(a.data_fim, somaDias(ini, 30));
      let q = svc.from("drescala_escala_v").select(COLS).gte("data", ini).lte("data", fim);
      q = /^\d{3,}/.test(p) ? q.ilike("profissional_crm", `%${p.replace(/\D/g, "")}%`) : q.ilike("profissional_nome", `%${p.replace(/[%_]/g, "")}%`);
      if (h.ids) q = q.in("local_id", h.ids);
      const { data, error } = await q.order("data").order("inicio").limit(LIMITE_LINHAS);
      if (error) throw error;
      const rows = (data || []) as Plantao[];
      if (!rows.length) return `Nenhum plantão de "${p}" entre ${diaBR(ini)} e ${diaBR(fim)}.` + rodape;
      const nomes = [...new Set(rows.map((r) => r.profissional_nome))];
      return `**${nomes.join("; ")}** — ${rows.length} plantões de ${diaBR(ini)} a ${diaBR(fim)}:` + agrupar(rows, true) + rodape;
    }
    // Momento em hora de Brasília: -03:00 fixo (o Brasil não tem horário de verão desde 2019).
    const quando = a.quando ? new Date(String(a.quando).length <= 16 ? `${a.quando}:00-03:00` : String(a.quando)) : new Date();
    if (isNaN(quando.getTime())) throw new Error("'quando' inválido: use AAAA-MM-DDTHH:MM");
    const iso = quando.toISOString();
    const diaQ = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(quando);
    // Plantão que começou até 1 dia antes e ainda não acabou.
    let q = svc.from("drescala_escala_v").select(COLS).gte("data", somaDias(diaQ, -1)).lte("data", diaQ)
      .lte("inicio", iso).gt("fim", iso);
    if (h.ids) q = q.in("local_id", h.ids);
    const { data, error } = await q.order("hospital").order("setor").limit(LIMITE_LINHAS);
    if (error) throw error;
    const rows = (data || []) as Plantao[];
    const momento = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(quando);
    if (!rows.length) return `Ninguém de plantão em ${momento}${h.ids ? " nesse hospital" : ""} segundo o Dr. Escala.` + rodape;
    const furos = rows.filter((r) => r.furo).length;
    let atual = "";
    const out: string[] = [];
    for (const r of rows) {
      if (r.hospital !== atual) { atual = r.hospital ?? ""; out.push(`\n### ${atual}`); }
      out.push(linhaPlantao(r, false));
    }
    return `De plantão em ${momento}: ${rows.length - furos} médicos${furos ? `, ${furos} plantões descobertos` : ""}.` + out.join("\n") + rodape;
  }

  throw new Error(`ferramenta desconhecida: ${nome}`);
}

// ---- autenticação --------------------------------------------------------------------------------------

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Sessao = { userId: string; tokenId: string };

async function autenticar(svc: SupabaseClient, req: Request): Promise<Sessao | Response> {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const negar = (s: number, msg: string) => resp({ error: msg }, s, s === 401 ? { "WWW-Authenticate": 'Bearer realm="sigma-mcp"' } : {});
  if (!tok.startsWith("sgm_")) return negar(401, "token ausente ou inválido");
  const { data: t } = await svc.from("mcp_tokens").select("id,user_id,revogado_em").eq("token_hash", await sha256(tok)).maybeSingle();
  if (!t || t.revogado_em) return negar(401, "token inválido ou revogado");
  const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", t.user_id);
  if (!(papeis || []).some((p: { role: string }) => PAPEIS_LIBERADOS.includes(p.role))) return negar(403, "usuário sem papel liberado para o MCP");
  await svc.from("mcp_tokens").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", t.id);
  return { userId: t.user_id, tokenId: t.id };
}

// ---- JSON-RPC ------------------------------------------------------------------------------------------

type Msg = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function tratar(svc: SupabaseClient, s: Sessao, m: Msg): Promise<unknown | null> {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const falha = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
  if (m.id === undefined || m.id === null) return null; // notificação (ex.: notifications/initialized): sem resposta

  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion || "");
      return ok({
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "sigma-gss", title: "Sigma GSS", version: "0.1.0" },
        instructions: "Dados da operação da GSS vindos do Sigma. Escalas e plantões vêm do Dr. Escala, sincronizados algumas vezes ao dia; cite a hora da sincronização quando ela for relevante. Nomes de médicos são dado pessoal: não repita fora do contexto da pergunta.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: FERRAMENTAS.map((f) => ({ ...f, annotations: { readOnlyHint: true, openWorldHint: false } })) });
    case "tools/call": {
      const nome = String(m.params?.name || "");
      const args = (m.params?.arguments || {}) as Record<string, unknown>;
      const t0 = Date.now();
      try {
        const texto = await executar(svc, nome, args);
        await svc.from("mcp_chamadas").insert({ user_id: s.userId, token_id: s.tokenId, metodo: "tools/call", ferramenta: nome, argumentos: args, ok: true, duracao_ms: Date.now() - t0 });
        return ok({ content: [{ type: "text", text: texto }] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        await svc.from("mcp_chamadas").insert({ user_id: s.userId, token_id: s.tokenId, metodo: "tools/call", ferramenta: nome, argumentos: args, ok: false, erro: msg, duracao_ms: Date.now() - t0 });
        // Erro de ferramenta volta como resultado com isError, para o Claude ler e corrigir o argumento.
        return ok({ content: [{ type: "text", text: `Erro: ${msg}` }], isError: true });
      }
    }
    default:
      return falha(-32601, `método não suportado: ${m.method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  // Sem stream SSE do servidor: GET responde 405, como a especificação permite.
  if (req.method !== "POST") return resp({ error: "use POST" }, 405, { Allow: "POST" });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sessao = await autenticar(svc, req);
  if (sessao instanceof Response) return sessao;

  let corpo: Msg | Msg[];
  try {
    corpo = await req.json();
  } catch {
    return resp({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, 400);
  }
  if (Array.isArray(corpo)) {
    const r = (await Promise.all(corpo.map((m) => tratar(svc, sessao, m)))).filter((x) => x !== null);
    return r.length ? resp(r) : new Response(null, { status: 202, headers: cors });
  }
  const r = await tratar(svc, sessao, corpo);
  return r === null ? new Response(null, { status: 202, headers: cors }) : resp(r);
});
