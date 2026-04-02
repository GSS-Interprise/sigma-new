import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailStatusPayload {
  success: boolean
  emailto: string
  id_envio?: string
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload: EmailStatusPayload = await req.json()
    const { success, emailto, id_envio, status } = payload

    if (!emailto) {
      return new Response(
        JSON.stringify({ error: 'Campo emailto é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determina o status final
    const novoStatus = success 
      ? (status || 'enviado')
      : (status || 'reenviar')

    // Monta a query - usa id_envio se disponível, senão busca por email
    let query = supabase
      .from('email_contatos')
      .update({ 
        status: novoStatus,
        data_envio: success ? new Date().toISOString() : null,
        erro: success ? null : 'Falha no envio'
      })

    if (id_envio) {
      query = query.eq('id', id_envio)
    } else {
      query = query.eq('email', emailto)
    }

    const { data, error } = await query.select()

    if (error) {
      console.error('Erro ao atualizar status:', error)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar status', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Status atualizado: ${emailto} -> ${novoStatus}`, data)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Status atualizado para ${novoStatus}`,
        updated: data?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('Erro no callback:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
