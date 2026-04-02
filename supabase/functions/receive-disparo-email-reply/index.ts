import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Payload esperado do n8n
interface EmailReplyPayload {
  email_lead: string;      // Email do médico que respondeu
  message_reply: string;   // Conteúdo da resposta
  data_recebida: string;   // Data/hora do recebimento
  status: string;          // Status (ex: "enviado")
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: EmailReplyPayload = await req.json();
    console.log('📧 Resposta de email recebida:', payload);

    // Validar campos obrigatórios
    if (!payload.email_lead) {
      return new Response(
        JSON.stringify({ success: false, error: 'email_lead é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Email do médico que respondeu (minúsculo e sem espaços)
    const medicoEmail = payload.email_lead.toLowerCase().trim();
    const conteudoResposta = payload.message_reply || '';
    const dataRecebida = payload.data_recebida || new Date().toISOString();

    console.log(`🔍 Buscando contato pelo email do médico: ${medicoEmail}`);

    // 1. Buscar o contato na tabela email_contatos pelo email do médico
    const { data: contato, error: contatoError } = await supabase
      .from('email_contatos')
      .select(`
        id,
        campanha_id,
        lead_id,
        nome,
        email,
        especialidade,
        uf,
        email_campanhas (
          id,
          nome,
          responsavel_id,
          responsavel_nome
        )
      `)
      .eq('email', medicoEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (contatoError || !contato) {
      console.log('⚠️ Contato não encontrado na tabela email_contatos');
      console.log('Email buscado:', medicoEmail);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Lead não encontrado para este email',
          email_buscado: medicoEmail
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Contato encontrado: ${contato.nome} (Campanha: ${contato.email_campanhas?.nome})`);

    // 2. Atualizar o status do contato para "respondido"
    const { error: updateContatoError } = await supabase
      .from('email_contatos')
      .update({
        status: 'respondido',
        data_resposta: dataRecebida
      })
      .eq('id', contato.id);

    if (updateContatoError) {
      console.error('❌ Erro ao atualizar status do contato:', updateContatoError);
    } else {
      console.log('✅ Status do contato atualizado para "respondido"');
    }

    // 3. Atualizar contador de respondidos na campanha
    const { data: campanha } = await supabase
      .from('email_campanhas')
      .select('respondidos')
      .eq('id', contato.campanha_id)
      .single();

    if (campanha) {
      await supabase
        .from('email_campanhas')
        .update({ respondidos: (campanha.respondidos || 0) + 1 })
        .eq('id', contato.campanha_id);
      console.log('✅ Contador de respondidos incrementado');
    }

    // 4. Buscar dados do médico se existir
    const { data: medico } = await supabase
      .from('medicos')
      .select('id, nome_completo, especialidade, estado')
      .eq('email', medicoEmail)
      .single();

    // 5. Registrar a resposta na tabela email_respostas (para histórico e auditoria)
    const { data: respostaInserida, error: insertError } = await supabase
      .from('email_respostas')
      .insert({
        disparo_log_id: null,
        disparo_programado_id: null,
        remetente_email: medicoEmail,
        remetente_nome: contato.nome || medicoEmail.split('@')[0],
        conteudo_resposta: conteudoResposta,
        status_lead: 'respondido',
        medico_id: medico?.id || null,
        especialidade: contato.especialidade || medico?.especialidade?.[0] || null,
        localidade: contato.uf || medico?.estado || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao inserir resposta em email_respostas:', insertError);
    } else {
      console.log('✅ Resposta registrada em email_respostas:', respostaInserida?.id);
    }

    // 5.1. Registrar na tabela email_interacoes (para exibição na aba Interações/Chat)
    const { error: interacaoError } = await supabase
      .from('email_interacoes')
      .insert({
        proposta_id: null, // Será linkado se disponível
        lead_id: contato.lead_id || null,
        email_destino: medicoEmail,
        nome_destino: contato.nome || medicoEmail.split('@')[0],
        direcao: 'recebido',
        assunto: 'Re: Oportunidade de Trabalho',
        corpo: conteudoResposta,
        status: 'respondido',
        enviado_por: null,
        enviado_por_nome: contato.nome || medicoEmail.split('@')[0],
        created_at: dataRecebida,
      });

    if (interacaoError) {
      console.error('❌ Erro ao inserir em email_interacoes:', interacaoError);
    } else {
      console.log('✅ Resposta registrada em email_interacoes (aba Interações)');
    }

    // 6. Atualizar captacao_leads se existir
    if (contato.lead_id) {
      const { error: updateLeadError } = await supabase
        .from('captacao_leads')
        .update({
          status: 'respondidos',
          ultima_resposta_recebida: conteudoResposta,
          data_ultimo_contato: dataRecebida,
          email_resposta_id: respostaInserida?.id || null
        })
        .eq('id', contato.lead_id);

      if (updateLeadError) {
        console.error('⚠️ Erro ao atualizar lead no Kanban:', updateLeadError);
      } else {
        console.log('✅ Lead movido para "Respondidos" no Kanban');
      }
    }

    // 7. Enviar notificação para o responsável da campanha
    const responsavelId = contato.email_campanhas?.responsavel_id;
    const campanhaName = contato.email_campanhas?.nome || 'Campanha';

    if (responsavelId) {
      console.log(`📬 Enviando notificação para o responsável: ${responsavelId}`);

      const { error: notifError } = await supabase
        .from('system_notifications')
        .insert({
          user_id: responsavelId,
          tipo: 'email_resposta',
          titulo: '📧 Nova resposta de email!',
          mensagem: `${contato.nome || medicoEmail} respondeu à campanha "${campanhaName}"`,
          link: '/disparos/email',
          referencia_id: contato.campanha_id,
          lida: false
        });

      if (notifError) {
        console.error('⚠️ Erro ao criar notificação:', notifError);
      } else {
        console.log('✅ Notificação enviada para o responsável');
      }
    } else {
      console.log('⚠️ Campanha sem responsável definido - notificação não enviada');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contato_id: contato.id,
        campanha_id: contato.campanha_id,
        lead_id: contato.lead_id,
        message: 'Resposta processada com sucesso. Lead marcado como respondido e notificação enviada.'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Erro ao processar resposta de email:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro desconhecido'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
