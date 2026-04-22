// GET endpoint para o n8n buscar contatos Zap pendentes.
// Auth: header `x-api-key` com secret DISPAROS_ZAP_API_KEY.
// Marca contatos selecionados como 3-TRATANDO (lock atômico) e devolve payload pronto para Evolution.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const LIMITE_POR_DIA = 120

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Use GET' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = req.headers.get('x-api-key')
  const expected = Deno.env.get('DISPAROS_ZAP_API_KEY')
  if (!expected || apiKey !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = new URL(req.url)
    const instancia = url.searchParams.get('instancia') || undefined
    const campanhaPropostaId = url.searchParams.get('campanha_proposta_id') || undefined
    const limiteParam = parseInt(url.searchParams.get('limite') || '50', 10)
    const limite = Math.min(Math.max(isNaN(limiteParam) ? 50 : limiteParam, 1), 200)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Buscar disparos_campanhas ativas (filtro por instância/proposta opcional)
    let campanhasQuery = supabase
      .from('disparos_campanhas')
      .select('id, instancia, texto_ia, proposta_id, campanha_id, campanha_proposta_id, responsavel_nome')
      .eq('ativo', true)
      .not('status', 'in', '(concluido,cancelado)')

    if (instancia) campanhasQuery = campanhasQuery.eq('instancia', instancia)
    if (campanhaPropostaId) campanhasQuery = campanhasQuery.eq('campanha_proposta_id', campanhaPropostaId)

    const { data: campanhas, error: campErr } = await campanhasQuery
    if (campErr) throw campErr
    if (!campanhas || campanhas.length === 0) {
      return new Response(
        JSON.stringify({ contatos: [], total_pendentes: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const campanhaIds = campanhas.map((c) => c.id)

    // 2. Respeitar limite diário por instância: subtrair já enviados hoje
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const hojeISO = hoje.toISOString()

    // Mapa instancia -> capacidade restante hoje
    const capacidadeRestante = new Map<string, number>()
    const instanciasUnicas = Array.from(
      new Set(campanhas.map((c) => c.instancia).filter(Boolean) as string[]),
    )
    for (const inst of instanciasUnicas) {
      const idsDessaInst = campanhas.filter((c) => c.instancia === inst).map((c) => c.id)
      const { count } = await supabase
        .from('disparos_contatos')
        .select('*', { count: 'exact', head: true })
        .in('campanha_id', idsDessaInst)
        .gte('updated_at', hojeISO)
        .in('status', ['3-TRATANDO', '4-ENVIADO'])
      capacidadeRestante.set(inst, Math.max(0, LIMITE_POR_DIA - (count || 0)))
    }

    // 3. Buscar contatos pendentes (1-ENVIAR / 2-REENVIAR), respeitando limite global
    const { data: pendentes, error: pendErr } = await supabase
      .from('disparos_contatos')
      .select('id, campanha_id, campanha_proposta_id, lead_id, nome, telefone_e164, telefone_original, tentativas')
      .in('campanha_id', campanhaIds)
      .in('status', ['1-ENVIAR', '2-REENVIAR'])
      .order('created_at', { ascending: true })
      .limit(limite * 3) // pega extra para filtrar pelo limite diário por instância

    if (pendErr) throw pendErr

    const campanhaById = new Map(campanhas.map((c) => [c.id, c]))
    const selecionados: any[] = []

    for (const p of pendentes || []) {
      if (selecionados.length >= limite) break
      const camp = campanhaById.get(p.campanha_id)
      if (!camp) continue
      const inst = camp.instancia
      if (inst) {
        const cap = capacidadeRestante.get(inst) ?? 0
        if (cap <= 0) continue
        capacidadeRestante.set(inst, cap - 1)
      }
      selecionados.push({ ...p, camp })
    }

    if (selecionados.length === 0) {
      return new Response(
        JSON.stringify({ contatos: [], total_pendentes: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Lock atômico: marcar como 3-TRATANDO e incrementar tentativas
    const ids = selecionados.map((s) => s.id)
    const nowIso = new Date().toISOString()
    const { error: lockErr } = await supabase
      .from('disparos_contatos')
      .update({ status: '3-TRATANDO', updated_at: nowIso })
      .in('id', ids)
    if (lockErr) throw lockErr

    // Incrementar tentativas individualmente (não há increment direto)
    for (const s of selecionados) {
      await supabase
        .from('disparos_contatos')
        .update({ tentativas: (s.tentativas || 0) + 1 })
        .eq('id', s.id)
    }

    // 5. Montar payload (mesmo formato do antigo "iniciar")
    const contatos = selecionados.map((s, idx) => ({
      numero: idx + 1,
      id: s.id,
      campanha_id: s.campanha_id,
      campanha_proposta_id: s.campanha_proposta_id,
      NOME: s.nome,
      TELEFONE: s.telefone_e164,
      TELEFONE_ORIGINAL: s.telefone_original,
      ID_PROPOSTA: s.camp.proposta_id,
      TEXTO_IA: s.camp.texto_ia,
      INSTANCIA: s.camp.instancia,
      RESPONSAVEL: s.camp.responsavel_nome,
      tentativas: (s.tentativas || 0) + 1,
    }))

    return new Response(
      JSON.stringify({
        contatos,
        total_pendentes: contatos.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[disparos-zap-pendentes] erro:', err)
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
