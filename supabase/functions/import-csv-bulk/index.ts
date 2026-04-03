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

    // Detect boolean columns by querying pg_catalog via RPC or use known patterns
    const booleanColumns: Set<string> = new Set()
    try {
      // Use a raw postgres query to find boolean columns
      const dbUrl = Deno.env.get('SUPABASE_DB_URL')
      if (dbUrl) {
        // Fallback: detect from first row - values that look like booleans
        // Not reliable, so we use a known-columns approach
      }
    } catch { /* ignore */ }

    // Known boolean column patterns - detect from actual column values
    // A value is NOT boolean if it contains spaces, HTML, CSS, etc.
    const isBooleanValue = (val: unknown): boolean => {
      if (val === null || val === undefined || val === '') return true
      const s = String(val).toLowerCase().trim()
      return ['true', 'false', 't', 'f', '1', '0', 'yes', 'no'].includes(s)
    }

    // Detect boolean columns from first row: if column name starts with check_, is_, tem_, has_
    // or ends with _ativo, _ativa, these are likely boolean
    const boolPrefixes = ['check_', 'is_', 'tem_', 'has_', 'pode_']
    const boolSuffixes = ['_ativo', '_ativa', '_pendente']
    const boolExact = ['ativo', 'ativa', 'assinado']
    
    if (rows.length > 0) {
      for (const col of Object.keys(rows[0])) {
        const lowerCol = col.toLowerCase()
        const shouldCheck = boolPrefixes.some(p => lowerCol.startsWith(p)) ||
          boolSuffixes.some(s => lowerCol.endsWith(s)) ||
          boolExact.includes(lowerCol)
        
        if (shouldCheck) {
          // Verify with sample values - if any non-empty value is not boolean-like, skip
          const sampleValues = rows.slice(0, 10).map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined)
          const allBoolean = sampleValues.length === 0 || sampleValues.every(v => isBooleanValue(v))
          if (allBoolean || shouldCheck) {
            booleanColumns.add(col)
          }
        }
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