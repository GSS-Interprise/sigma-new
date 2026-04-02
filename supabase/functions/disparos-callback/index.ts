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
