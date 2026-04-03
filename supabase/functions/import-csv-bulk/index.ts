import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

// Patterns to detect invalid values for typed columns
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^-?\d+(\.\d+)?$/
const HTML_OR_CSS_RE = /[<>{}]|style\s*=|font-|margin:|padding:|color:|rgb\(|border/i

function isBooleanLike(val: string): boolean {
  const s = val.toLowerCase().trim()
  return ['true', 'false', 't', 'f', '1', '0', 'yes', 'no', ''].includes(s)
}

function parseBool(val: string): boolean | null {
  const s = val.toLowerCase().trim()
  if (s === 'true' || s === 't' || s === '1' || s === 'yes') return true
  if (s === 'false' || s === 'f' || s === '0' || s === 'no') return false
  return null
}

function isValidTimestamp(val: string): boolean {
  if (!val || val.trim() === '') return false
  return ISO_DATE_RE.test(val.trim()) && !HTML_OR_CSS_RE.test(val)
}

function isValidNumeric(val: string): boolean {
  if (!val || val.trim() === '') return false
  return NUMERIC_RE.test(val.trim())
}

function isValidUuid(val: string): boolean {
  if (!val || val.trim() === '') return false
  return UUID_RE.test(val.trim())
}

function isValidJsonb(val: string): boolean {
  if (!val || val.trim() === '') return false
  const trimmed = val.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return true } catch { return false }
  }
  return false
}

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

    // Fetch column types from information_schema via a raw query
    type ColType = { column_name: string; data_type: string }
    const columnTypes = new Map<string, string>()
    
    try {
      const { data: cols, error: colErr } = await supabaseAdmin
        .rpc('get_table_columns', { p_table_name: table }) as { data: ColType[] | null; error: unknown }
      
      if (!colErr && cols) {
        for (const c of cols) {
          columnTypes.set(c.column_name, c.data_type)
        }
      }
    } catch {
      // Fallback: no column type info, use heuristic
    }

    // If RPC not available, use heuristic based on column name patterns
    const getColumnType = (col: string): string => {
      if (columnTypes.has(col)) return columnTypes.get(col)!
      
      const lc = col.toLowerCase()
      if (lc === 'id' || lc.endsWith('_id')) return 'uuid'
      if (lc.startsWith('check_') || lc.startsWith('is_') || lc.startsWith('tem_') || 
          lc.startsWith('has_') || lc.startsWith('pode_') || lc === 'ativo' || lc === 'ativa') return 'boolean'
      if (lc.startsWith('data_') || lc === 'created_at' || lc === 'updated_at' || 
          lc.endsWith('_at') || lc.endsWith('_em')) return 'timestamp with time zone'
      if (lc.startsWith('valor_') || lc === 'total_horas' || lc === 'prazo_meses') return 'numeric'
      if (lc === 'etiquetas' || lc.endsWith('_json') || lc === 'dados_customizados' ||
          lc === 'servicos_contrato' || lc === 'servicos_licitacao') return 'jsonb'
      return 'text'
    }

    const processedRows = rows.map(row => {
      const processed: Record<string, unknown> = {}
      for (const [col, rawVal] of Object.entries(row)) {
        const val = rawVal === undefined ? '' : String(rawVal)
        
        if (val === '' || val === undefined || rawVal === null) {
          processed[col] = null
          continue
        }

        const colType = getColumnType(col)

        switch (colType) {
          case 'boolean':
            processed[col] = parseBool(val)
            break

          case 'timestamp with time zone':
          case 'timestamp without time zone':
          case 'date':
            processed[col] = isValidTimestamp(val) ? val.trim() : null
            break

          case 'numeric':
          case 'integer':
          case 'bigint':
          case 'double precision':
          case 'real':
            processed[col] = isValidNumeric(val) ? val.trim() : null
            break

          case 'uuid':
            processed[col] = isValidUuid(val) ? val.trim() : null
            break

          case 'jsonb':
          case 'json':
            if (isValidJsonb(val)) {
              try { processed[col] = JSON.parse(val.trim()) } catch { processed[col] = null }
            } else {
              processed[col] = null
            }
            break

          case 'ARRAY':
            if (val.startsWith('[') && val.endsWith(']')) {
              try {
                const arr = JSON.parse(val)
                if (Array.isArray(arr)) { processed[col] = arr } else { processed[col] = null }
              } catch { processed[col] = null }
            } else {
              processed[col] = null
            }
            break

          default:
            // text columns - pass as-is
            processed[col] = val
            break
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