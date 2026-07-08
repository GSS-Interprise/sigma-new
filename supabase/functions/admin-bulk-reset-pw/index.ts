import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

Deno.serve(async (req) => {
  const body = await req.json()
  if (body.token !== Deno.env.get('BULK_RESET_TOKEN')) {
    return new Response('forbidden', { status: 403 })
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: list, error: le } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (le) return new Response(JSON.stringify({ error: le.message }), { status: 500 })
  const results: any[] = []
  for (const { email, password } of body.users) {
    const u = list!.users.find((x: any) => x.email?.toLowerCase() === email.toLowerCase())
    if (!u) { results.push({ email, error: 'not found' }); continue }
    const { error } = await supabase.auth.admin.updateUserById(u.id, { password })
    results.push({ email, ok: !error, error: error?.message })
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } })
})
