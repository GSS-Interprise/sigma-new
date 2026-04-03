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

    // Fetch boolean columns for the target table
    const { data: boolCols } = await supabaseAdmin.rpc('get_boolean_columns', { p_table: table }).maybeSingle()
    
    // Fallback: query information_schema directly
    let booleanColumns: Set<string> = new Set()
    const { data: colInfo } = await supabaseAdmin
      .from('information_schema.columns' as any)
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', table)
      .eq('data_type', 'boolean')
    
    if (colInfo && Array.isArray(colInfo)) {
      for (const c of colInfo) {
        booleanColumns.add((c as any).column_name)
      }
    }

    // Process rows: convert empty strings to null, handle JSON arrays, sanitize booleans
    const processedRows = rows.map(row => {
      const processed: Record<string, unknown> = {}
      for (const [col, val] of Object.entries(row)) {
        if (val === '' || val === undefined) {
          processed[col] = null
        } else if (booleanColumns.has(col)) {
          // Sanitize boolean columns: only accept true/false/t/f/1/0
          const lower = String(val).toLowerCase().trim()
          if (lower === 'true' || lower === 't' || lower === '1') {
            processed[col] = true
          } else if (lower === 'false' || lower === 'f' || lower === '0') {
            processed[col] = false
          } else {
            processed[col] = null
          }
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
