import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    if (rolesError) throw rolesError

    const allowed = (roles ?? []).some((r) => r.role === 'admin' || r.role === 'gestor_radiologia')
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Função auxiliar para deletar em loop até zerar (contorna limite de 1000 por query)
    async function deleteAllFromTable(tableName: string): Promise<number> {
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        const { count, error } = await supabaseAdmin
          .from(tableName)
          .delete({ count: 'exact' })
          .neq('id', '00000000-0000-0000-0000-000000000000')
          .limit(5000)

        if (error) throw error

        const deleted = count ?? 0
        totalDeleted += deleted
        hasMore = deleted > 0

        console.log(`[radiologia-clear-base] Deleted ${deleted} from ${tableName}, total: ${totalDeleted}`)
      }

      return totalDeleted
    }

    // Ordem importa (evitar FK): comentários -> snapshots -> histórico -> pendências
    console.log('[radiologia-clear-base] Starting full database clear...')

    // Deletar comentários primeiro (FK para pendências)
    const comentarios = await deleteAllFromTable('radiologia_pendencias_comentarios')

    // Deletar snapshots (FK para pendências)
    const snapshots = await deleteAllFromTable('radiologia_pendencias_snapshots')

    // Deletar histórico
    const historico = await deleteAllFromTable('radiologia_imports_historico')

    // Deletar pendências por último
    const pendencias = await deleteAllFromTable('radiologia_pendencias')

    console.log(`[radiologia-clear-base] Complete! Deleted: pendencias=${pendencias}, snapshots=${snapshots}, historico=${historico}, comentarios=${comentarios}`)

    return new Response(
      JSON.stringify({
        pendencias,
        snapshots,
        historico,
        comentarios,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[radiologia-clear-base] error', error)
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
