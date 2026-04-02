import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get the user from the request
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if user is admin
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    
    const isAdmin = userRoles?.some(r => r.role === 'admin')
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only admins can manage roles' }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { userId, roles } = await req.json()

    if (!userId || !Array.isArray(roles)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Delete existing roles
    console.log('Deleting existing roles for user:', userId)
    const { error: deleteError } = await supabaseClient
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return new Response(
        JSON.stringify({ error: `Erro ao remover roles: ${deleteError.message}` }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Insert new roles
    if (roles.length > 0) {
      console.log('Inserting roles:', roles, 'for user:', userId)
      const rolesToInsert = roles.map(role => ({
        user_id: userId,
        role: role
      }))

      const { error: insertError } = await supabaseClient
        .from('user_roles')
        .insert(rolesToInsert)

      if (insertError) {
        console.error('Insert error:', insertError)
        return new Response(
          JSON.stringify({ error: `Erro ao adicionar roles: ${insertError.message}` }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    console.log('Roles updated successfully for user:', userId)
    return new Response(
      JSON.stringify({ success: true, message: 'Roles updated successfully' }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
