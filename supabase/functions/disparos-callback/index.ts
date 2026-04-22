import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CallbackPayload {
  contato_id: string;
  status: '4-ENVIADO' | '5-NOZAP' | '2-REENVIAR' | '6-BLOQUEADORA';
  tipo_erro?: string;
  mensagem_enviada?: string;
  tentativas?: number;
}

interface BatchCallbackPayload {
  updates: CallbackPayload[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawPayload = await req.json();
    console.log('[disparos-callback] Raw payload recebido:', JSON.stringify(rawPayload));
    
    // Suporta múltiplos formatos de payload:
    // 1. { "body": { "updates": [...] } } - formato n8n com wrapper
    // 2. { "body": { "contato_id": "...", "status": "..." } } - n8n individual
    // 3. { "updates": [...] } - formato direto em lote
    // 4. { "contato_id": "...", "status": "..." } - formato direto individual
    const payload = rawPayload.body || rawPayload;
    const updates: CallbackPayload[] = payload.updates || [payload];
    
    console.log('[disparos-callback] Payload processado:', JSON.stringify(payload));
    console.log('[disparos-callback] Updates a processar:', updates.length);
    
    console.log('[disparos-callback] Recebido:', updates.length, 'atualizações');

    const campanhasAfetadas = new Set<string>();
    const resultados: { contato_id: string; success: boolean; error?: string }[] = [];

    for (const update of updates) {
      const { contato_id, status, tipo_erro, mensagem_enviada, tentativas } = update;

      if (!contato_id || !status) {
        resultados.push({ contato_id, success: false, error: 'contato_id e status são obrigatórios' });
        continue;
      }

      // Buscar contato para pegar campanha_id
      const { data: contato, error: fetchError } = await supabase
        .from('disparos_contatos')
        .select('campanha_id, tentativas')
        .eq('id', contato_id)
        .single();

      if (fetchError || !contato) {
        console.error('[disparos-callback] Contato não encontrado:', contato_id);
        resultados.push({ contato_id, success: false, error: 'Contato não encontrado' });
        continue;
      }

      campanhasAfetadas.add(contato.campanha_id);

      // Atualizar contato
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === '4-ENVIADO') {
        updateData.data_envio = new Date().toISOString();
      }

      // 5-NOZAP: marca o telefone como inativo no lead (não tem WhatsApp).
      // NÃO marca como contactado — em nova execução, gerar_disparo_zap usa o próximo número do lead.
      if (status === '5-NOZAP') {
        try {
          const { data: contatoNoZap } = await supabase
            .from('disparos_contatos')
            .select('lead_id, telefone_e164, telefone_original')
            .eq('id', contato_id)
            .single();

          let leadIdNoZap = contatoNoZap?.lead_id;
          if (!leadIdNoZap && contatoNoZap?.telefone_e164) {
            const { data: foundLeadId } = await supabase.rpc('find_lead_by_phone', { p_phone: contatoNoZap.telefone_e164 });
            if (foundLeadId) leadIdNoZap = foundLeadId;
          }

          if (leadIdNoZap) {
            const phonesToInactivate = [contatoNoZap?.telefone_e164, contatoNoZap?.telefone_original]
              .filter((p): p is string => !!p);

            if (phonesToInactivate.length > 0) {
              const { data: leadRow } = await supabase
                .from('leads')
                .select('telefones_inativos')
                .eq('id', leadIdNoZap)
                .single();

              const atual: string[] = (leadRow as any)?.telefones_inativos || [];
              const novo = Array.from(new Set([...atual, ...phonesToInactivate]));

              await supabase
                .from('leads')
                .update({ telefones_inativos: novo, updated_at: new Date().toISOString() })
                .eq('id', leadIdNoZap);

              console.log('[disparos-callback] Telefones marcados como inativos (NoZap):', phonesToInactivate, 'lead:', leadIdNoZap);
            }

            // Histórico: telefone sem WhatsApp
            await supabase
              .from('lead_historico')
              .insert({
                lead_id: leadIdNoZap,
                tipo_evento: 'telefone_sem_whatsapp',
                descricao: `Telefone marcado como sem WhatsApp via callback NoZap (campanha ${contato.campanha_id})`,
                dados_novos: {
                  contato_id,
                  campanha_id: contato.campanha_id,
                  telefones_inativados: phonesToInactivate,
                }
              });
          }
        } catch (nozapErr) {
          console.warn('[disparos-callback] Erro ao processar NoZap (não-crítico):', nozapErr);
        }
      }

      if (status === '4-ENVIADO') {

        // Vincular lead ao Acompanhamento quando disparo é confirmado
        try {
          const { data: contatoFull } = await supabase
            .from('disparos_contatos')
            .select('lead_id, telefone_e164, campanha_proposta_id')
            .eq('id', contato_id)
            .single();

          let leadId = contatoFull?.lead_id;

          // Fallback: se lead_id null, tentar encontrar por telefone
          if (!leadId && contatoFull?.telefone_e164) {
            const { data: foundLeadId } = await supabase.rpc('find_lead_by_phone', { p_phone: contatoFull.telefone_e164 });
            if (foundLeadId) {
              leadId = foundLeadId;
              // Atualizar o contato com o lead_id encontrado
              await supabase
                .from('disparos_contatos')
                .update({ lead_id: leadId })
                .eq('id', contato_id);
              console.log('[disparos-callback] Lead vinculado por telefone (fallback):', leadId);
            }
          }

          if (leadId) {
            const { data: leadData } = await supabase
              .from('leads')
              .select('status')
              .eq('id', leadId)
              .single();

            // Atualizar ultimo_disparo_em sempre
            await supabase
              .from('leads')
              .update({ ultimo_disparo_em: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', leadId);

            // Só mover para Acompanhamento se status atual é "Novo"
            if (leadData?.status === 'Novo') {
              await supabase
                .from('leads')
                .update({ status: 'Acompanhamento', updated_at: new Date().toISOString() })
                .eq('id', leadId);
              console.log('[disparos-callback] Lead atualizado para Acompanhamento:', leadId);
            } else {
              console.log('[disparos-callback] Lead já em status:', leadData?.status, '- não rebaixado');
            }

            // Marcar lead como "contactado por envio em massa":
            // 1) Insere no histórico de contatos (faz a vw_lead_status_por_proposta passar para 'contactado'
            //    e impede que o lead seja redisparado pela automação).
            try {
              const phoneForHist = contatoFull?.telefone_e164 || null;
              if (phoneForHist) {
                await supabase
                  .from('disparos_historico_contatos')
                  .insert({
                    telefone: phoneForHist,
                    ultima_campanha: contato.campanha_id,
                    ultimo_disparo: new Date().toISOString(),
                  });
              }
            } catch (histErr) {
              console.warn('[disparos-callback] Erro ao registrar disparos_historico_contatos:', histErr);
            }

            // Registrar no histórico
            await supabase
              .from('lead_historico')
              .insert({
                lead_id: leadId,
                tipo_evento: 'disparo_enviado',
                descricao: `Disparo confirmado como enviado (campanha ${contato.campanha_id})`,
                dados_novos: { contato_id, campanha_id: contato.campanha_id, status: '4-ENVIADO' }
              });

            // Histórico extra: marca como contactado por envio em massa (mesma semântica do botão manual)
            try {
              await supabase
                .from('lead_historico')
                .insert({
                  lead_id: leadId,
                  tipo_evento: 'contactado_envio_massa',
                  descricao: 'Lead contactado automaticamente via envio em massa (WhatsApp)',
                  dados_novos: {
                    contato_id,
                    campanha_id: contato.campanha_id,
                    campanha_proposta_id: contatoFull?.campanha_proposta_id ?? null,
                    canal: 'whatsapp',
                    origem: 'envio_em_massa',
                  }
                });
            } catch (hErr) {
              console.warn('[disparos-callback] Erro ao registrar contactado_envio_massa:', hErr);
            }

            // Vincular lead à conversa do SigZap automaticamente
            try {
              const phoneE164 = contatoFull?.telefone_e164;
              if (phoneE164) {
                // Normalizar telefone para buscar no sigzap_contacts (pode estar sem +)
                const phoneDigits = phoneE164.replace(/\D/g, '');
                const phoneVariants = [phoneE164, phoneDigits, '+' + phoneDigits];
                
                // Buscar contato do SigZap pelo telefone
                const { data: sigzapContacts } = await supabase
                  .from('sigzap_contacts')
                  .select('id, instance_id')
                  .or(phoneVariants.map(p => `contact_phone.eq.${p}`).join(','));

                if (sigzapContacts && sigzapContacts.length > 0) {
                  for (const sc of sigzapContacts) {
                    // Vincular lead_id nas conversas que ainda não têm lead vinculado
                    const { data: updatedConvs } = await supabase
                      .from('sigzap_conversations')
                      .update({ lead_id: leadId })
                      .eq('contact_id', sc.id)
                      .is('lead_id', null)
                      .select('id');

                    if (updatedConvs && updatedConvs.length > 0) {
                      console.log('[disparos-callback] Lead vinculado a', updatedConvs.length, 'conversa(s) SigZap:', updatedConvs.map(c => c.id));
                    }
                  }
                } else {
                  console.log('[disparos-callback] Nenhum contato SigZap encontrado para telefone:', phoneE164);
                }
              }
            } catch (sigzapErr) {
              console.warn('[disparos-callback] Erro ao vincular conversa SigZap (não-crítico):', sigzapErr);
            }

            // Atualizar has_whatsapp no lead
            await supabase
              .from('leads')
              .update({ has_whatsapp: true })
              .eq('id', leadId);
          }
        } catch (leadErr) {
          console.warn('[disparos-callback] Erro ao atualizar lead (não-crítico):', leadErr);
        }
      }

      if (status === '2-REENVIAR') {
        updateData.data_reenvio = new Date().toISOString();
        // Só auto-incrementa se tentativas não foi fornecido no payload
        if (tentativas === undefined || tentativas === null) {
          updateData.tentativas = (contato.tentativas || 0) + 1;
        }
      }

      if (tipo_erro) {
        updateData.tipo_erro = tipo_erro;
      }

      if (mensagem_enviada) {
        updateData.mensagem_enviada = mensagem_enviada;
      }

      // Se tentativas foi enviado no payload, usar esse valor (converter string para number)
      if (tentativas !== undefined && tentativas !== null) {
        const tentativasNum = typeof tentativas === 'string' ? parseInt(tentativas, 10) : Number(tentativas);
        if (!isNaN(tentativasNum)) {
          updateData.tentativas = tentativasNum;
        }
      }

      const { error: updateError } = await supabase
        .from('disparos_contatos')
        .update(updateData)
        .eq('id', contato_id);

      if (updateError) {
        console.error('[disparos-callback] Erro ao atualizar contato:', updateError);
        resultados.push({ contato_id, success: false, error: updateError.message });
      } else {
        resultados.push({ contato_id, success: true });
        console.log('[disparos-callback] Contato atualizado:', contato_id, '->', status);

        // REGRA: Se status é 6-BLOQUEADORA, resetar TODOS os outros contatos da campanha
        // (exceto 4-ENVIADO e 5-NOZAP) para 1-ENVIAR, pausar campanha e notificar responsável
        if (status === '6-BLOQUEADORA') {
          console.log('[disparos-callback] BLOQUEADORA detectada! Resetando contatos da campanha:', contato.campanha_id);
          
          // Buscar dados da campanha para notificação
          const { data: campanhaData } = await supabase
            .from('disparos_campanhas')
            .select('nome, responsavel_id, instancia')
            .eq('id', contato.campanha_id)
            .single();

          // Resetar todos os contatos que não são ENVIADO ou NOZAP para ENVIAR
          const { data: resetados, error: resetError } = await supabase
            .from('disparos_contatos')
            .update({ 
              status: '1-ENVIAR', 
              updated_at: new Date().toISOString() 
            })
            .eq('campanha_id', contato.campanha_id)
            .not('status', 'in', '("4-ENVIADO","5-NOZAP","6-BLOQUEADORA")')
            .select('id');

          if (resetError) {
            console.error('[disparos-callback] Erro ao resetar contatos:', resetError);
          } else {
            console.log('[disparos-callback] Contatos resetados para 1-ENVIAR:', resetados?.length || 0);
          }

          // Pausar a campanha para o captor saber que precisa trocar instância
          await supabase
            .from('disparos_campanhas')
            .update({ 
              status: 'pausado', 
              proximo_envio: null,
              updated_at: new Date().toISOString() 
            })
            .eq('id', contato.campanha_id);

          console.log('[disparos-callback] Campanha pausada devido a BLOQUEADORA');

          // Criar notificação para o responsável da campanha
          if (campanhaData?.responsavel_id) {
            const contatosResetados = resetados?.length || 0;
            
            await supabase
              .from('system_notifications')
              .insert({
                user_id: campanhaData.responsavel_id,
                tipo: 'disparo_bloqueado',
                titulo: '⚠️ Disparo Bloqueado!',
                mensagem: `A campanha "${campanhaData.nome || 'Sem nome'}" foi pausada. A instância ${campanhaData.instancia || 'WhatsApp'} foi restrita/bloqueada. ${contatosResetados} contatos foram resetados para reenvio. Conecte outro aparelho/WhatsApp para continuar.`,
                link: '/disparos/zap',
                referencia_id: contato.campanha_id,
                lida: false
              });

            console.log('[disparos-callback] Notificação enviada para:', campanhaData.responsavel_id);
          }
        }
      }
    }

    // Atualizar contadores das campanhas afetadas
    for (const campanha_id of campanhasAfetadas) {
      // Contar status de todos os contatos da campanha
      const { data: stats } = await supabase
        .from('disparos_contatos')
        .select('status')
        .eq('campanha_id', campanha_id);

      if (stats) {
        const enviados = stats.filter(s => s.status === '4-ENVIADO').length;
        const nozap = stats.filter(s => s.status === '5-NOZAP').length;
        const reenviar = stats.filter(s => s.status === '2-REENVIAR').length;
        const falhas = stats.filter(s => ['6-BLOQUEADORA', '7-ERRO'].includes(s.status)).length;
        // CORRIGIDO: Incluir todos os status que indicam contatos ainda não finalizados
        const pendentes = stats.filter(s => ['0-PENDENTE', '1-FILA', '1-ENVIAR'].includes(s.status)).length;
        const tratando = stats.filter(s => s.status === '3-TRATANDO').length;

        const updateCampanha: Record<string, unknown> = {
          enviados,
          nozap,
          reenviar,
          falhas,
          updated_at: new Date().toISOString()
        };

        // Só marca como concluída se NÃO houver: pendentes, reenviar ou tratando
        // Um disparo só está concluído quando todos os contatos têm status final (4-ENVIADO, 5-NOZAP, 6-BLOQUEADORA, 7-ERRO)
        if (pendentes === 0 && reenviar === 0 && tratando === 0) {
          updateCampanha.status = 'concluido';
        }

        await supabase
          .from('disparos_campanhas')
          .update(updateCampanha)
          .eq('id', campanha_id);

        console.log('[disparos-callback] Campanha atualizada:', campanha_id, { enviados, nozap, falhas, pendentes });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processados: resultados.length,
        resultados 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[disparos-callback] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
