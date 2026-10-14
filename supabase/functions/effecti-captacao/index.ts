// Captação da GSS pela API oficial do Effecti (T1 de docs/arquitetura/licitacoes-contratos-gss.md).
//
// Só o perfil GSS. A AGES tem captador próprio (n8n "captador ages" → api-licitacoes) e não é
// tocada aqui: decisão do Raul (14/10) — a AGES é cliente e não pode perder nenhuma licitação.
// O mesmo edital que bate nos dois perfis vira um card por empresa (api-licitacoes separa pela
// etiqueta "AGES").
//
// Fluxo: POST /aviso/licitacao (janela de dias) → só perfilNome GSS → para cada aviso:
//   1. já existe card GSS com este aviso (effect_id)? card manual fica como está; o da captação
//      é atualizado pela api-licitacoes (que preserva coluna, responsável e descarte);
//   2. senão, existe card GSS com o mesmo número + UF + cidade (ou CNPJ do órgão)? É o edital
//      que a equipe já lançou à mão: só liga o aviso ao card, não cria outro;
//   3. senão, cria pelo api-licitacoes (mesmas regras dos captadores antigos).
// Anexos vão para uma fila e são baixados aos poucos (edital passa de 100 páginas).
//
// Ações: { acao: "capturar", dias?: 1-7, dry_run?: true }  |  { acao: "anexos", limite?: n }
// Quem chama: cron (x-internal-sync-key), service role, ou admin logado (teste manual).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://mdw.minha.effecti.com.br/api-integracao/v1";
const PERFIL = "GSS";
const MAX_ANEXO = 45 * 1024 * 1024; // api-licitacoes recusa acima de 50 MB
// a função morre aos 150 s; cada card leva ~2 s na api-licitacoes. O que não couber na rodada
// fica para a próxima (o cron roda a cada 30 min e a janela de 2 dias cobre a sobra).
const ORCAMENTO_MS = 95_000;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s: string | null | undefined) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const semHtml = (s: string | null | undefined) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// "d/m/Y H:i:s" (horário de Brasília) → ISO
function dataBr(s: string | null | undefined): string | null {
  const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}

// mesma sigla que os captadores antigos usavam no título ("PE 90532/2025 - Uberlândia/MG")
function sigla(modalidade: string | null | undefined) {
  const m = norm(modalidade);
  const tabela: [RegExp, string][] = [
    [/^pregao eletr/, "PE"], [/^pregao presencial/, "PP"], [/^pregao/, "PE"], [/^concorrencia eletr/, "CE"],
    [/^concorrencia/, "CC"], [/^dispensa eletr/, "DE"], [/^dispensa/, "DL"], [/^credenciamento/, "CRE"],
    [/^chamamento/, "CHP"], [/^inexigibilidade/, "INEX"], [/^tomada de preco/, "TP"], [/^convite/, "CV"], [/^leilao/, "LE"],
    [/^outr/, "OUT"], // mesma sigla que os cards antigos usavam ("OUT 00003/2026 - Itabaiana/Paraíba")
  ];
  for (const [re, s] of tabela) if (re.test(m)) return s;
  return m.split(" ").filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "ED";
}

// o PNCP grava a cidade em maiúsculas ("LIMA DUARTE"); no título fica como a equipe escreve
function nomeProprio(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(" ").map((w, i) => (i > 0 && ["de", "da", "do", "das", "dos", "e"].includes(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// cidade pelo nome do órgão quando o PNCP não conhece o CNPJ ("Prefeitura Municipal de X")
function cidadeDoOrgao(orgao: string) {
  const m = String(orgao ?? "").match(/(?:munic[ií]p(?:io|al)|prefeitura|fundo municipal de sa[uú]de|secretaria municipal de sa[uú]de|c[aâ]mara municipal)\s+(?:de|do|da|dos|das)\s+([^\-–,/(]+)/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  // ── quem pode chamar (nunca confiar no "role" decodificado do JWT) ──
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const chaveInterna = Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "";
  let permitido = (!!chaveInterna && req.headers.get("x-internal-sync-key") === chaveInterna) || (!!auth && auth === serviceKey);
  // chave de serviço em outro formato que o do ambiente: prova lendo uma tabela que só ela lê
  if (!permitido && auth) {
    const prova = createClient(supabaseUrl, auth, { auth: { persistSession: false } });
    const { data, error } = await prova.from("integracao_segredos").select("nome").limit(1);
    permitido = !error && Array.isArray(data);
  }
  if (!permitido && auth) {
    const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await u.auth.getUser(auth);
    if (user) {
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      permitido = (papeis ?? []).some((p: any) => p.role === "admin");
    }
  }
  if (!permitido) return json({ ok: false, error: "sem_permissao" }, 403);

  const input = await req.json().catch(() => ({}));
  const acao = String(input.acao || "capturar");

  try {
    if (acao === "capturar") return json(await capturar(svc, supabaseUrl, input));
    if (acao === "anexos") return json(await baixarAnexos(svc, supabaseUrl, Math.min(30, Number(input.limite) || 12)));
    if (acao === "rodada") {
      // captura primeiro; anexos só se sobrou tempo (senão vão na próxima rodada)
      const c = await capturar(svc, supabaseUrl, input);
      const a = c.ficaram_para_proxima ? { baixados: 0, erros: 0, adiado: true } : await baixarAnexos(svc, supabaseUrl, 8);
      return json({ ok: true, captura: c, anexos: a });
    }
    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    console.error("[effecti-captacao]", e);
    return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 500);
  }
});

async function tokenSigma(svc: any) {
  const { data } = await svc.from("api_tokens").select("token").eq("nome", "effecti-captacao-gss").eq("ativo", true).maybeSingle();
  if (!data?.token) throw new Error("token interno 'effecti-captacao-gss' ausente em api_tokens");
  return data.token as string;
}

async function avisosEffecti(dias: number) {
  const token = Deno.env.get("EFFECTI_API_TOKEN");
  if (!token) throw new Error("EFFECTI_API_TOKEN não configurado");
  const fmt = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19);
  const fim = new Date(), ini = new Date(Date.now() - dias * 86400 * 1000);
  const todos: any[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const r = await fetch(`${API}/aviso/licitacao?page=${pagina}`, {
      method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ begin: fmt(ini), end: fmt(fim) }),
    });
    if (!r.ok) throw new Error(`effecti_${r.status}: ${(await r.text()).slice(0, 200)}`);
    const corpo = await r.json();
    const lista = Array.isArray(corpo?.licitacoes) ? corpo.licitacoes : [];
    todos.push(...lista);
    const meta = corpo?._metadata ?? corpo?.metadata ?? {};
    if (!lista.length || pagina + 1 >= Number(meta.total_paginas ?? 1)) break;
  }
  return todos;
}

async function capturar(svc: any, supabaseUrl: string, input: any) {
  const dias = Math.max(1, Math.min(7, Number(input.dias) || 2));
  const dryRun = input.dry_run === true;
  const todos = await avisosEffecti(dias);
  const avisos = todos.filter((a) => norm(a.perfilNome) === norm(PERFIL));

  // cidade pelo CNPJ do órgão, a partir do espelho do PNCP (o Effecti não manda a cidade)
  const cnpjs = [...new Set(avisos.map((a) => digitos(a.cnpj)).filter((c) => c.length === 14))];
  const cidadePorCnpj = new Map<string, { municipio: string; uf: string }>();
  for (let i = 0; i < cnpjs.length; i += 100) {
    const { data } = await svc.from("pncp_mirror").select("cnpj_orgao, municipio, uf").in("cnpj_orgao", cnpjs.slice(i, i + 100)).limit(2000);
    for (const r of data ?? []) if (r.municipio && !cidadePorCnpj.has(r.cnpj_orgao)) cidadePorCnpj.set(r.cnpj_orgao, { municipio: r.municipio, uf: r.uf });
  }

  const token = dryRun ? "" : await tokenSigma(svc);
  const resumo = { lidos: todos.length, gss: avisos.length, criados: 0, atualizados: 0, ligados_a_card_manual: 0, mantidos_manual: 0, sem_mudanca: 0, erros: 0, ficaram_para_proxima: 0 };
  const amostra: any[] = [];

  const inicio = Date.now();
  for (const [n, a] of avisos.entries()) {
    if (!dryRun && Date.now() - inicio > ORCAMENTO_MS) { resumo.ficaram_para_proxima = avisos.length - n; break; }
    const id = String(a.idLicitacao);
    const cnpj = digitos(a.cnpj);
    const uf = String(a.uf || cidadePorCnpj.get(cnpj)?.uf || "").toUpperCase().slice(0, 2);
    // órgão do Distrito Federal não tem município no cadastro: a cidade é Brasília
    const cidadeBruta = cidadePorCnpj.get(cnpj)?.municipio || cidadeDoOrgao(a.orgao) || (String(a.uf).toUpperCase() === "DF" ? "Brasília" : null);
    const cidade = cidadeBruta ? nomeProprio(cidadeBruta) : null;
    const processo = String(a.processo || "").trim();
    const titulo = `${sigla(a.modalidade)} ${processo || id} - ${cidade ? `${cidade}/${uf}` : uf}`.trim();
    const objeto = String(a.objetoSemHtml || semHtml(a.objeto) || "").slice(0, 8000);
    const obs = [
      a.portal ? `Portal: ${a.portal}` : "", a.url ? `Link: ${a.url}` : "",
      a.unidadeGestora ? `Unidade gestora: ${a.unidadeGestora}` : "",
      Array.isArray(a.palavraEncontrada) && a.palavraEncontrada.length ? `Palavras do perfil: ${a.palavraEncontrada.join(", ")}` : "",
      a.srpDescricao ? `Registro de preços: ${a.srpDescricao}` : "",
    ].filter(Boolean).join("\n");

    // 1) card GSS já ligado a este aviso
    const { data: porAviso } = await svc.from("licitacoes").select("id, fonte, data_disputa")
      .eq("effect_id", id).or("etiquetas.is.null,etiquetas.not.cs.{AGES}").order("created_at").limit(1).maybeSingle();
    let destino: "criar" | "atualizar" | "manter_manual" | "ligar_manual" = porAviso ? (porAviso.fonte === "n8n" ? "atualizar" : "manter_manual") : "criar";
    let cardManual: string | null = porAviso && porAviso.fonte !== "n8n" ? porAviso.id : null;

    // 2) edital lançado à mão pela equipe: mesmo número, mesma UF e (cidade ou CNPJ do órgão)
    if (destino === "criar" && digitos(processo).length >= 3) {
      const busca = processo.replace(/[%,()*]/g, "");
      const { data: cands } = await svc.from("licitacoes").select("id, fonte, effect_id, numero_edital, titulo, municipio_uf, cnpj_orgao, etiquetas")
        .neq("fonte", "n8n")
        .gte("created_at", new Date(Date.now() - 120 * 86400 * 1000).toISOString())
        .or(`numero_edital.ilike.%${busca}%,titulo.ilike.%${busca}%`)
        .limit(30);
      // card da AGES nunca é da GSS (um card por empresa)
      const casa = (cands ?? []).filter((c: any) => !(c.etiquetas ?? []).some((e: string) => String(e).toUpperCase() === "AGES")).find((c: any) => {
        const mesmoNumero = digitos(c.numero_edital).includes(digitos(processo)) || digitos(c.titulo).includes(digitos(processo));
        const lugar = norm(c.municipio_uf);
        const mesmaUf = !uf || lugar.includes(norm(uf)) || !lugar;
        const mesmoLugar = (cidade && lugar.includes(norm(cidade))) || (cnpj && digitos(c.cnpj_orgao) === cnpj);
        return mesmoNumero && mesmaUf && mesmoLugar;
      });
      if (casa) { destino = "ligar_manual"; cardManual = casa.id; }
    }

    const payload = {
      fonte: "n8n", // mesmas regras de atualização dos captadores (preserva coluna, responsável e descarte)
      effect_id: id, licitacao_codigo: id, numero_edital: id,
      titulo, orgao: a.orgao || "Não informado", cnpj_orgao: cnpj || null, objeto, observacoes: obs,
      municipio_uf: cidade ? `${cidade}/${uf}` : uf || null,
      subtipo_modalidade: a.modalidade || null, data_disputa: dataBr(a.dataFinalProposta) || dataBr(a.dataInicialProposta),
      valor_estimado: Number(a.valorTotalEstimado) || null, etiquetas: ["GSS"], tipo_licitacao: "GSS",
    };
    // card da captação sem mudança de data não é reenviado: cada atualização grava um
    // comentário no histórico do card, e a rodada passa a cada 30 minutos
    const t = (d: string | null | undefined) => (d ? new Date(d).getTime() : null);
    if (destino === "atualizar" && t(porAviso?.data_disputa) === t(payload.data_disputa)) {
      resumo.sem_mudanca++; continue;
    }
    if (amostra.length < 5) amostra.push({ destino, titulo, municipio_uf: payload.municipio_uf, data_disputa: payload.data_disputa, anexos: (a.anexos ?? []).length, card_manual: cardManual });
    if (dryRun) { if (destino === "criar") resumo.criados++; else if (destino === "atualizar") resumo.atualizados++; else if (destino === "ligar_manual") resumo.ligados_a_card_manual++; else resumo.mantidos_manual++; continue; }

    try {
      let cardId: string | null = cardManual;
      if (destino === "ligar_manual") {
        await svc.from("licitacoes").update({ effect_id: id, ...(cnpj ? { cnpj_orgao: cnpj } : {}) }).eq("id", cardManual).is("effect_id", null);
        resumo.ligados_a_card_manual++;
      } else if (destino === "manter_manual") {
        resumo.mantidos_manual++;
      } else {
        const r = await fetch(`${supabaseUrl}/functions/v1/api-licitacoes`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok || corpo?.success === false) throw new Error(String(corpo?.message || corpo?.error || `api-licitacoes ${r.status}`).slice(0, 200));
        cardId = corpo?.data?.card_id ?? null;
        if (destino === "criar") resumo.criados++; else resumo.atualizados++;
      }
      // anexos do aviso vão para a fila (só para card da captação; o manual já tem os da equipe)
      if (cardId && destino !== "manter_manual" && destino !== "ligar_manual" && Array.isArray(a.anexos) && a.anexos.length) {
        await svc.from("effecti_anexos_fila").upsert(
          a.anexos.filter((x: any) => x?.url).map((x: any) => ({ licitacao_id: cardId, nome: String(x.nome || "anexo").slice(0, 200), url: x.url })),
          { onConflict: "licitacao_id,url", ignoreDuplicates: true });
      }
    } catch (e: any) {
      resumo.erros++;
      console.error("[effecti-captacao] aviso", id, String(e?.message || e));
    }
  }

  if (!dryRun) {
    // última rodada visível para o alarme de frescor e para quem for conferir
    const valor = JSON.stringify({ em: new Date().toISOString(), ...resumo });
    const { data: upd } = await svc.from("config_lista_items").update({ valor }).eq("campo_nome", "effecti_captacao_ultima_rodada").select("id");
    if (!upd?.length) await svc.from("config_lista_items").insert({ campo_nome: "effecti_captacao_ultima_rodada", valor });
  }
  return { ok: true, dias, dry_run: dryRun, ...resumo, amostra };
}

async function baixarAnexos(svc: any, supabaseUrl: string, limite: number) {
  const { data: fila } = await svc.from("effecti_anexos_fila").select("id, licitacao_id, nome, url, tentativas")
    .eq("status", "pendente").lt("tentativas", 3).order("created_at").limit(limite);
  if (!fila?.length) return { baixados: 0, erros: 0 };
  const token = await tokenSigma(svc);
  let baixados = 0, erros = 0;
  const inicio = Date.now();
  for (const f of fila) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    try {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw new Error(`download ${r.status}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX_ANEXO) throw new Error(`arquivo grande demais (${Math.round(buf.byteLength / 1048576)} MB)`);
      const tipo = (r.headers.get("content-type") || "application/octet-stream").split(";")[0];
      const nome = f.nome.replace(/[\\/:*?"<>|]+/g, "_");
      const up = await fetch(`${supabaseUrl}/functions/v1/api-licitacoes/${f.licitacao_id}/attachments`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": tipo, "x-filename": nome }, body: buf,
      });
      if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 120)}`);
      await svc.from("effecti_anexos_fila").update({ status: "baixado", atualizado_em: new Date().toISOString(), erro: null }).eq("id", f.id);
      baixados++;
    } catch (e: any) {
      erros++;
      const tent = (f.tentativas ?? 0) + 1;
      await svc.from("effecti_anexos_fila").update({ tentativas: tent, status: tent >= 3 ? "erro" : "pendente", erro: String(e?.message || e).slice(0, 300), atualizado_em: new Date().toISOString() }).eq("id", f.id);
    }
  }
  return { baixados, erros };
}
