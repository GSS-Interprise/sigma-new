import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authUserId, getAccessTokenForUser } from '../_shared/google-token.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const userId = await authUserId(req)
    const { timeMin, timeMax } = await req.json()
    if (!timeMin || !timeMax) {
      return new Response(JSON.stringify({ error: 'missing_range' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const accessToken = await getAccessTokenForUser(userId)
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', new Date(timeMin).toISOString())
    url.searchParams.set('timeMax', new Date(timeMax).toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')

    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const j = await r.json()
    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'google_error', detail: j }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ events: j.items ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    const message = e?.message ?? 'unknown_error'
    if (
      message === 'not_connected' ||
      message === 'no_refresh_token' ||
      message === 'no_config' ||
      message.startsWith('refresh_failed:')
    ) {
      return new Response(JSON.stringify({ events: [], connected: false, needsReauth: true, error: message }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const status = message === 'unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})