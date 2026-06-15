import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authUserId, getAccessTokenForUser } from '../_shared/google-token.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const userId = await authUserId(req)
    const body = await req.json()
    const { summary, description, start, end, withMeet, attendees, timeZone } = body
    if (!summary || !start || !end) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const accessToken = await getAccessTokenForUser(userId)

    const tz = timeZone || 'America/Sao_Paulo'
    const eventBody: any = {
      summary,
      description: description ?? '',
      start: { dateTime: new Date(start).toISOString(), timeZone: tz },
      end: { dateTime: new Date(end).toISOString(), timeZone: tz },
    }
    if (Array.isArray(attendees) && attendees.length) {
      eventBody.attendees = attendees.map((email: string) => ({ email }))
    }
    if (withMeet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    if (withMeet) url.searchParams.set('conferenceDataVersion', '1')
    url.searchParams.set('sendUpdates', attendees?.length ? 'all' : 'none')

    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    const j = await r.json()
    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'google_error', detail: j }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ event: j }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    const status = e.message === 'unauthorized' ? 401 : e.message === 'not_connected' ? 412 : 500
    return new Response(JSON.stringify({ error: e.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})