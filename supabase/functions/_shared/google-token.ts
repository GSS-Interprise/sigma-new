import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldUseDWD, getImpersonatedAccessToken } from './google-sa.ts'

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

/**
 * Returns a Google access token for the given SIGMA user.
 * - If the user's email is in the configured Workspace domain, uses Service
 *   Account Domain-Wide Delegation to impersonate the user (no per-user setup).
 * - Otherwise falls back to the user's individual OAuth refresh token.
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  // 1) If the user already has individual OAuth tokens configured, use them.
  //    This lets users with their own Google config bypass DWD entirely.
  const { data: existingTok } = await service
    .from('user_google_calendar_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existingTok) {
    return getValidGoogleAccessToken(userId)
  }

  // 2) Otherwise, try DWD impersonation if the user belongs to the Workspace domain.
  const { data: profile } = await service
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  const email = profile?.email as string | undefined
  if (email && shouldUseDWD(email)) {
    try {
      return await getImpersonatedAccessToken(email)
    } catch (e: any) {
      console.warn('DWD failed, falling back to user OAuth:', e?.message)
      // fall through to per-user refresh token
    }
  }
  return getValidGoogleAccessToken(userId)
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