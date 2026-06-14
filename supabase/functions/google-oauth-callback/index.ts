import { createClient } from 'npm:@supabase/supabase-js@2'

const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const html = (title: string, body: string) => new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
      .box{max-width:480px;padding:32px;background:white;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,.08);text-align:center}
      h1{margin:0 0 12px;font-size:20px} p{color:#555}</style></head>
      <body><div class="box"><h1>${title}</h1><p>${body}</p>
      <script>setTimeout(()=>{try{window.close()}catch(e){}},1500)</script></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )

  if (error) return html('Falha na conexão', `Google retornou: ${error}`)
  if (!code || !stateRaw) return html('Erro', 'Parâmetros ausentes.')

  let userId = ''
  try { userId = JSON.parse(atob(stateRaw)).uid } catch { return html('Erro', 'State inválido.') }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: cfg } = await service
    .from('user_google_oauth_config')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .maybeSingle()

  if (!cfg) return html('Erro', 'Configuração OAuth não encontrada.')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) return html('Erro ao obter token', tokens.error_description || JSON.stringify(tokens))

  // Get email
  let email: string | null = null
  try {
    const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json())
    email = ui.email || null
  } catch {}

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  const { error: upErr } = await service.from('user_google_calendar_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
    scope: tokens.scope ?? null,
    google_email: email,
  })
  if (upErr) return html('Erro ao salvar', upErr.message)

  return html('Conectado!', `Google Calendar (${email ?? ''}) conectado. Pode fechar esta janela.`)
})