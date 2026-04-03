import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { table, rows, key } = await req.json() as {
      table: string
      rows: Record<string, unknown>[]
      key: string
    }

    if (key !== 'sigma2026') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!table || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'table and rows are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sanitize table name to prevent injection
    const validTable = /^[a-z_][a-z0-9_]*$/i
    if (!validTable.test(table)) {
      return new Response(
        JSON.stringify({ error: 'Invalid table name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Process rows: convert empty strings to null, handle JSON arrays
    const processedRows = rows.map(row => {
      const processed: Record<string, unknown> = {}
      for (const [col, val] of Object.entries(row)) {
        if (val === '' || val === undefined) {
          processed[col] = null
        } else if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
          try {
            const arr = JSON.parse(val)
            if (Array.isArray(arr)) {
              processed[col] = arr
            } else {
              processed[col] = val
            }
          } catch {
            processed[col] = val
          }
        } else {
          processed[col] = val
        }
      }
      return processed
    })

    const { data, error } = await supabaseAdmin
      .from(table)
      .upsert(processedRows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message, details: error.details, hint: error.hint }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, inserted: processedRows.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
