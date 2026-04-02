import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for optional filters
    let instanceId: string | null = null;
    let limit = 50;
    
    try {
      const body = await req.json();
      instanceId = body.instance_id || null;
      limit = body.limit || 50;
    } catch {
      // No body provided, use defaults
    }

    console.log('🔄 Iniciando sincronização de fotos de contatos...');
    console.log(`   Instance filter: ${instanceId || 'todas'}, Limit: ${limit}`);

    // Fetch contacts without profile pictures (null or empty string)
    let query = supabase
      .from('sigzap_contacts')
      .select(`
        id,
        contact_jid,
        contact_phone,
        contact_name,
        instance_id,
        instance:sigzap_instances(id, name)
      `)
      .or('profile_picture_url.is.null,profile_picture_url.eq.')
      .limit(limit);

    if (instanceId) {
      query = query.eq('instance_id', instanceId);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) {
      console.error('❌ Erro ao buscar contatos:', contactsError);
      throw contactsError;
    }

    if (!contacts || contacts.length === 0) {
      console.log('✅ Nenhum contato sem foto encontrado');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Nenhum contato sem foto encontrado',
        synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📷 Encontrados ${contacts.length} contatos sem foto`);

    let syncedCount = 0;
    let errorCount = 0;
    const results: { contact: string; success: boolean; error?: string }[] = [];

    // Group contacts by instance for efficient API calls
    const contactsByInstance = new Map<string, typeof contacts>();
    
    for (const contact of contacts) {
      const instance = contact.instance as any;
      if (!instance?.name) continue;
      
      const instanceName = instance.name;
      if (!contactsByInstance.has(instanceName)) {
        contactsByInstance.set(instanceName, []);
      }
      contactsByInstance.get(instanceName)!.push(contact);
    }

    // Process each instance
    for (const [instanceName, instanceContacts] of contactsByInstance) {
      console.log(`\n🔄 Processando instância: ${instanceName} (${instanceContacts.length} contatos)`);
      
      for (const contact of instanceContacts) {
        try {
          // Extract phone number from JID (remove @s.whatsapp.net)
          const phone = contact.contact_phone || contact.contact_jid?.replace('@s.whatsapp.net', '').replace('@c.us', '');
          
          if (!phone) {
            console.log(`⚠️ Contato sem telefone: ${contact.id}`);
            continue;
          }

          // Call Evolution API to fetch profile picture
          const apiUrl = `${evolutionUrl}/chat/fetchProfilePictureUrl/${instanceName}`;
          console.log(`   📥 Buscando foto para ${phone}...`);
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey,
            },
            body: JSON.stringify({ number: phone }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.log(`   ⚠️ Erro API (${response.status}): ${errorText.substring(0, 100)}`);
            results.push({ contact: phone, success: false, error: `API error: ${response.status}` });
            errorCount++;
            continue;
          }

          const data = await response.json();
          const profilePictureUrl = data.profilePictureUrl || data.wpiUrl?.eurl || data.imgUrl;

          if (!profilePictureUrl) {
            console.log(`   ⚠️ Contato ${phone} não tem foto de perfil`);
            // Update with empty string to avoid retrying
            await supabase
              .from('sigzap_contacts')
              .update({ profile_picture_url: '', updated_at: new Date().toISOString() })
              .eq('id', contact.id);
            results.push({ contact: phone, success: false, error: 'No profile picture' });
            continue;
          }

          // Update contact with profile picture
          const { error: updateError } = await supabase
            .from('sigzap_contacts')
            .update({ 
              profile_picture_url: profilePictureUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', contact.id);

          if (updateError) {
            console.error(`   ❌ Erro ao atualizar contato ${phone}:`, updateError);
            results.push({ contact: phone, success: false, error: updateError.message });
            errorCount++;
          } else {
            console.log(`   ✅ Foto atualizada para ${contact.contact_name || phone}`);
            results.push({ contact: phone, success: true });
            syncedCount++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (err) {
          console.error(`   ❌ Erro ao processar contato:`, err);
          results.push({ contact: contact.contact_phone || contact.id, success: false, error: String(err) });
          errorCount++;
        }
      }
    }

    console.log(`\n📊 Sincronização concluída: ${syncedCount} atualizados, ${errorCount} erros`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Sincronização concluída`,
      synced: syncedCount,
      errors: errorCount,
      total: contacts.length,
      results: results.slice(0, 20) // Limit results in response
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro na sincronização de fotos:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
