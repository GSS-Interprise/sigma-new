import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authUserId } from '../_shared/google-token.ts'
import { shouldUseDWD, isDWDConfigured } from '../_shared/google-sa.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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