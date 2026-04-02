import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

interface EmailReplyPayload {
  from_email: string;
  from_name?: string;
  subject: string;
  text_content: string;
  html_content?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: EmailReplyPayload = await req.json();
    const { from_email, from_name, subject, text_content } = payload;

    console.log('Processing email reply:', { from_email, subject });

    // Extrair disparoId do assunto usando regex
    const disparoIdMatch = subject.match(/\[SIGMA-([A-Z0-9]+)\]/i);
    const disparoId = disparoIdMatch ? disparoIdMatch[1] : null;

    // Buscar disparo original
    let disparoLog = null;
    let disparoProgramado = null;

    if (disparoId) {
      const { data: logData } = await supabase
        .from('disparos_log')
        .select('*')
        .eq('id', disparoId)
        .single();
      disparoLog = logData;

      if (!disparoLog) {
        const { data: progData } = await supabase
          .from('disparos_programados')
          .select('*')
          .eq('id', disparoId)
          .single();
        disparoProgramado = progData;
      }
    }

    // Tentar encontrar médico pelo email
    const { data: medico } = await supabase
      .from('medicos')
      .select('id, nome_completo, especialidade, estado')
      .eq('email', from_email)
      .single();

    // Registrar resposta na tabela email_respostas
    const { data: respostaData, error: respostaError } = await supabase
      .from('email_respostas')
      .insert({
        disparo_log_id: disparoLog?.id || null,
        disparo_programado_id: disparoProgramado?.id || null,
        remetente_email: from_email,
        remetente_nome: from_name || from_email,
        conteudo_resposta: text_content,
        data_resposta: new Date().toISOString(),
        medico_id: medico?.id || null,
        especialidade: medico?.especialidade?.[0] || disparoLog?.especialidade || null,
        localidade: medico?.estado || disparoLog?.estado || null,
        status_lead: 'novo'
      })
      .select()
      .single();

    if (respostaError) {
      console.error('Error inserting email response:', respostaError);
      throw respostaError;
    }

    // Verificar se já existe lead no Kanban para este email
    const { data: existingLead } = await supabase
      .from('captacao_leads')
      .select('id')
      .eq('email', from_email)
      .single();

    if (existingLead) {
      // Atualizar lead existente
      const { error: updateError } = await supabase
        .from('captacao_leads')
        .update({
          status: 'respondidos',
          ultima_resposta_recebida: text_content,
          data_ultimo_contato: new Date().toISOString(),
          email_resposta_id: respostaData.id
        })
        .eq('id', existingLead.id);

      if (updateError) {
        console.error('Error updating captacao lead:', updateError);
      }
    } else {
      // Criar novo lead no Kanban
      const { error: leadError } = await supabase
        .from('captacao_leads')
        .insert({
          nome: from_name || from_email,
          email: from_email,
          especialidade: medico?.especialidade?.[0] || disparoLog?.especialidade || null,
          uf: medico?.estado || disparoLog?.estado || null,
          status: 'respondidos',
          ultima_resposta_recebida: text_content,
          data_ultimo_contato: new Date().toISOString(),
          disparo_log_id: disparoLog?.id || null,
          disparo_programado_id: disparoProgramado?.id || null,
          email_resposta_id: respostaData.id,
          medico_id: medico?.id || null
        });

      if (leadError) {
        console.error('Error creating captacao lead:', leadError);
      }
    }

    // Se não encontrou médico, criar lead na tabela leads
    if (!medico) {
      const { error: leadInsertError } = await supabase
        .from('leads')
        .insert({
          nome: from_name || from_email,
          phone_e164: '+00000000000', // Placeholder
          email: from_email,
          especialidade: disparoLog?.especialidade || null,
          uf: disparoLog?.estado || null,
          origem: 'resposta_email',
          status: 'Respondeu'
        });

      if (leadInsertError && !leadInsertError.message.includes('duplicate')) {
        console.error('Error creating lead:', leadInsertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email reply processed successfully',
        lead_created: !medico
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error: any) {
    console.error('Error processing email reply:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
