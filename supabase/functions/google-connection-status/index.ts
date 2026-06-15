import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authUserId } from '../_shared/google-token.ts'
import { shouldUseDWD, isDWDConfigured, getWorkspaceDomains } from '../_shared/google-sa.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // Public debug probe: returns DWD env config without requiring auth.
  const url = new URL(req.url)
  if (url.searchParams.get('debug') === '1') {
    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    let saParse: string = 'missing'
    let clientEmail: string | null = null
    if (raw) {
      try {
        const j = JSON.parse(raw)
        saParse = 'ok'
        clientEmail = j.client_email ?? null
      } catch (e: any) { saParse = `parse_error: ${e.message}` }
    }
    return new Response(JSON.stringify({
      saParse,
      clientEmail,
      workspaceDomains: getWorkspaceDomains(),
      dwdConfigured: isDWDConfigured(),
      rawDomainEnv: Deno.env.get('GOOGLE_WORKSPACE_DOMAIN') ?? null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  try {
    const userId = await authUserId(req)
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const [{ data: profile }, { data: cfg }, { data: tok }] = await Promise.all([
      service.from('profiles').select('email').eq('id', userId).maybeSingle(),
      service.from('user_google_oauth_config').select('user_id').eq('user_id', userId).maybeSingle(),
      service.from('user_google_calendar_tokens').select('google_email').eq('user_id', userId).maybeSingle(),
    ])
    const email = (profile?.email as string | undefined) ?? null
    const dwdEligible = shouldUseDWD(email)
    if (dwdEligible) {
      return new Response(
        JSON.stringify({
          mode: 'dwd',
          connected: true,
          email,
          hasConfig: true,
          dwdConfigured: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    return new Response(
      JSON.stringify({
        mode: 'oauth',
        connected: !!tok,
        email: tok?.google_email ?? null,
        hasConfig: !!cfg,
        dwdConfigured: isDWDConfigured(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message === 'unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})