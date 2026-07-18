// F1 (18/07) — Importar fechamento MULTI-FONTE, config-driven.
// Generaliza o importar_producao_financeiro (single-source hard-coded) para
// qualquer relatório CONSOLIDADO, lendo a config de `financeiro_import_config`.
// O tratamento do relatório CRU (doppler/ajuste da radiologia) é OUTRO projeto —
// aqui entra já consolidado.
//
// Fluxo: recebe {config_id, mes, ano, arquivo_base64, arquivo_nome} → dedup por
// hash (financeiro_import_log) → parseia o xlsx pela config (aba/header_row/layout/
// mapa_colunas) → casa médico (CRM ou nome) → grava financeiro_pagamentos
// (fonte='import', idempotente por config+mês) → loga. Deploy via CLI (sem DDL).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const digits = (s: string) => (s || "").replace(/[^0-9]/g, "");

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // ── auth: só gestor_financeiro / diretoria / admin ──
    const authz = req.headers.get("Authorization") || "";
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authz } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "não autenticado" }, 401);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", u.user.id);
    const ok = (roles || []).some((r: any) => ["gestor_financeiro", "diretoria", "admin"].includes(r.role));
    if (!ok) return json({ error: "sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const { config_id, mes, ano, arquivo_base64, arquivo_nome } = body || {};
    if (!config_id || !mes || !ano || !arquivo_base64) return json({ error: "faltam campos: config_id, mes, ano, arquivo_base64" }, 400);

    const { data: cfg, error: cfgErr } = await svc.from("financeiro_import_config").select("*").eq("id", config_id).single();
    if (cfgErr || !cfg) return json({ error: "config não encontrada" }, 404);

    // dedup: mesmo arquivo não entra 2x
    const hash = await sha256(arquivo_base64);
    const { data: dup } = await svc.from("financeiro_import_log").select("id, created_at").eq("arquivo_hash", hash).maybeSingle();
    if (dup) return json({ ja_importado: true, msg: "Este arquivo já foi importado.", em: dup.created_at });

    // decode + parse
    const bin = Uint8Array.from(atob(arquivo_base64), (c) => c.charCodeAt(0));
    const wb = XLSX.read(bin, { type: "array" });
    const sheetName = cfg.aba && wb.Sheets[cfg.aba] ? cfg.aba : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
    const hRow = Math.max(1, Number(cfg.header_row) || 1);
    const headers: string[] = (grid[hRow - 1] || []).map((h) => String(h ?? "").trim());
    const dataRows = grid.slice(hRow);

    // índice de coluna por nome de cabeçalho (match exato e normalizado)
    const colIdx = (nome: string): number => {
      if (!nome) return -1;
      let i = headers.findIndex((h) => h === nome);
      if (i === -1) i = headers.findIndex((h) => norm(h) === norm(nome));
      return i;
    };
    const mapa = cfg.mapa_colunas || {};
    const iMedico = colIdx(mapa.medico);
    const iCrm = colIdx(mapa.crm);
    const iQtd = colIdx(mapa.quantidade);
    const iValor = colIdx(mapa.valor);
    const colsValor: number[] = Array.isArray(mapa.colunas_valor) ? mapa.colunas_valor.map((c: string) => colIdx(c)).filter((x: number) => x >= 0) : [];
    if (iMedico < 0) return json({ error: `coluna do médico ('${mapa.medico}') não encontrada no cabeçalho`, headers }, 400);

    const num = (v: any) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };

    // monta linhas canônicas
    const linhas: { nome: string; crm: string; valor: number; qtd: number }[] = [];
    for (const row of dataRows) {
      const nome = String(row[iMedico] ?? "").trim();
      if (!nome || /^total/i.test(nome)) continue;
      let valor = 0;
      if (cfg.layout === "matriz") valor = colsValor.reduce((s, c) => s + num(row[c]), 0);
      else valor = iValor >= 0 ? num(row[iValor]) : 0;
      const qtd = iQtd >= 0 ? num(row[iQtd]) : 0;
      const crm = iCrm >= 0 ? String(row[iCrm] ?? "").trim() : "";
      if (valor === 0 && qtd === 0) continue; // linha vazia de produção
      linhas.push({ nome, crm, valor, qtd });
    }

    // idempotência por config+mês: apaga import anterior DESTA fonte/mês (prefixo no arquivo_origem)
    const tag = `[cfg:${config_id}]`;
    await svc.from("financeiro_pagamentos").delete()
      .eq("fonte", "import").eq("mes_referencia", mes).eq("ano_referencia", ano).like("arquivo_origem", `${tag}%`);

    // casa médico + insere
    let inseridos = 0, casados = 0; const naoCasados: any[] = []; let total = 0;
    for (const l of linhas) {
      let medicoId: string | null = null;
      const d = digits(l.crm);
      if (d) {
        const { data: m } = await svc.from("medicos").select("id").filter("crm", "ilike", `%${d}%`).limit(1).maybeSingle();
        medicoId = m?.id ?? null;
      }
      if (!medicoId) {
        // casa por nome normalizado
        const { data: ms } = await svc.from("medicos").select("id, nome");
        const alvo = norm(l.nome);
        const hit = (ms || []).find((m: any) => norm(m.nome) === alvo);
        medicoId = hit?.id ?? null;
      }
      const { error: insErr } = await svc.from("financeiro_pagamentos").insert({
        profissional_nome: l.nome, profissional_crm: l.crm || null, medico_id: medicoId,
        mes_referencia: mes, ano_referencia: ano, unidade: cfg.nome,
        total_plantoes: Math.round(l.qtd) || 0, valor_total: l.valor,
        status: "pendente", fonte: "import", arquivo_origem: `${tag} ${arquivo_nome || ""}`.trim(),
      });
      if (insErr) { naoCasados.push({ nome: l.nome, erro: insErr.message }); continue; }
      inseridos++; total += l.valor;
      if (medicoId) casados++; else naoCasados.push({ nome: l.nome, crm: l.crm });
    }

    await svc.from("financeiro_import_log").insert({
      config_id, arquivo_nome: arquivo_nome || null, arquivo_hash: hash,
      linhas_lidas: linhas.length, medicos: inseridos, total, status: "ok",
      detalhe: { casados, nao_casados: naoCasados.length, aba: sheetName },
      criado_por: u.user.id,
    });

    return json({ ok: true, ja_importado: false, inseridos, casados, nao_casados: naoCasados, total, aba: sheetName, linhas_lidas: linhas.length });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
