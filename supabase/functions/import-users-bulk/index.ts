import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: roles } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id)
    if (!roles?.some(r => r.role === 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { users, password } = await req.json() as { users: { id: string; email: string }[]; password?: string }

    if (!Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: 'users array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const tempPassword = password || 'TempPass2026!'
    const results: { email: string; success: boolean; error?: string }[] = []

    for (const u of users) {
      try {
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
          id: u.id,
          email: u.email,
          password: tempPassword,
          email_confirm: true,
        })

        if (createError) {
          results.push({ email: u.email, success: false, error: createError.message })
        } else {
          results.push({ email: u.email, success: true })
        }
      } catch (e) {
        results.push({ email: u.email, success: false, error: (e as Error).message })
      }
    }

    const created = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({ created, failed, total: users.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
