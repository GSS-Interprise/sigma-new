import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    let instanceId: string | null = null;
    let limit = 10; // Reduced default to avoid timeout
    let contactIds: string[] = [];
    
    try {
      const body = await req.json();
      instanceId = body.instance_id || null;
      limit = Math.min(body.limit || 10, 15); // Cap at 15 to stay under 150s
      contactIds = Array.isArray(body.contact_ids)
        ? body.contact_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : [];
    } catch {
      // No body provided, use defaults
    }

    console.log(`🔄 Sync fotos: instance=${instanceId || 'todas'}, ids=${contactIds.length}, limit=${limit}`);

    let query = supabase
      .from('sigzap_contacts')
      .select(`id, contact_jid, contact_phone, contact_name, instance_id, instance:sigzap_instances(id, name)`)
      .or('profile_picture_url.is.null,profile_picture_url.eq.')
      .limit(limit);

    if (contactIds.length > 0) {
      query = query.in('id', contactIds);
    } else if (instanceId) {
      query = query.eq('instance_id', instanceId);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) throw contactsError;

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhum contato sem foto', synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📷 ${contacts.length} contatos sem foto`);

    let syncedCount = 0;
    let errorCount = 0;
    const results: { contact: string; success: boolean; error?: string }[] = [];

    // Group by instance
    const contactsByInstance = new Map<string, typeof contacts>();
    for (const contact of contacts) {
      const instance = contact.instance as any;
      if (!instance?.name) continue;
      const name = instance.name;
      if (!contactsByInstance.has(name)) contactsByInstance.set(name, []);
      contactsByInstance.get(name)!.push(contact);
    }

    for (const [instanceName, instanceContacts] of contactsByInstance) {
      // Process contacts in parallel batches of 3
      for (let i = 0; i < instanceContacts.length; i += 3) {
        const batch = instanceContacts.slice(i, i + 3);
        const promises = batch.map(async (contact) => {
          try {
            const phone = contact.contact_phone || contact.contact_jid?.replace('@s.whatsapp.net', '').replace('@c.us', '');
            if (!phone) return;

            const response = await fetch(`${evolutionUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
              body: JSON.stringify({ number: phone }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              results.push({ contact: phone, success: false, error: `API ${response.status}` });
              errorCount++;
              return;
            }

            const data = await response.json();
            const profilePictureUrl = data.profilePictureUrl || data.wpiUrl?.eurl || data.imgUrl;

            if (!profilePictureUrl) {
              await supabase.from('sigzap_contacts')
                .update({ profile_picture_url: '', updated_at: new Date().toISOString() })
                .eq('id', contact.id);
              results.push({ contact: phone, success: false, error: 'No profile picture' });
              return;
            }

            const { error: updateError } = await supabase.from('sigzap_contacts')
              .update({ profile_picture_url: profilePictureUrl, updated_at: new Date().toISOString() })
              .eq('id', contact.id);

            if (updateError) {
              results.push({ contact: phone, success: false, error: updateError.message });
              errorCount++;
            } else {
              results.push({ contact: phone, success: true });
              syncedCount++;
            }
          } catch (err) {
            results.push({ contact: contact.contact_phone || contact.id, success: false, error: String(err) });
            errorCount++;
          }
        });

        await Promise.all(promises);
      }
    }

    console.log(`📊 Concluído: ${syncedCount} ok, ${errorCount} erros`);

    return new Response(JSON.stringify({
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: contacts.length,
      results: results.slice(0, 20),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro sync fotos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
