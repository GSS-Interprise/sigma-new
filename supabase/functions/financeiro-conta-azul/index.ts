// Financeiro ↔ Conta Azul: conferência fiscal da nota, prévia e lançamento das contas a pagar,
// e contas a receber a partir da nota emitida pela GSS.
//
// POST JSON { acao, ... } — só financeiro, admin ou service role.
//   conferir            { pagamento_ids[] }                  relê a nota e grava a conferência
//   aceitar_nota        { pagamento_id }                     alguém do financeiro assume a divergência
//   previa              { pagamento_ids[], ajustes? }        monta o lançamento SEM enviar
//   lancar              { pagamento_ids[], ajustes?, confirmar:true }
//   categorias          {}                                   categorias "MED." para a tela escolher
//   definir_categoria   { unidade, categoria_id }
//   nf_emitida_registrar{ arquivo_path, arquivo_nome }       lê a nota emitida e monta o a receber
//   nf_emitida_atualizar{ id, contrato_id?, vencimento?, status? }
//   receber_previa      { ids[] }                            monta o lançamento a receber SEM enviar
//   receber_lancar      { ids[], confirmar:true }
//
// ⚠ ESCRITA NO CONTA AZUL: a API cria e altera, mas NÃO apaga conta a pagar. Por isso
// `lancar` e `receber_lancar` só enviam quando config_lista_items.financeiro_contaazul_escrita
// = "1". Sem isso devolvem "escrita_desligada" e a prévia continua funcionando.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ca } from "../_shared/contaazul.ts";
import { CNPJ_GSS, CNPJS_GRUPO_GSS, leituraAssistida, lerNfse, textoPdf } from "../_shared/nfse.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "financeiro-anexos";
const PAPEIS = ["admin", "gestor_financeiro"];
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ultimoDia = (ano: number, mes1a12: number) => iso(new Date(Date.UTC(ano, mes1a12, 0)));
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PARADAS = new Set("de da do das dos e municipio municipal fundo saude prefeitura hospital associacao instituto fundacao estado governo ubs unidade secretaria sc rs mg pr sp ce ma go med fms".split(" "));
const palavras = (s: string) => new Set(semAcento(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w) && !/^\d+$/.test(w)));

// deno-lint-ignore no-explicit-any
type Svc = any;

async function baixar(svc: Svc, path: string): Promise<Uint8Array | null> {
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// ── conferência da nota do médico ─────────────────────────────────────────
async function conferirPagamento(svc: Svc, pag: any) {
  const agora = new Date().toISOString();
  if (!pag.nf_arquivo_path) return { id: pag.id, status: null, motivo: "sem nota recebida" };
  const bytes = await baixar(svc, pag.nf_arquivo_path);
  const ehPdf = !!bytes && bytes[0] === 0x25 && bytes[1] === 0x50; // %P
  const nota = bytes && ehPdf ? await lerNfse(bytes, CNPJS_GRUPO_GSS) : null;
  // layout que a leitura por regra não entende: um modelo lê o mesmo texto e SUGERE os valores.
  // A sugestão preenche o líquido, mas a nota fica para confirmação de uma pessoa.
  const sugestao = nota?.legivel && !nota.impostosLidos && bytes ? await leituraAssistida(await textoPdf(bytes)) : null;
  if (nota && sugestao) {
    if (nota.valor == null) nota.valor = sugestao.valor;
    if (nota.numero == null) nota.numero = sugestao.numero;
  }

  const itens: Array<{ chave: string; rotulo: string; ok: boolean | null; detalhe: string }> = [];
  let status: "ok" | "divergente" | "manual" = "ok";
  if (!nota || !nota.legivel) {
    status = "manual";
    itens.push({ chave: "leitura", rotulo: "Leitura da nota", ok: null, detalhe: bytes ? "Arquivo sem texto (foto ou escaneado): conferir à mão." : "Arquivo não encontrado." });
  } else {
    itens.push({ chave: "tomador", rotulo: "Tomador é a GSS", ok: nota.tomadorGss, detalhe: nota.tomadorGss ? "CNPJ da GSS no tomador." : "O tomador da nota não é a GSS." });
    const aPagar = Number(pag.valor_total ?? 0);
    const valorOk = nota.valor != null && Math.abs(nota.valor - aPagar) <= 0.01;
    itens.push({
      chave: "valor", rotulo: "Valor da nota", ok: nota.valor == null ? null : valorOk,
      detalhe: nota.valor == null ? "Não consegui ler o valor do serviço." : valorOk ? `${brl(nota.valor)}, igual ao fechamento.` : `Nota ${brl(nota.valor)} · fechamento ${brl(aPagar)} · diferença ${brl(r2(nota.valor - aPagar))}.`,
    });
    itens.push({
      chave: "impostos", rotulo: "Impostos retidos e valor líquido", ok: nota.impostosLidos ? true : null,
      detalhe: nota.impostosLidos
        ? (Number(nota.totalRetencoes) > 0
          ? `Retido ${brl(nota.totalRetencoes)} (IRRF ${brl(nota.irrf)}, PIS/COFINS/CSLL ${brl(nota.contribSociais)}${Number(nota.inssRetido) > 0 ? `, INSS ${brl(nota.inssRetido)}` : ""}${Number(nota.issRetido) > 0 ? `, ISS ${brl(nota.issRetido)}` : ""}) · líquido ${brl(nota.valorLiquido)}.`
          : `Sem retenção${nota.simplesNacional ? " (Simples Nacional)" : ""} · líquido ${brl(nota.valorLiquido)}.`)
        : sugestao && nota.valor != null && Math.abs(sugestao.valor - nota.valor) <= 0.01
          ? `Leitura assistida deste layout: ${Number(sugestao.totalRetencoes) > 0 ? `retido ${brl(sugestao.totalRetencoes)}` : "sem retenção"} · líquido ${brl(sugestao.valorLiquido)}. Confira na nota e aceite.`
          : "Não consegui ler o quadro de impostos deste layout: informar o líquido à mão.",
    });
    // Alíquotas retidas (regra da Mavi, 14/10/2026): líquido = bruto → optante do Simples, ok.
    // Senão confere PIS 0,65% + COFINS 3% + CSLL 1% (4,65%) e IR 1,5% sobre o bruto.
    // Retenção abaixo de R$ 10 é dispensada por lei, então zero também vale nesse caso.
    const fonte = nota.impostosLidos ? nota : (sugestao && nota.valor != null && Math.abs(sugestao.valor - nota.valor) <= 0.01 ? sugestao : null);
    if (fonte && nota.valor != null) {
      const bruto = Number(nota.valor);
      const ret = Number(fonte.totalRetencoes ?? 0);
      if (ret <= 0.01) {
        itens.push({ chave: "aliquotas", rotulo: "Alíquotas retidas", ok: true, detalhe: "Líquido igual ao bruto: prestador optante do Simples Nacional." });
      } else {
        const confere = (lido: number, esperado: number) => Math.abs(lido - esperado) <= 0.02 || (esperado < 10 && lido <= 0.01);
        const irEsp = r2(bruto * 0.015), csrfEsp = r2(bruto * 0.0465);
        const ir = Number(fonte.irrf ?? 0), csrf = Number(fonte.contribSociais ?? 0);
        const outros = Number(fonte.inssRetido ?? 0) + Number(fonte.issRetido ?? 0);
        const irOk = confere(ir, irEsp), csrfOk = confere(csrf, csrfEsp);
        const falhas = [
          !irOk && `IR ${brl(ir)} (esperado ${brl(irEsp)}, 1,5%)`,
          !csrfOk && `PIS/COFINS/CSLL ${brl(csrf)} (esperado ${brl(csrfEsp)}, 4,65%)`,
          outros > 0.01 && `retenção de INSS/ISS ${brl(outros)} fora da regra`,
        ].filter(Boolean);
        itens.push({
          chave: "aliquotas", rotulo: "Alíquotas retidas", ok: falhas.length === 0,
          detalhe: falhas.length ? `Diferente do esperado: ${falhas.join("; ")}.` : `IR 1,5% e PIS/COFINS/CSLL 4,65% conferem · líquido esperado ${brl(r2(bruto - irEsp - csrfEsp))}.`,
        });
      }
    }
    // CNPJ do prestador: bate com o que o financeiro já conhece deste médico?
    let prestOk: boolean | null = null, prestDet = "Nota sem CNPJ do prestador legível.";
    if (nota.prestadorCnpj) {
      const { data: conhecidos } = pag.medico_id
        ? await svc.from("financeiro_medico_cnpj").select("cnpj").eq("medico_id", pag.medico_id)
        : { data: [] as any[] };
      const lista = (conhecidos ?? []).map((c: any) => dig(c.cnpj));
      if (lista.includes(nota.prestadorCnpj)) { prestOk = true; prestDet = "CNPJ já usado por este médico."; }
      else if (lista.length) { prestOk = false; prestDet = "CNPJ diferente dos que este médico já usou."; }
      else { prestOk = null; prestDet = "Primeira nota deste médico: CNPJ ainda não conhecido."; }
    }
    itens.push({ chave: "prestador", rotulo: "CNPJ do prestador", ok: prestOk, detalhe: prestDet });

    if (itens.some((i) => i.ok === false)) status = "divergente";
    else if (itens.some((i) => i.ok === null && i.chave !== "prestador")) status = "manual";
  }

  const sugestaoValida = !!sugestao && nota?.valor != null && Math.abs(sugestao.valor - nota.valor) <= 0.01;
  const patch: Record<string, unknown> = {
    nf_numero: nota?.numero ?? null, nf_prestador_cnpj: nota?.prestadorCnpj ?? null,
    nf_valor_bruto: nota?.valor ?? null,
    nf_retencoes: nota?.impostosLidos ? nota.totalRetencoes : (sugestaoValida ? sugestao!.totalRetencoes : null),
    nf_valor_liquido: nota?.impostosLidos ? nota.valorLiquido : (sugestaoValida ? sugestao!.valorLiquido : null),
    nf_conferencia: { itens, leitura_assistida: sugestaoValida, simples_nacional: nota?.simplesNacional ?? null, competencia: nota?.competencia ?? null, emissao: nota?.emissao ?? null },
    nf_conferida_em: agora,
  };
  // exceção já assumida por alguém continua valendo enquanto a nota for a mesma
  if (pag.nf_conferencia_status !== "aceita" || status === "ok") patch.nf_conferencia_status = status;
  await svc.from("financeiro_pagamentos").update(patch).eq("id", pag.id);
  return { id: pag.id, status: patch.nf_conferencia_status ?? pag.nf_conferencia_status, itens };
}

// ── referências do Conta Azul (lidas do espelho) ──────────────────────────
async function referencias(svc: Svc) {
  const todas: any[] = [];
  for (let de = 0; ; de += 1000) { // PostgREST corta em 1000 linhas
    const { data } = await svc.from("contaazul_cache").select("tipo, ca_id, nome, dados").range(de, de + 999);
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: cfgRows } = await svc.from("config_lista_items").select("campo_nome, valor")
    .in("campo_nome", ["financeiro_contaazul_escrita", "financeiro_contaazul_conta_id", "financeiro_contaazul_centro_medicos_id", "financeiro_nf_link_base"]);
  const cfg = (n: string) => String(cfgRows?.find((c: any) => c.campo_nome === n)?.valor || "").trim();
  // O mesmo CNPJ aparece em vários cadastros: no Conta Azul da GSS o fornecedor é
  // "NOME DO MÉDICO/RAZÃO SOCIAL", um por médico, e uma empresa médica tem vários médicos
  // (66 CNPJs repetidos em 164 cadastros em 12/10). Por isso a lista inteira por documento.
  const pessoasPorDoc = new Map<string, any[]>();
  for (const p of todas.filter((x) => x.tipo === "pessoa")) {
    const d = dig(p.dados?.documento);
    if (d.length >= 11) pessoasPorDoc.set(d, [...(pessoasPorDoc.get(d) ?? []), p]);
  }
  const categoriasMed = todas.filter((x) => x.tipo === "categoria" && /^med\b/i.test(semAcento(x.nome || "")))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const contas = todas.filter((x) => x.tipo === "conta_financeira");
  const centros = todas.filter((x) => x.tipo === "centro_custo");
  // padrão observado em 780 lançamentos de médico (jun–set/2026): conta "GSS Unicred" e
  // centro "Médicos - CUSTO VARIÁVEL". Configurável, para não depender do nome.
  const conta = contas.find((c) => c.ca_id === cfg("financeiro_contaazul_conta_id")) ?? contas.find((c) => /unicred/i.test(c.nome || ""));
  const centroMed = centros.find((c) => c.ca_id === cfg("financeiro_contaazul_centro_medicos_id")) ?? centros.find((c) => /^m[eé]dicos\s*-\s*custo vari/i.test(c.nome || ""));
  return {
    pessoasPorDoc, categoriasMed, categorias: todas.filter((x) => x.tipo === "categoria"), centros, conta, centroMed,
    escrita: cfg("financeiro_contaazul_escrita") === "1",
    linkBase: (cfg("financeiro_nf_link_base") || "https://sigma-gss.lovable.app").replace(/\/+$/, ""),
  };
}

/** Entre os cadastros com o mesmo CNPJ, o do médico: o nome antes da barra é o da pessoa. */
function escolherFornecedor(cands: any[], medico: string) {
  if (cands.length <= 1) return { escolhido: cands[0] ?? null, ambiguo: false };
  const tm = palavras(medico);
  const pontos = cands.map((c) => {
    const pessoa = [...palavras(String(c.nome || "").split("/")[0])];
    return { c, n: pessoa.length ? pessoa.filter((w) => tm.has(w)).length / pessoa.length : 0 };
  }).sort((a, b) => b.n - a.n);
  const claro = pontos[0].n >= 0.6 && (pontos.length === 1 || pontos[0].n > pontos[1].n);
  return { escolhido: claro ? pontos[0].c : null, ambiguo: !claro };
}

function sugerirCategoria(unidade: string, categoriasMed: any[]) {
  const tu = palavras(unidade);
  const bons = categoriasMed
    .map((c) => ({ c, t: [...palavras(c.nome)] }))
    .filter((x) => x.t.length > 0 && x.t.every((w) => tu.has(w)))
    .sort((a, b) => b.t.length - a.t.length);
  if (!bons.length) return null;
  const melhor = bons.filter((x) => x.t.length === bons[0].t.length);
  return melhor.length === 1 ? melhor[0].c : null; // empate não é sugestão
}

async function montarPagar(svc: Svc, ids: string[], ajustes: Record<string, any>) {
  const ref = await referencias(svc);
  const { data: pags } = await svc.from("financeiro_pagamentos")
    .select("id, profissional_nome, medico_id, unidade, mes_referencia, ano_referencia, valor_total, status, nf_status, nf_numero, nf_prestador_cnpj, nf_valor_bruto, nf_retencoes, nf_valor_liquido, nf_conferencia_status, ca_evento_id, ca_lancado_em")
    .in("id", ids);
  const unidades = [...new Set((pags ?? []).map((p: any) => p.unidade).filter(Boolean))];
  const { data: mapa } = unidades.length
    ? await svc.from("contaazul_unidade_categoria").select("unidade, categoria_id, categoria_nome").in("unidade", unidades)
    : { data: [] as any[] };
  const hoje = iso(new Date());

  const itens = (pags ?? []).map((p: any) => {
    const aj = ajustes?.[p.id] ?? {};
    const problemas: string[] = [], avisos: string[] = [];
    if (p.ca_evento_id) problemas.push("Já lançado no Conta Azul.");
    if (!["recebida", "conferida"].includes(p.nf_status)) problemas.push("Nota fiscal ainda não recebida.");
    if (!["ok", "aceita"].includes(p.nf_conferencia_status ?? "")) {
      problemas.push(p.nf_conferencia_status === "divergente" ? "Nota com divergência: corrigir ou aceitar a exceção." : p.nf_conferencia_status === "manual" ? "Conferência da nota precisa ser feita à mão." : "Nota ainda não conferida.");
    }
    const cands = p.nf_prestador_cnpj ? (ref.pessoasPorDoc.get(p.nf_prestador_cnpj) ?? []) : [];
    const forcado = aj.fornecedor_id ? cands.find((c: any) => c.ca_id === aj.fornecedor_id) : null;
    const escolha = forcado ? { escolhido: forcado, ambiguo: false } : escolherFornecedor(cands, p.profissional_nome || "");
    const fornecedor = escolha.escolhido;
    if (!p.nf_prestador_cnpj) problemas.push("CNPJ do prestador não foi lido na nota.");
    else if (!cands.length) problemas.push("Fornecedor não cadastrado no Conta Azul com este CNPJ.");
    else if (escolha.ambiguo) problemas.push(`Há ${cands.length} fornecedores com este CNPJ no Conta Azul: escolher o do médico.`);

    const definida = (mapa ?? []).find((m: any) => m.unidade === p.unidade);
    const escolhida = aj.categoria_id ? ref.categoriasMed.find((c: any) => c.ca_id === aj.categoria_id) : null;
    const sugerida = !definida && !escolhida && p.unidade ? sugerirCategoria(p.unidade, ref.categoriasMed) : null;
    const categoria = escolhida ?? (definida ? { ca_id: definida.categoria_id, nome: definida.categoria_nome } : sugerida);
    if (!categoria) problemas.push("Unidade sem categoria “MED.” definida.");
    else if (sugerida) avisos.push("Categoria sugerida pelo nome da unidade: confira.");

    if (!ref.conta) problemas.push("Conta financeira de pagamento não encontrada.");
    if (!ref.centroMed) problemas.push("Centro de custo dos médicos não encontrado.");

    // valor: o líquido da nota (é o que a GSS lança); sem leitura de impostos, tem que informar
    const valor = aj.valor != null ? Number(aj.valor) : (p.nf_valor_liquido != null ? Number(p.nf_valor_liquido) : null);
    if (valor == null || !(valor > 0)) problemas.push("Valor líquido não lido na nota: informar o valor a lançar.");
    else if (aj.valor != null && p.nf_valor_liquido != null && Math.abs(valor - Number(p.nf_valor_liquido)) > 0.01) avisos.push(`Valor informado diferente do líquido da nota (${brl(p.nf_valor_liquido)}).`);

    // vencimento: último dia do mês seguinte ao de referência (padrão dos lançamentos atuais)
    const mesSeg = p.mes_referencia === 12 ? 1 : p.mes_referencia + 1;
    const anoSeg = p.mes_referencia === 12 ? p.ano_referencia + 1 : p.ano_referencia;
    const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(String(aj.vencimento || "")) ? String(aj.vencimento) : ultimoDia(anoSeg, mesSeg);
    // competência no mesmo mês do vencimento, como nos lançamentos atuais
    const competencia = hoje.slice(0, 7) === vencimento.slice(0, 7) ? hoje : `${vencimento.slice(0, 7)}-01`;
    const numero = String(aj.nf_numero ?? p.nf_numero ?? "").trim();
    if (!numero) avisos.push("Número da nota não foi lido: a descrição sai sem número.");
    const descricao = `REF. ${MESES[(p.mes_referencia ?? 1) - 1]} - NF ${numero || "S/N"}`;
    const v = valor ?? 0;

    const payload = (fornecedor && categoria && ref.conta && ref.centroMed && v > 0) ? {
      descricao, data_competencia: competencia, valor: v,
      conta_financeira: ref.conta.ca_id, id_fornecedor: fornecedor.ca_id,
      observacao: `Lançado pelo Sigma. Nota e comprovante: ${ref.linkBase}/financeiro`,
      referencia_externa: `sigma-pag-${p.id}`,
      rateio: [{ id_categoria: categoria.ca_id, valor: v, rateio_centro_custo: [{ id_centro_custo: ref.centroMed.ca_id, valor: v }] }],
      condicao_pagamento: { parcelas: [{ descricao, data_vencimento: vencimento, conta_financeira: ref.conta.ca_id, detalhe_valor: { valor_bruto: v } }] },
    } : null;

    return {
      id: p.id, medico: p.profissional_nome, unidade: p.unidade, a_pagar: Number(p.valor_total ?? 0),
      nf_numero: numero || null, nf_bruto: p.nf_valor_bruto, nf_retencoes: p.nf_retencoes, valor, vencimento, competencia, descricao,
      fornecedor: fornecedor ? { id: fornecedor.ca_id, nome: fornecedor.nome } : null,
      fornecedores_possiveis: cands.length > 1 ? cands.map((c: any) => ({ id: c.ca_id, nome: c.nome })) : undefined,
      categoria: categoria ? { id: categoria.ca_id, nome: categoria.nome, sugerida: !!sugerida } : null,
      centro_custo: ref.centroMed?.nome ?? null, conta: ref.conta?.nome ?? null,
      ja_lancado: !!p.ca_evento_id, problemas, avisos, payload,
    };
  });
  return { ref, itens };
}

// ── contas a receber: nota emitida pela GSS ───────────────────────────────
async function registrarNfEmitida(svc: Svc, path: string, nome: string, usuario: string | null) {
  const bytes = await baixar(svc, path);
  if (!bytes) return { ok: false, error: "arquivo_nao_encontrado" };
  const n = await lerNfse(bytes, []);
  if (!n.legivel) return { ok: false, error: "arquivo_sem_texto", detalhe: "PDF sem texto (escaneado). Use o arquivo original da nota." };
  // mesmo recurso da nota do médico: sugestão para layout que a regra não lê, sempre para conferir
  const sug = !n.impostosLidos ? await leituraAssistida(await textoPdf(bytes)) : null;
  const assistida = !!sug && (n.valor == null || Math.abs(sug.valor - n.valor) <= 0.01);
  if (assistida && sug) {
    n.valor = n.valor ?? sug.valor; n.numero = n.numero ?? sug.numero;
    n.totalRetencoes = sug.totalRetencoes; n.valorLiquido = sug.valorLiquido;
    n.irrf = sug.irrf; n.contribSociais = sug.contribSociais; n.inssRetido = sug.inssRetido; n.issRetido = sug.issRetido;
  }

  let status = "vinculada"; const motivos: string[] = [];
  if (n.prestadorCnpj !== CNPJ_GSS) { status = "conferir"; motivos.push("A GSS não é a prestadora desta nota."); }
  if (n.chave) {
    const { data: ja } = await svc.from("financeiro_nf_emitidas").select("id, numero_nota").eq("chave_acesso", n.chave).maybeSingle();
    if (ja) return { ok: true, duplicada: true, id: ja.id, numero_nota: ja.numero_nota };
  }
  let clienteId: string | null = null, contratoId: string | null = null;
  if (n.tomadorCnpj) {
    const { data: clientes } = await svc.from("clientes").select("id, cnpj");
    clienteId = (clientes ?? []).find((c: any) => dig(c.cnpj) === n.tomadorCnpj)?.id ?? null;
  }
  if (!clienteId) { status = "conferir"; motivos.push("Cliente (CNPJ do tomador) não está cadastrado no Sigma."); }
  else {
    const { data: contratos } = await svc.from("contratos").select("id, status_contrato").eq("cliente_id", clienteId);
    const ativos = (contratos ?? []).filter((c: any) => c.status_contrato === "Ativo");
    const cands = ativos.length ? ativos : (contratos ?? []);
    if (cands.length === 1) contratoId = cands[0].id;
    else { status = "conferir"; motivos.push(cands.length ? `Cliente com ${cands.length} contratos: escolher o contrato.` : "Cliente sem contrato no Sigma."); }
  }
  if (!n.impostosLidos) { status = "conferir"; motivos.push(assistida ? "Impostos lidos por leitura assistida: confira o valor líquido." : "Impostos retidos não lidos: informar o valor líquido."); }

  // contas a receber já previsto para o contrato naquele mês (gerado a partir do contrato)
  let receberId: string | null = null, vencimento: string | null = null;
  const comp = n.competencia ?? n.emissao;
  if (contratoId && comp) {
    const { data: rec } = await svc.from("financeiro_receber").select("id, data_prevista")
      .eq("contrato_id", contratoId).eq("ano_referencia", Number(comp.slice(0, 4))).eq("mes_referencia", Number(comp.slice(5, 7))).limit(1).maybeSingle();
    if (rec) { receberId = rec.id; vencimento = rec.data_prevista ?? null; }
  }
  const { data: nova, error } = await svc.from("financeiro_nf_emitidas").insert({
    arquivo_path: path, arquivo_nome: nome, chave_acesso: n.chave, numero_nota: n.numero, emissao: n.emissao, competencia: n.competencia,
    tomador_cnpj: n.tomadorCnpj, tomador_nome: n.tomadorNome, cliente_id: clienteId, contrato_id: contratoId, receber_id: receberId,
    valor_bruto: n.valor, total_retencoes: (n.impostosLidos || assistida) ? n.totalRetencoes : null, valor_liquido: (n.impostosLidos || assistida) ? n.valorLiquido : null,
    irrf: n.irrf, contrib_sociais: n.contribSociais, inss_retido: n.inssRetido, iss_retido: n.issRetido, impostos_lidos: n.impostosLidos,
    descricao: n.descricao, vencimento, status, motivo: motivos.join(" ") || null, created_by: usuario,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  // só marca o "a receber" como faturado quando a nota está inteira e ligada: nota com
  // pendência (prestador errado, contrato em dúvida, impostos não lidos) não mexe em nada
  if (receberId && n.valor != null && status === "vinculada") {
    await svc.from("financeiro_receber").update({ valor_faturado: n.valor, status: "faturado", nf_saida_status: "emitida", updated_at: new Date().toISOString() }).eq("id", receberId);
  }
  return { ok: true, id: nova.id, status, motivo: motivos.join(" ") || null, numero_nota: n.numero, valor_bruto: n.valor, valor_liquido: n.valorLiquido, cliente_encontrado: !!clienteId, contrato_definido: !!contratoId };
}

async function montarReceber(svc: Svc, ids: string[]) {
  const ref = await referencias(svc);
  const { data: notas } = await svc.from("financeiro_nf_emitidas").select("*").in("id", ids);
  const contratoIds = [...new Set((notas ?? []).map((n: any) => n.contrato_id).filter(Boolean))];
  const { data: vinc } = contratoIds.length
    ? await svc.from("contaazul_vinculos").select("contrato_id, tipo, ca_id, ca_nome, status").in("contrato_id", contratoIds).eq("tipo", "centro_receita").neq("status", "rejeitado")
    : { data: [] as any[] };
  const itens = [];
  for (const n of notas ?? []) {
    const problemas: string[] = [], avisos: string[] = [];
    if (n.ca_evento_id) problemas.push("Já lançada no Conta Azul.");
    if (!n.contrato_id) problemas.push("Nota sem contrato definido.");
    // cliente repetido é raro; havendo mais de um, vale o cadastro com perfil de cliente
    const clis = n.tomador_cnpj ? (ref.pessoasPorDoc.get(n.tomador_cnpj) ?? []) : [];
    const cliente = clis.find((c: any) => JSON.stringify(c.dados?.perfis ?? "").includes("Cliente")) ?? clis[0] ?? null;
    if (!cliente) problemas.push("Cliente não cadastrado no Conta Azul com este CNPJ.");
    const valor = n.valor_liquido != null ? Number(n.valor_liquido) : null;
    if (valor == null || !(valor > 0)) problemas.push("Valor líquido não definido.");
    if (!n.vencimento) problemas.push("Vencimento não definido.");
    // categoria de receita: a mais usada para este cliente no histórico do Conta Azul
    let categoria: any = null;
    if (cliente) {
      const { data: hist } = await svc.from("contaazul_lancamentos").select("categoria_id, categoria_nome")
        .eq("tipo", "RECEITA").eq("pessoa_id", cliente.ca_id).not("categoria_id", "is", null).order("data_vencimento", { ascending: false }).limit(60);
      const cont = new Map<string, { n: number; nome: string }>();
      for (const h of hist ?? []) if (/receita/i.test(h.categoria_nome || "")) cont.set(h.categoria_id, { n: (cont.get(h.categoria_id)?.n ?? 0) + 1, nome: h.categoria_nome });
      const top = [...cont.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      if (top) categoria = { ca_id: top[0], nome: top[1].nome };
    }
    if (!categoria) problemas.push("Sem histórico de receita deste cliente no Conta Azul para definir a categoria.");
    else avisos.push("Categoria definida pelo histórico deste cliente no Conta Azul.");
    const centro = (vinc ?? []).find((v: any) => v.contrato_id === n.contrato_id);
    if (!centro) avisos.push("Contrato sem centro de custo ligado: o lançamento sai sem centro.");
    if (!ref.conta) problemas.push("Conta financeira não encontrada.");
    const comp = n.competencia ?? n.emissao ?? iso(new Date());
    const descricao = `NF ${n.numero_nota ?? "S/N"} ${String(n.tomador_nome ?? "").slice(0, 60)} REF. ${MESES[Number(comp.slice(5, 7)) - 1]} (BRUTO ${brl(n.valor_bruto)})`.replace(/\s+/g, " ").trim();
    const v = valor ?? 0;
    const payload = (cliente && categoria && ref.conta && v > 0 && n.vencimento && n.contrato_id) ? {
      descricao, data_competencia: comp, valor: v, conta_financeira: ref.conta.ca_id, id_cliente: cliente.ca_id,
      observacao: `Lançado pelo Sigma a partir da nota emitida. Bruto ${brl(n.valor_bruto)}, retenções ${brl(n.total_retencoes)}.`,
      referencia_externa: `sigma-nfe-${n.id}`,
      rateio: [{ id_categoria: categoria.ca_id, valor: v, ...(centro ? { rateio_centro_custo: [{ id_centro_custo: centro.ca_id, valor: v }] } : {}) }],
      condicao_pagamento: { parcelas: [{ descricao, data_vencimento: n.vencimento, conta_financeira: ref.conta.ca_id, detalhe_valor: { valor_bruto: v } }] },
    } : null;
    itens.push({
      id: n.id, numero_nota: n.numero_nota, cliente: n.tomador_nome, valor_bruto: n.valor_bruto, retencoes: n.total_retencoes, valor,
      vencimento: n.vencimento, descricao, categoria: categoria?.nome ?? null, centro_custo: centro?.ca_nome ?? null, conta: ref.conta?.nome ?? null,
      ja_lancada: !!n.ca_evento_id, problemas, avisos, payload,
    });
  }
  return { ref, itens };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    // verify_jwt fica LIGADO nesta função: o gateway já validou a assinatura do token
    const auth = req.headers.get("Authorization") || "";
    const papelToken = (() => {
      try { return JSON.parse(atob((auth.replace(/^Bearer\s+/i, "").split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")))?.role; } catch { return null; }
    })();
    let usuario: string | null = null;
    if (papelToken !== "service_role") {
      const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await u.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      if (!(papeis ?? []).some((p: any) => PAPEIS.includes(p.role))) return json({ ok: false, error: "sem_permissao" }, 403);
      usuario = user.id;
    }
    const input = await req.json().catch(() => ({}));
    const acao = String(input.acao || "");
    const ids: string[] = Array.isArray(input.pagamento_ids) ? input.pagamento_ids.slice(0, 300) : [];

    if (acao === "conferir") {
      const { data: pags } = await svc.from("financeiro_pagamentos")
        .select("id, medico_id, valor_total, nf_arquivo_path, nf_conferencia_status").in("id", ids);
      const resultados = [];
      for (const p of pags ?? []) resultados.push(await conferirPagamento(svc, p));
      return json({ ok: true, resultados });
    }

    if (acao === "aceitar_nota") {
      const { error } = await svc.from("financeiro_pagamentos")
        .update({ nf_conferencia_status: "aceita", nf_aceita_por: usuario, ...(input.valor_liquido != null ? { nf_valor_liquido: Number(input.valor_liquido) } : {}), ...(input.nf_numero ? { nf_numero: String(input.nf_numero) } : {}) })
        .eq("id", String(input.pagamento_id || ""));
      if (error) throw error;
      return json({ ok: true });
    }

    if (acao === "categorias") {
      const ref = await referencias(svc);
      return json({ ok: true, categorias: ref.categoriasMed.map((c: any) => ({ id: c.ca_id, nome: c.nome })), escrita: ref.escrita, conta: ref.conta?.nome ?? null, centro: ref.centroMed?.nome ?? null });
    }

    if (acao === "definir_categoria") {
      const ref = await referencias(svc);
      const cat = ref.categoriasMed.find((c: any) => c.ca_id === String(input.categoria_id || ""));
      const unidade = String(input.unidade || "").trim();
      if (!cat || !unidade) return json({ ok: false, error: "dados_invalidos" }, 400);
      const { error } = await svc.from("contaazul_unidade_categoria").upsert({ unidade, categoria_id: cat.ca_id, categoria_nome: cat.nome, origem: "manual", definido_por: usuario, atualizado_em: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (acao === "previa" || acao === "lancar") {
      const { ref, itens } = await montarPagar(svc, ids, input.ajustes ?? {});
      const resposta = (extra: Record<string, unknown> = {}) => json({
        ok: true, escrita_ligada: ref.escrita, ...extra,
        itens: itens.map(({ payload, ...resto }: any) => ({ ...resto, pronto: !!payload && !resto.problemas.length, ...(input.mostrar_payload ? { payload } : {}) })),
      });
      if (acao === "previa") return resposta();

      if (input.confirmar !== true) return json({ ok: false, error: "confirmacao_ausente" }, 400);
      if (!ref.escrita) return json({ ok: false, error: "escrita_desligada", detalhe: "O envio ao Conta Azul está desligado. A prévia mostra o que seria lançado." }, 409);
      const resultados = [];
      for (const it of itens) {
        if (!it.payload || it.problemas.length) { resultados.push({ id: it.id, ok: false, erro: it.problemas.join(" ") || "lançamento incompleto" }); continue; }
        // trava: só um envio por pagamento, mesmo com dois cliques ou duas abas
        const { data: trava } = await svc.from("financeiro_pagamentos").update({ ca_erro: "enviando" })
          .eq("id", it.id).is("ca_evento_id", null).or("ca_erro.is.null,ca_erro.neq.enviando").select("id");
        if (!trava?.length) { resultados.push({ id: it.id, ok: false, erro: "já lançado ou em envio" }); continue; }
        try {
          const criado = await ca(svc, "/v1/financeiro/contas-a-pagar", { method: "POST", body: JSON.stringify(it.payload) });
          const parcela = criado?.condicao_pagamento?.parcelas?.[0];
          await svc.from("financeiro_pagamentos").update({
            ca_evento_id: String(criado?.id ?? ""), ca_parcela_id: parcela?.id ? String(parcela.id) : null,
            ca_lancado_em: new Date().toISOString(), ca_lancado_por: usuario, ca_vencimento: it.vencimento, ca_valor: it.valor,
            ca_payload: it.payload, ca_erro: null,
          }).eq("id", it.id);
          // a categoria que deu certo vira a regra da unidade
          if (it.unidade && it.categoria) {
            await svc.from("contaazul_unidade_categoria").upsert({ unidade: it.unidade, categoria_id: it.categoria.id, categoria_nome: it.categoria.nome, origem: it.categoria.sugerida ? "sugestao" : "manual", definido_por: usuario, atualizado_em: new Date().toISOString() });
          }
          resultados.push({ id: it.id, ok: true, ca_evento_id: criado?.id ?? null });
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 300);
          await svc.from("financeiro_pagamentos").update({ ca_erro: msg }).eq("id", it.id);
          resultados.push({ id: it.id, ok: false, erro: msg });
        }
      }
      return json({ ok: true, lancados: resultados.filter((r) => r.ok).length, erros: resultados.filter((r) => !r.ok).length, resultados });
    }

    // ── baixa: pagamento já comprovado no Sigma vira baixa da parcela no Conta Azul ──
    // Só vale para o que o próprio Sigma lançou (é ele que guarda o id da parcela). Diferente da
    // conta a pagar, a baixa pode ser excluída depois pela integração; mesmo assim passa pela
    // prévia e respeita o envio desligado.
    if (acao === "baixa_previa" || acao === "baixa_lancar") {
      const ref = await referencias(svc);
      const METODOS = ["PIX_PAGAMENTO_INSTANTANEO", "TRANSFERENCIA_BANCARIA", "BOLETO_BANCARIO", "DEPOSITO_BANCARIO", "OUTRO"];
      const { data: pags } = await svc.from("financeiro_pagamentos")
        .select("id, profissional_nome, unidade, status, data_pagamento, valor_total, ca_parcela_id, ca_valor, ca_baixa_id, ca_baixa_erro")
        .in("id", ids);
      const itens = (pags ?? []).map((p: any) => {
        const aj = (input.ajustes ?? {})[p.id] ?? {};
        const data = /^\d{4}-\d{2}-\d{2}$/.test(String(aj.data || "")) ? String(aj.data) : (p.data_pagamento ?? null);
        const metodo = METODOS.includes(aj.metodo) ? aj.metodo : METODOS[0];
        const valor = p.ca_valor != null ? Number(p.ca_valor) : null;
        const problemas: string[] = [];
        if (!p.ca_parcela_id) problemas.push("Este pagamento não foi lançado no Conta Azul pelo Sigma.");
        if (p.status !== "pago") problemas.push("Ainda não consta como pago no Sigma: falta o comprovante.");
        if (!data) problemas.push("Sem data de pagamento.");
        if (!ref.conta) problemas.push("Conta financeira não encontrada no Conta Azul.");
        const jaBaixado = !!p.ca_baixa_id;
        const payload = !problemas.length && !jaBaixado ? {
          data_pagamento: data, composicao_valor: { valor_bruto: valor }, conta_financeira: ref.conta!.ca_id,
          metodo_pagamento: metodo, observacao: `Baixa pelo Sigma (sigma-pag-${p.id})`,
        } : null;
        return {
          id: p.id, medico: p.profissional_nome, unidade: p.unidade, valor, data, metodo, conta: ref.conta?.nome ?? null,
          ja_baixado: jaBaixado, baixa_lida_do_conta_azul: p.ca_baixa_id === "no-conta-azul",
          erro_anterior: p.ca_baixa_erro && p.ca_baixa_erro !== "enviando" ? p.ca_baixa_erro : null,
          problemas: jaBaixado ? [] : problemas, pronto: !!payload, parcela: p.ca_parcela_id, payload,
        };
      });
      const semPayload = itens.map(({ payload: _p, parcela: _q, ...r }: any) => r);
      if (acao === "baixa_previa") return json({ ok: true, escrita_ligada: ref.escrita, metodos: METODOS, itens: semPayload });

      if (input.confirmar !== true) return json({ ok: false, error: "confirmacao_ausente" }, 400);
      if (!ref.escrita) return json({ ok: false, error: "escrita_desligada", detalhe: "O envio ao Conta Azul está desligado. A prévia mostra a baixa que seria dada." }, 409);
      const resultados = [];
      for (const it of itens) {
        if (!it.payload) { resultados.push({ id: it.id, ok: false, erro: it.ja_baixado ? "baixa já dada" : it.problemas.join(" ") }); continue; }
        const { data: trava } = await svc.from("financeiro_pagamentos").update({ ca_baixa_erro: "enviando" })
          .eq("id", it.id).is("ca_baixa_id", null).or("ca_baixa_erro.is.null,ca_baixa_erro.neq.enviando").select("id");
        if (!trava?.length) { resultados.push({ id: it.id, ok: false, erro: "baixa já dada ou em envio" }); continue; }
        try {
          const criada = await ca(svc, `/v1/financeiro/eventos-financeiros/parcelas/${it.parcela}/baixa`, { method: "POST", body: JSON.stringify(it.payload) });
          await svc.from("financeiro_pagamentos").update({
            ca_baixa_id: String(criada?.id ?? "criada"), ca_baixa_em: new Date().toISOString(), ca_baixa_por: usuario, ca_baixa_erro: null,
          }).eq("id", it.id);
          resultados.push({ id: it.id, ok: true });
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 300);
          await svc.from("financeiro_pagamentos").update({ ca_baixa_erro: msg }).eq("id", it.id);
          resultados.push({ id: it.id, ok: false, erro: msg });
        }
      }
      return json({ ok: true, baixados: resultados.filter((r) => r.ok).length, erros: resultados.filter((r) => !r.ok).length, resultados });
    }

    if (acao === "nf_emitida_registrar") {
      const path = String(input.arquivo_path || "");
      if (!path.startsWith("nf-emitidas/")) return json({ ok: false, error: "caminho_invalido" }, 400);
      return json(await registrarNfEmitida(svc, path, String(input.arquivo_nome || path.split("/").pop()), usuario));
    }

    if (acao === "nf_emitida_atualizar") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["contrato_id", "vencimento", "valor_liquido", "status", "recebido_em"]) if (input[k] !== undefined) patch[k] = input[k];
      // escolher o contrato resolve a pendência de "vários contratos", não as outras
      if (patch.contrato_id && input.status === undefined) {
        const { data: atual } = await svc.from("financeiro_nf_emitidas").select("motivo, valor_liquido").eq("id", String(input.id || "")).maybeSingle();
        const resto = String(atual?.motivo || "").split(/(?<=\.)\s+/).filter((m) => m && !/contrato/i.test(m)).join(" ");
        patch.motivo = resto || null;
        if (!resto) patch.status = "vinculada";
      }
      const { error } = await svc.from("financeiro_nf_emitidas").update(patch).eq("id", String(input.id || ""));
      if (error) throw error;
      // a nota que ficou inteira agora (contrato escolhido, líquido informado) entra no "a receber"
      // do contrato naquele mês, igual à que já chega resolvida
      const { data: nota } = await svc.from("financeiro_nf_emitidas")
        .select("id, status, contrato_id, receber_id, competencia, emissao, valor_bruto, vencimento").eq("id", String(input.id || "")).maybeSingle();
      const comp = nota?.competencia ?? nota?.emissao;
      if (nota && nota.status === "vinculada" && nota.contrato_id && !nota.receber_id && comp && nota.valor_bruto != null) {
        const { data: rec } = await svc.from("financeiro_receber").select("id, data_prevista")
          .eq("contrato_id", nota.contrato_id).eq("ano_referencia", Number(String(comp).slice(0, 4))).eq("mes_referencia", Number(String(comp).slice(5, 7))).limit(1).maybeSingle();
        if (rec) {
          await svc.from("financeiro_nf_emitidas").update({ receber_id: rec.id, ...(nota.vencimento ? {} : { vencimento: rec.data_prevista ?? null }) }).eq("id", nota.id);
          await svc.from("financeiro_receber").update({ valor_faturado: nota.valor_bruto, status: "faturado", nf_saida_status: "emitida", updated_at: new Date().toISOString() }).eq("id", rec.id);
        }
      }
      return json({ ok: true });
    }

    // recebimento da nota: data e valor que entraram de fato. Reflete no "a receber" do contrato.
    if (acao === "nf_emitida_receber" || acao === "nf_emitida_desfazer_recebimento") {
      const { data: nota } = await svc.from("financeiro_nf_emitidas")
        .select("id, status, receber_id, valor_liquido, valor_bruto, ca_evento_id, contrato_id").eq("id", String(input.id || "")).maybeSingle();
      if (!nota) return json({ ok: false, error: "nota_nao_encontrada" }, 404);
      const agora = new Date().toISOString();
      if (acao === "nf_emitida_desfazer_recebimento") {
        if (nota.status !== "recebida") return json({ ok: false, error: "nota_nao_recebida" }, 409);
        await svc.from("financeiro_nf_emitidas").update({
          status: nota.ca_evento_id ? "lancada" : nota.contrato_id ? "vinculada" : "conferir",
          recebido_em: null, valor_recebido: null, recebido_por: null, updated_at: agora,
        }).eq("id", nota.id);
        if (nota.receber_id) await svc.from("financeiro_receber").update({ status: "faturado", data_recebimento: null, valor_recebido: null, updated_at: agora }).eq("id", nota.receber_id);
        return json({ ok: true });
      }
      const data = String(input.recebido_em || "");
      const valor = Number(input.valor_recebido);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ ok: false, error: "data_invalida", detalhe: "Informe a data do recebimento." }, 400);
      if (!Number.isFinite(valor) || valor <= 0) return json({ ok: false, error: "valor_invalido", detalhe: "Informe o valor recebido." }, 400);
      if (nota.status === "descartada") return json({ ok: false, error: "nota_descartada" }, 409);
      await svc.from("financeiro_nf_emitidas").update({ status: "recebida", recebido_em: data, valor_recebido: valor, recebido_por: usuario, updated_at: agora }).eq("id", nota.id);
      if (nota.receber_id) await svc.from("financeiro_receber").update({ status: "recebido", data_recebimento: data, valor_recebido: valor, updated_at: agora }).eq("id", nota.receber_id);
      return json({ ok: true });
    }

    if (acao === "receber_previa" || acao === "receber_lancar") {
      const nfIds: string[] = Array.isArray(input.ids) ? input.ids.slice(0, 200) : [];
      const { ref, itens } = await montarReceber(svc, nfIds);
      if (acao === "receber_previa") {
        return json({ ok: true, escrita_ligada: ref.escrita, itens: itens.map(({ payload, ...r }) => ({ ...r, pronto: !!payload && !r.problemas.length, ...(input.mostrar_payload ? { payload } : {}) })) });
      }
      if (input.confirmar !== true) return json({ ok: false, error: "confirmacao_ausente" }, 400);
      if (!ref.escrita) return json({ ok: false, error: "escrita_desligada", detalhe: "O envio ao Conta Azul está desligado. A prévia mostra o que seria lançado." }, 409);
      const resultados = [];
      for (const it of itens) {
        if (!it.payload || it.problemas.length) { resultados.push({ id: it.id, ok: false, erro: it.problemas.join(" ") }); continue; }
        const { data: trava } = await svc.from("financeiro_nf_emitidas").update({ ca_erro: "enviando" })
          .eq("id", it.id).is("ca_evento_id", null).or("ca_erro.is.null,ca_erro.neq.enviando").select("id");
        if (!trava?.length) { resultados.push({ id: it.id, ok: false, erro: "já lançada ou em envio" }); continue; }
        try {
          const criado = await ca(svc, "/v1/financeiro/contas-a-receber", { method: "POST", body: JSON.stringify(it.payload) });
          await svc.from("financeiro_nf_emitidas").update({ ca_evento_id: String(criado?.id ?? ""), ca_lancado_em: new Date().toISOString(), ca_payload: it.payload, ca_erro: null, status: "lancada" }).eq("id", it.id);
          resultados.push({ id: it.id, ok: true, ca_evento_id: criado?.id ?? null });
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 300);
          await svc.from("financeiro_nf_emitidas").update({ ca_erro: msg }).eq("id", it.id);
          resultados.push({ id: it.id, ok: false, erro: msg });
        }
      }
      return json({ ok: true, lancados: resultados.filter((r) => r.ok).length, erros: resultados.filter((r) => !r.ok).length, resultados });
    }

    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    console.error("[financeiro-conta-azul]", e);
    return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 500);
  }
});
