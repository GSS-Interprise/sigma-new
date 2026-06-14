import { createClient } from 'npm:@supabase/supabase-js@2'

export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: tok } = await service
    .from('user_google_calendar_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!tok) throw new Error('not_connected')

  const expiresAt = new Date(tok.expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return tok.access_token

  if (!tok.refresh_token) throw new Error('no_refresh_token')

  const { data: cfg } = await service
    .from('user_google_oauth_config')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .maybeSingle()
  if (!cfg) throw new Error('no_config')

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`refresh_failed: ${j.error_description || j.error}`)

  const newExpires = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString()
  await service.from('user_google_calendar_tokens').update({
    access_token: j.access_token,
    expires_at: newExpires,
  }).eq('user_id', userId)

  return j.access_token
}

export async function authUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new Error('unauthorized')
  const token = authHeader.replace('Bearer ', '')
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await sb.auth.getClaims(token)
  if (error || !data?.claims?.sub) throw new Error('unauthorized')
  return data.claims.sub as string
}