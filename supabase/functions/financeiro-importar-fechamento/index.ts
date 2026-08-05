// F1 (18/07) — Importar fechamento MULTI-FONTE, config-driven.
// E1 (04/08) — parser 'dr_escala_completo': o relatório COMPLETO do Dr. Escala entra
// plantão a plantão (não mais consolidado), com mês vindo DO ARQUIVO, checksum contra o
// total impresso pelo próprio Dr. Escala, e "A VISTA" marcado como JÁ PAGO.
// Ver docs/arquitetura/financeiro-fechamento-fases-multifonte.md.
//
// Fluxo: {config_id, mes, ano, arquivo_base64, arquivo_nome} → parseia conforme cfg.parser
// → dedup por hash (financeiro_import_log) → casa médico (CPF > CRM > nome) → grava
// financeiro_pagamentos + financeiro_pagamento_itens (idempotente por config+mês,
// preservando os ajustes que a Mavi já lançou) → loga. Deploy via CLI (sem DDL).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { parseDrEscalaCompleto, parseGenerico, norm, digits, type Bloco } from "./parser.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

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
    const { config_id, mes, ano, arquivo_base64, arquivo_nome, confirmar_periodo } = body || {};
    if (!config_id || !arquivo_base64) return json({ error: "faltam campos: config_id, arquivo_base64" }, 400);

    const { data: cfg, error: cfgErr } = await svc.from("financeiro_import_config").select("*").eq("id", config_id).single();
    if (cfgErr || !cfg) return json({ error: "config não encontrada" }, 404);

    // decode + parse ANTES do dedup: recusa por período/checksum não pode queimar o hash
    const bin = Uint8Array.from(atob(arquivo_base64), (c) => c.charCodeAt(0));
    const wb = XLSX.read(bin, { type: "array" });
    const sheetName = cfg.aba && wb.Sheets[cfg.aba] ? cfg.aba : wb.SheetNames[0];
    const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: null });

    let blocos: Bloco[] = [];
    let mesRef = Number(mes), anoRef = Number(ano);

    if (cfg.parser === "dr_escala_completo") {
      const p = parseDrEscalaCompleto(grid);
      if (!p.mes || !p.ano) return json({ error: "não achei o período no arquivo (esperado 'dd/mm/aaaa - dd/mm/aaaa' nas primeiras linhas)" }, 400);
      // o mês manda no ARQUIVO. Se a tela pediu outro, barra — foi assim que julho virou agosto.
      if (mes && ano && (Number(mes) !== p.mes || Number(ano) !== p.ano) && !confirmar_periodo) {
        return json({
          erro_periodo: true,
          msg: `O arquivo é de ${String(p.mes).padStart(2, "0")}/${p.ano}, mas a tela está em ${String(mes).padStart(2, "0")}/${ano}.`,
          periodo_arquivo: { mes: p.mes, ano: p.ano },
        }, 409);
      }
      if (p.divergencias.length) {
        return json({ erro_checksum: true, msg: "A soma dos plantões não bate com o total do próprio relatório.", divergencias: p.divergencias }, 422);
      }
      mesRef = p.mes; anoRef = p.ano; blocos = p.blocos;
    } else {
      if (!mesRef || !anoRef) return json({ error: "faltam campos: mes, ano" }, 400);
      const p: any = parseGenerico(grid, cfg);
      if (p.erro) return json({ error: p.erro, headers: p.headers }, 400);
      blocos = p.blocos;
    }
    if (!blocos.length) return json({ error: "nenhuma linha de produção encontrada no arquivo" }, 400);

    // dedup: mesmo arquivo não entra 2x
    const hash = await sha256(arquivo_base64);
    const { data: dup } = await svc.from("financeiro_import_log").select("id, created_at").eq("arquivo_hash", hash).maybeSingle();
    if (dup) return json({ ja_importado: true, msg: "Este arquivo já foi importado.", em: dup.created_at });

    // ── casar médico: CPF > CRM (só dígitos) > nome normalizado ──
    // O banco guarda CPF e CRM em dois formatos ("74982125953" e "008.283.202-17";
    // "26366" e "CRM/SC 26366"), então o candidato vem largo e o match fino é aqui.
    const q = (v: string) => `"${v.replace(/"/g, "")}"`;
    const pool: any[] = [];
    const cpfs = blocos.map((b) => b.cpf).filter(Boolean);
    if (cpfs.length) {
      const fmt = cpfs.map((c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`);
      const { data } = await svc.from("medicos").select("id, nome_completo, crm, cpf")
        .or(`cpf.in.(${cpfs.map(q).join(",")}),cpf.in.(${fmt.map(q).join(",")})`);
      pool.push(...(data || []));
    }
    const crms = [...new Set(blocos.map((b) => digits(b.crm)).filter(Boolean))];
    if (crms.length) {
      const { data } = await svc.from("medicos").select("id, nome_completo, crm, cpf")
        .or(crms.map((c) => `crm.ilike.*${c}*`).join(","));
      pool.push(...(data || []));
    }
    const nomes = [...new Set(blocos.map((b) => b.nome).filter(Boolean))];
    if (nomes.length) {
      const { data } = await svc.from("medicos").select("id, nome_completo, crm, cpf")
        .or(nomes.map((n) => `nome_completo.ilike.${q(n)}`).join(","));
      pool.push(...(data || []));
    }
    const byCpf = new Map<string, string>(), byCrm = new Map<string, string>(), byNome = new Map<string, string>();
    for (const m of pool) {
      const kc = digits(m.cpf || ""); if (kc.length === 11 && !byCpf.has(kc)) byCpf.set(kc, m.id);
      const kr = digits(m.crm || ""); if (kr && !byCrm.has(kr)) byCrm.set(kr, m.id);
      const kn = norm(m.nome_completo || ""); if (kn && !byNome.has(kn)) byNome.set(kn, m.id);
    }
    const casar = (b: Bloco): string | null =>
      (b.cpf && byCpf.get(b.cpf)) || (digits(b.crm) && byCrm.get(digits(b.crm))) || byNome.get(norm(b.nome)) || null;

    // ── idempotência por config+mês, PRESERVANDO os ajustes já lançados ──
    const tag = `[cfg:${config_id}]`;
    const { data: antigos } = await svc.from("financeiro_pagamentos")
      .select("id, profissional_nome, medico_id")
      .eq("fonte", "import").eq("mes_referencia", mesRef).eq("ano_referencia", anoRef).like("arquivo_origem", `${tag}%`);
    const ajustesSalvos: any[] = [];
    if (antigos?.length) {
      const { data: aj } = await svc.from("financeiro_pagamento_ajustes")
        .select("pagamento_id, categoria_id, valor, justificativa, criado_por, created_at")
        .in("pagamento_id", antigos.map((p: any) => p.id));
      const chave = new Map(antigos.map((p: any) => [p.id, p.medico_id || norm(p.profissional_nome)]));
      for (const a of aj || []) ajustesSalvos.push({ ...a, _chave: chave.get(a.pagamento_id) });
      await svc.from("financeiro_pagamentos").delete().in("id", antigos.map((p: any) => p.id));
    }

    // ── grava pagamento + itens ──
    let inseridos = 0, casados = 0, totalGeral = 0, totalAVista = 0;
    const naoCasados: any[] = [];
    const novasChaves = new Map<string, string>();

    for (const b of blocos) {
      const medicoId = casar(b);
      const produzido = b.itens.reduce((s, i) => s + i.valor, 0);
      const aVista = b.itens.reduce((s, i) => s + (i.aVista ? i.valor : 0), 0);
      const minutos = b.itens.reduce((s, i) => s + i.minutos, 0);

      const { data: pag, error: insErr } = await svc.from("financeiro_pagamentos").insert({
        profissional_nome: b.nome,
        profissional_crm: b.crm ? `${b.crm}${b.uf ? "/" + b.uf : ""}` : null,
        medico_id: medicoId,
        mes_referencia: mesRef, ano_referencia: anoRef,
        unidade: b.unidade || cfg.nome,
        total_plantoes: b.itens.filter((i) => i.data).length || b.itens.length,
        total_horas_minutos: minutos,
        valor_produzido: produzido, valor_a_vista: aVista, valor_ajustes: 0,
        valor_total: produzido - aVista,
        status: "pendente", fonte: "import",
        arquivo_origem: `${tag} ${arquivo_nome || ""}`.trim(),
      }).select("id").single();

      if (insErr || !pag) { naoCasados.push({ nome: b.nome, erro: insErr?.message }); continue; }

      const itens = b.itens.filter((i) => i.data).map((i) => ({
        pagamento_id: pag.id, data_plantao: i.data,
        hora_inicio: i.hIni, hora_fim: i.hFim, carga_horaria_minutos: i.minutos,
        setor: i.setor || null, local_nome: i.local || null,
        valor_hora: i.vHora, valor_total: i.valor,
        tipo: i.tipo || null, pago_a_vista: i.aVista,
      }));
      for (let k = 0; k < itens.length; k += 100) {
        const { error: itErr } = await svc.from("financeiro_pagamento_itens").insert(itens.slice(k, k + 100));
        if (itErr) return json({ ok: false, error: `falha ao gravar plantões de ${b.nome}: ${itErr.message}` }, 500);
      }

      novasChaves.set(medicoId || norm(b.nome), pag.id);
      inseridos++; totalGeral += produzido; totalAVista += aVista;
      if (medicoId) casados++; else naoCasados.push({ nome: b.nome, crm: b.crm, cpf: b.cpf });
    }

    // devolve os ajustes ao pagamento correspondente do novo import
    let ajustesRestaurados = 0, ajustesPerdidos = 0;
    for (const a of ajustesSalvos) {
      const destino = novasChaves.get(a._chave);
      if (!destino) { ajustesPerdidos++; continue; }
      const { error } = await svc.from("financeiro_pagamento_ajustes").insert({
        pagamento_id: destino, categoria_id: a.categoria_id, valor: a.valor,
        justificativa: a.justificativa, criado_por: a.criado_por, created_at: a.created_at,
      });
      if (error) ajustesPerdidos++; else ajustesRestaurados++;
    }

    await svc.from("financeiro_import_log").insert({
      config_id, arquivo_nome: arquivo_nome || null, arquivo_hash: hash,
      linhas_lidas: blocos.reduce((s, b) => s + b.itens.length, 0),
      medicos: inseridos, total: totalGeral - totalAVista, status: "ok",
      detalhe: {
        parser: cfg.parser, casados, nao_casados: naoCasados.length, aba: sheetName,
        mes: mesRef, ano: anoRef, total_produzido: totalGeral, total_a_vista: totalAVista,
        ajustes_restaurados: ajustesRestaurados, ajustes_perdidos: ajustesPerdidos,
      },
      criado_por: u.user.id,
    });

    return json({
      ok: true, ja_importado: false, parser: cfg.parser,
      mes: mesRef, ano: anoRef,
      inseridos, casados, nao_casados: naoCasados,
      total_produzido: totalGeral, total_a_vista: totalAVista, total: totalGeral - totalAVista,
      plantoes: blocos.reduce((s, b) => s + b.itens.filter((i) => i.data).length, 0),
      ajustes_restaurados: ajustesRestaurados, ajustes_perdidos: ajustesPerdidos,
      aba: sheetName,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
