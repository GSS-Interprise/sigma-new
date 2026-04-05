import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OLD_SUPABASE_URL = 'https://qyapnxtghhdcfafnogii.supabase.co'
const BATCH_SIZE = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { bucket, paths } = await req.json() as { bucket: string; paths: string[] }

    if (!bucket || !Array.isArray(paths) || paths.length === 0) {
      return new Response(
        JSON.stringify({ error: 'bucket (string) e paths (string[]) são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let success = 0
    let failed = 0
    const errors: { path: string; error: string }[] = []

    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map(async (filePath) => {
          const publicUrl = `${OLD_SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`
          const response = await fetch(publicUrl)

          if (!response.ok) {
            throw new Error(`Fetch falhou: ${response.status} ${response.statusText}`)
          }

          const blob = await response.blob()
          const contentType = response.headers.get('content-type') || 'application/octet-stream'

          const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(filePath, blob, {
              contentType,
              upsert: true,
            })

          if (uploadError) {
            throw new Error(uploadError.message)
          }

          return filePath
        })
      )

      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          success++
        } else {
          failed++
          errors.push({ path: batch[j], error: result.reason?.message || 'Erro desconhecido' })
        }
      }
    }

    return new Response(
      JSON.stringify({ success, failed, total: paths.length, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
